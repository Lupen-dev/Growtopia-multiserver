// Gercek Growtopia istemcisi icin items.dat yonetimi.
//
// Oncelik sirasi:
//   1) assets/items.dat  (gercek istemciden alinan dosya - tam uyumluluk)
//   2) config.network.itemsDatPath ile verilen ozel yol
//   3) Minimal items.dat uretimi (growtopia.js ItemsDat encoder, versiyon 21)
//
// Uretilen fallback dosya gercek istemcinin 14k+ esyasini icermez; yalnizca
// dunya uretimi icin gereken cekirdek esyalari tanimlar. Gercek istemci
// tam uyumlulugu icin assets/items.dat koyulmasi gerekir (bkz. docs/GT_CLIENT_SETUP.md).
const fs = require('fs');
const path = require('path');
const { ItemsDat } = require('growtopia.js');

// GT'nin klasik "proton" hash'i - istemci items.dat dogrulamasinda kullanir.
function protonHash(buf) {
  let hash = 0x55555555;
  for (let i = 0; i < buf.length; i++) {
    hash = (((hash >>> 27) + (hash << 5)) + buf[i]) >>> 0;
  }
  return hash >>> 0;
}

// GT items.dat action tipleri (GrowServer ActionTypes ile ayni)
const ACTION = {
  FIST: 0, WRENCH: 1, DOOR: 2, LOCK: 3, GEMS: 4, TREASURE: 5,
  DEADLY_BLOCK: 6, TRAMPOLINE: 7, CONSUMABLE: 8, GATEWAY: 9, SIGN: 10,
  MAIN_DOOR: 13, PLATFORM: 14, BEDROCK: 15, PAIN_BLOCK: 16,
  FOREGROUND: 17, BACKGROUND: 18, SEED: 19, CLOTHES: 20
};

// Cekirdek esyalar - gercek GT id'leri ile birebir ayni (cift id = esya, tek id = tohum).
// breakHits: kirilmasi icin gereken yumruk sayisi. collision: 1 = kati.
const CORE_ITEMS = [
  { id: 0,  name: 'Blank',           type: ACTION.FIST,       collision: 0, breakHits: 0 },
  { id: 2,  name: 'Dirt',            type: ACTION.FOREGROUND, collision: 1, breakHits: 4, texture: 'tiles_page1.rttex' },
  { id: 4,  name: 'Lava',            type: ACTION.PAIN_BLOCK, collision: 1, breakHits: 6, texture: 'tiles_page1.rttex' },
  { id: 6,  name: 'Main Door',       type: ACTION.MAIN_DOOR,  collision: 0, breakHits: 0, texture: 'tiles_page1.rttex' },
  { id: 8,  name: 'Bedrock',         type: ACTION.BEDROCK,    collision: 1, breakHits: 0, texture: 'tiles_page1.rttex' },
  { id: 10, name: 'Door',            type: ACTION.DOOR,       collision: 0, breakHits: 8, texture: 'tiles_page1.rttex' },
  { id: 14, name: 'Cave Background', type: ACTION.BACKGROUND, collision: 0, breakHits: 4, texture: 'tiles_page1.rttex' },
  { id: 18, name: 'Fist',            type: ACTION.FIST,       collision: 0, breakHits: 0 },
  { id: 20, name: 'Sign',            type: ACTION.SIGN,       collision: 0, breakHits: 8, texture: 'tiles_page1.rttex' },
  { id: 32, name: 'Wrench',          type: ACTION.WRENCH,     collision: 0, breakHits: 0 }
];

// growtopia.js ItemsDat encoder'i tum alanlarin tanimli olmasini bekler;
// eksik sayisal alan Buffer.write* katmaninda hata firlatir. Bu yuzden
// her esyayi tam bir iskelete oturturuz. (versiyon 21 alan seti)
function normalizeItem(def) {
  return {
    id: def.id, flags: def.flags || 0, flagsCategory: 0,
    type: def.type || 0, materialType: 0,
    name: def.name || '', texture: def.texture || '', textureHash: 0,
    visualEffectType: 0, flags2: 0, textureX: 0, textureY: 0,
    storageType: 0, isStripeyWallpaper: 0,
    collisionType: def.collision || 0, breakHits: def.breakHits || 0,
    resetStateAfter: 0, bodyPartType: 0, rarity: 999, maxAmount: 200,
    extraFile: '', extraFileHash: 0, audioVolume: 0,
    petName: '', petPrefix: '', petSuffix: '', petAbility: '',
    seedBase: 0, seedOverlay: 0, treeBase: 0, treeLeaves: 0,
    seedColor: 0, seedOverlayColor: 0, ingredient: 0, growTime: 0,
    flags3: 0, isRayman: 0,
    extraOptions: '', texture2: '', extraOptions2: '',
    extraBytes: Buffer.alloc(80),
    punchOptions: '', flags4: 0, bodyPart: Buffer.alloc(9), flags5: 0,
    unknownInt1: 0, unknownBytes1: Buffer.alloc(25), extraTexture: '',
    itemRenderer: '', extraFlags1: 0, extraHash1: 0,
    unknownBytes2: Buffer.alloc(9), unknownShort1: 0
  };
}

// Tek id'ye tohum esligi uret (GT'de tek id'ler tohumdur)
function seedFor(def) {
  const s = normalizeItem({ id: def.id + 1, name: def.name + ' Seed', type: ACTION.SEED });
  s.maxAmount = 200;
  return s;
}

class GTItems {
  constructor(ctx) {
    this.ctx = ctx;
    this.log = ctx.logger.child('gtitems');
    this.content = null;   // Ham items.dat baytlari (istemciye gonderilir)
    this.hash = 0;         // Proton hash (OnSuperMain ilk parametresi)
    this.source = 'none';  // 'file' | 'generated'
    this.info = new Map(); // id -> { type, collision, breakHits, name }
    for (const it of CORE_ITEMS) {
      this.info.set(it.id, { type: it.type, collision: it.collision, breakHits: it.breakHits, name: it.name });
    }
  }

  async load() {
    const ROOT = path.resolve(__dirname, '..', '..');
    const candidates = [
      this.ctx.config.network && this.ctx.config.network.itemsDatPath,
      path.join(ROOT, 'assets', 'items.dat'),
      path.join(ROOT, 'data', 'items.dat')
    ].filter(Boolean);

    for (const p of candidates) {
      try {
        if (fs.existsSync(p)) {
          this.content = fs.readFileSync(p);
          this.hash = protonHash(this.content);
          this.source = 'file';
          this.log.success(`items.dat yuklendi: ${p} (${this.content.length} bayt, hash=${this.hash})`);
          await this.indexRealFile();
          return this;
        }
      } catch (e) {
        this.log.warn(`items.dat okunamadi (${p}): ${e.message}`);
      }
    }

    // Fallback: minimal items.dat uret
    const dat = new ItemsDat(Buffer.alloc(0));
    dat.meta.version = 21;
    const items = [];
    for (const def of CORE_ITEMS) {
      items.push(normalizeItem(def));
      // Sadece blok/tohumlanabilir esyalara tohum ekle (id+1 cakismasin diye kontrol)
      if (def.id % 2 === 0 && !CORE_ITEMS.some(x => x.id === def.id + 1) &&
          [ACTION.FOREGROUND, ACTION.BACKGROUND, ACTION.PAIN_BLOCK, ACTION.DOOR, ACTION.SIGN].includes(def.type)) {
        items.push(seedFor(def));
      }
    }
    items.sort((a, b) => a.id - b.id);
    dat.meta.items = items;
    await dat.encode();
    this.content = dat.data;
    this.hash = protonHash(this.content);
    this.source = 'generated';
    this.log.warn('assets/items.dat bulunamadi - minimal items.dat uretildi ' +
      `(${items.length} esya, ${this.content.length} bayt, hash=${this.hash}).`);
    this.log.warn('Gercek GT istemcisi tam uyumlulugu icin assets/items.dat koy (docs/GT_CLIENT_SETUP.md).');
    return this;
  }

  // Gercek items.dat dosyasindan tile mantigi icin gereken alanlari cikar.
  async indexRealFile() {
    try {
      const dat = new ItemsDat(Buffer.from(this.content));
      await dat.decode();
      this.info.clear();
      for (const it of dat.meta.items) {
        this.info.set(it.id, {
          type: it.type,
          collision: it.collisionType,
          breakHits: it.breakHits,
          name: it.name
        });
      }
      this.log.info(`items.dat cozuldu: v${dat.meta.version}, ${dat.meta.items.length} esya indekslendi`);
    } catch (e) {
      this.log.warn('items.dat decode edilemedi, cekirdek esya tablosu kullanilacak: ' + e.message);
    }
  }

  get(id) { return this.info.get(Number(id)); }
  isBackground(id) { const i = this.get(id); return !!i && i.type === ACTION.BACKGROUND; }
  isUnbreakable(id) {
    const i = this.get(id);
    return !i || [ACTION.MAIN_DOOR, ACTION.BEDROCK].includes(i.type);
  }
  breakHitsOf(id) { const i = this.get(id); return (i && i.breakHits) || 4; }
}

GTItems.ACTION = ACTION;
GTItems.protonHash = protonHash;
module.exports = GTItems;
