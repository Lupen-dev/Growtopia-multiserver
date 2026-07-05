// Growtopia dunya binary serilestirme (SEND_MAP_DATA, tank type 4).
//
// Format GrowServer'in world-pack v20 (0x14) yerlesimi ile uyumludur:
//   u16 version(20) | u32 flags(64) | u16 nameLen | name
//   u32 width | u32 height | u32 tileCount | 5 bayt sifir (v20 bilinmeyeni)
//   tile basina: u32 (fg | bg<<16) | u16 lockIndex | u16 flags [+ extra]
//   12 bayt sifir | u32 dropCount | u32 lastDropUid
//   u16 baseWeather | u16 0 | u32 currentWeather? (12 bayt hava bolumu)
//
// Tile extra tipleri (flags & 0x1 ise): 1 = kapi (label + u8), 2 = tabela.
const TILE_FLAG_EXTRA = 0x1;
const EXTRA_DOOR = 1;

const GT = {
  BLANK: 0, DIRT: 2, LAVA: 4, MAIN_DOOR: 6, BEDROCK: 8,
  DOOR: 10, CAVE_BG: 14, FIST: 18, SIGN: 20, WRENCH: 32
};

// Dunya nesnesine tile dizileri ekler (yoksa uretir).
// Duz GT dunyasi: ustte hava, yuzeyden asagi toprak + magara arkaplani,
// en altta bedrock, spawn noktasinda ana kapi.
function ensureTiles(world) {
  const W = world.width, H = world.height;
  if (Array.isArray(world.fg) && world.fg.length === W * H &&
      Array.isArray(world.bg) && world.bg.length === W * H) return world;

  const fg = new Array(W * H).fill(GT.BLANK);
  const bg = new Array(W * H).fill(GT.BLANK);
  const surfaceY = Math.floor(H / 2);          // 30 yukseklikte y=15
  const doorX = (world.spawn && world.spawn.x) || Math.floor(W / 2);

  for (let y = surfaceY; y < H; y++) {
    for (let x = 0; x < W; x++) {
      const i = y * W + x;
      bg[i] = GT.CAVE_BG;
      fg[i] = (y >= H - 2) ? GT.BEDROCK : GT.DIRT;
    }
  }
  // Ana kapi yuzeyin hemen ustunde, altinda bedrock
  fg[(surfaceY - 1) * W + doorX] = GT.MAIN_DOOR;
  fg[surfaceY * W + doorX] = GT.BEDROCK;

  world.fg = fg;
  world.bg = bg;
  world.spawn = { x: doorX, y: surfaceY - 1 };
  return world;
}

function tileIndex(world, x, y) {
  if (x < 0 || y < 0 || x >= world.width || y >= world.height) return -1;
  return y * world.width + x;
}

// Dunyayi GT world-pack binary formatina cevirir.
function serialize(world) {
  ensureTiles(world);
  const name = String(world.name).toUpperCase();
  const W = world.width, H = world.height, count = W * H;

  const chunks = [];
  // --- Baslik ---
  const header = Buffer.alloc(2 + 4 + 2 + name.length + 4 + 4 + 4 + 5);
  let o = 0;
  o = header.writeUInt16LE(20, o);            // world-pack versiyonu
  o = header.writeUInt32LE(64, o);            // flags
  o = header.writeUInt16LE(name.length, o);
  o += header.write(name, o, 'latin1');
  o = header.writeUInt32LE(W, o);
  o = header.writeUInt32LE(H, o);
  o = header.writeUInt32LE(count, o);
  // + 5 bayt sifir (v20 bilinmeyen alani) - alloc zaten sifirladi
  chunks.push(header);

  // --- Tile'lar ---
  for (let i = 0; i < count; i++) {
    const fg = world.fg[i] || 0;
    const bg = world.bg[i] || 0;
    let flags = 0;
    let extra = null;

    if (fg === GT.MAIN_DOOR) {
      flags |= TILE_FLAG_EXTRA;
      const label = 'EXIT';
      extra = Buffer.alloc(1 + 2 + label.length + 1);
      extra.writeUInt8(EXTRA_DOOR, 0);
      extra.writeUInt16LE(label.length, 1);
      extra.write(label, 3, 'latin1');
      // son bayt: kapi kilit durumu (0 = acik)
    }

    const tile = Buffer.alloc(8);
    tile.writeUInt32LE((fg | (bg << 16)) >>> 0, 0);
    tile.writeUInt16LE(0, 4);                 // lock index
    tile.writeUInt16LE(flags, 6);
    chunks.push(extra ? Buffer.concat([tile, extra]) : tile);
  }

  // --- Dusen esyalar + hava ---
  const tail = Buffer.alloc(12 + 8 + 12);
  // 12 bayt sifir (v20 bilinmeyen bolumu)
  tail.writeUInt32LE(0, 12);                  // dropped item sayisi
  tail.writeUInt32LE(0, 16);                  // son drop uid
  tail.writeUInt16LE(4, 20);                  // taban hava durumu (4 = gunes)
  tail.writeUInt16LE(0, 22);
  tail.writeUInt32LE(4, 24);                  // aktif hava durumu
  tail.writeUInt32LE(0, 28);
  chunks.push(tail);

  return Buffer.concat(chunks);
}

// Tile degisim istegini dunyaya uygular.
// Doner: { ok, broken?, placed?, x, y } veya { ok: false }
function applyTileChange(world, x, y, itemId, gtItems) {
  ensureTiles(world);
  const i = tileIndex(world, x, y);
  if (i === -1) return { ok: false };
  if (!world._damage) world._damage = new Map();

  // Yumruk (fist)
  if (itemId === GT.FIST) {
    const target = world.fg[i] !== GT.BLANK ? 'fg' : (world.bg[i] !== GT.BLANK ? 'bg' : null);
    if (!target) return { ok: false };
    const id = world[target][i];
    if (gtItems.isUnbreakable(id)) return { ok: false };
    const key = target + ':' + i;
    const dmg = (world._damage.get(key) || 0) + 1;
    if (dmg >= gtItems.breakHitsOf(id)) {
      world[target][i] = GT.BLANK;
      world._damage.delete(key);
      return { ok: true, broken: id, x, y };
    }
    world._damage.set(key, dmg);
    // 4 saniye vurulmazsa hasar sifirlanir (GT reset davranisi)
    const timers = world._dmgTimers || (world._dmgTimers = new Map());
    clearTimeout(timers.get(key));
    timers.set(key, setTimeout(() => { world._damage.delete(key); timers.delete(key); }, 4000));
    return { ok: true, damaged: id, damage: dmg, x, y };
  }

  if (itemId === GT.WRENCH) return { ok: false };

  // Blok yerlestirme
  const info = gtItems.get(itemId);
  if (!info) return { ok: false };
  if (gtItems.isBackground(itemId)) {
    if (world.bg[i] !== GT.BLANK) return { ok: false };
    world.bg[i] = itemId;
  } else {
    if (world.fg[i] !== GT.BLANK) return { ok: false };
    world.fg[i] = itemId;
  }
  return { ok: true, placed: itemId, x, y };
}

module.exports = { serialize, ensureTiles, applyTileChange, tileIndex, GT };
