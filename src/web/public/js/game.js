(() => {
  const $ = s => document.querySelector(s);
  const log = $('#chatLog');
  const cv = $('#canvas');
  const ctx = cv.getContext('2d');
  let ws = null, me = null, world = null, players = {};
  const keys = {};

  function append(text, cls) {
    const d = document.createElement('div');
    d.className = 'msg ' + (cls || '');
    d.textContent = text;
    log.appendChild(d);
    log.scrollTop = log.scrollHeight;
  }

  function setStats(p) {
    if (!p) return;
    $('#hName').textContent = p.name;
    $('#hLvl').textContent = p.level;
    $('#hXp').textContent = p.xp;
    $('#hGems').textContent = p.gems;
    $('#hHp').textContent = p.health;
    $('#hWorld').textContent = p.world;
    if (p.inventory) renderInv(p.inventory);
  }

  function renderInv(inv) {
    const ul = $('#invList'); ul.innerHTML = '';
    for (const [id, q] of Object.entries(inv)) {
      const li = document.createElement('li');
      li.innerHTML = `<span>#${id}</span><b>x${q}</b>`;
      ul.appendChild(li);
    }
  }

  function connect() {
    const proto = location.protocol === 'https:' ? 'wss' : 'ws';
    ws = new WebSocket(`${proto}://${location.host}/play`);
    ws.onopen = () => append('Sunucuya baglandi.', 'sys');
    ws.onmessage = (e) => handle(JSON.parse(e.data));
    ws.onclose = () => { append('Baglanti koptu, yeniden baglaniyor...', 'err'); setTimeout(connect, 2000); };
  }

  function handle(m) {
    if (m.type === 'hello') append('Hosgeldin! ' + (m.motd || ''), 'sys');
    else if (m.type === 'login_ok') {
      me = m.player; setStats(me); $('#auth').style.display = 'none'; $('#game').style.display = 'flex';
      append('Giris basarili. /help yaz.', 'ok');
    } else if (m.type === 'register_ok') { $('#authError').textContent = 'Kayit basarili, simdi giris yap.'; }
    else if (m.type === 'login_error' || m.type === 'register_error') { $('#authError').textContent = m.error; }
    else if (m.type === 'motd') { append('MOTD: ' + m.text, 'sys'); }
    else if (m.type === 'world') {
      world = m.world; $('#hWorld').textContent = world.name;
      append(`-- ${world.name} --`, 'sys');
      players = {};
    }
    else if (m.type === 'chat') {
      let cls = '';
      if (m.entry) m = m.entry;
      if (m.type === 'system') cls = 'sys';
      else if (m.type === 'pm') cls = 'pm';
      else if (m.type === 'shout') cls = 'shout';
      else if (m.type === 'modchat') cls = 'sys';
      append(formatChat(m), cls);
    } else if (m.type === 'cmdresult') {
      append(m.text || '', m.text && m.text.startsWith('hata') ? 'err' : 'ok');
    } else if (m.type === 'move') {
      players[m.name] = { x: m.x, y: m.y };
      if (me && m.name === me.name) { me.x = m.x; me.y = m.y; }
    } else if (m.type === 'announce' || m.type === 'bigannounce') {
      append('* ' + m.text, 'shout');
    }
  }

  function formatChat(m) {
    if (m.type === 'system') return m.text;
    if (m.type === 'pm') return `[${m.from}->${m.to}] ${m.text}`;
    if (m.type === 'emote' || m.type === 'flex') return m.text;
    if (m.type === 'shout') return `*** ${m.player}: ${m.text} ***`;
    if (m.type === 'modchat') return `[Mod] ${m.player}: ${m.text}`;
    return `${m.tag || ''}${m.player}: ${m.text}`;
  }

  function send(o) { if (ws && ws.readyState === 1) ws.send(JSON.stringify(o)); }

  $('#btnLogin').onclick = () => {
    const u = $('#username').value.trim(), p = $('#password').value;
    if (!u || !p) return;
    connect();
    setTimeout(() => send({ type: 'login', name: u, password: p }), 300);
  };
  $('#btnRegister').onclick = () => {
    const u = $('#username').value.trim(), p = $('#password').value;
    if (!u || !p) return;
    if (!ws) connect();
    setTimeout(() => send({ type: 'register', name: u, password: p }), 300);
  };
  $('#btnLogout').onclick = () => { ws && ws.close(); location.reload(); };

  $('#chatForm').onsubmit = (e) => {
    e.preventDefault();
    const v = $('#chatInput').value.trim(); if (!v) return;
    send({ type: 'chat', text: v });
    $('#chatInput').value = '';
  };

  // basit hareket
  window.addEventListener('keydown', e => { keys[e.key.toLowerCase()] = true; });
  window.addEventListener('keyup', e => { keys[e.key.toLowerCase()] = false; });
  setInterval(() => {
    if (!me) return;
    let dx = 0, dy = 0;
    if (keys['a'] || keys['arrowleft']) dx -= 1;
    if (keys['d'] || keys['arrowright']) dx += 1;
    if (keys['w'] || keys['arrowup']) dy -= 1;
    if (keys['s'] || keys['arrowdown']) dy += 1;
    if (dx || dy) {
      me.x = Math.max(0, Math.min(60, me.x + dx));
      me.y = Math.max(0, Math.min(30, me.y + dy));
      send({ type: 'move', x: me.x, y: me.y });
    }
  }, 120);

  // render
  function draw() {
    if (!world) { requestAnimationFrame(draw); return; }
    const W = cv.width, H = cv.height;
    const cw = W / (world.width || 60), ch = H / (world.height || 30);
    ctx.fillStyle = '#1a2238'; ctx.fillRect(0, 0, W, H);
    // izgara
    ctx.strokeStyle = '#23304d';
    for (let x = 0; x <= world.width; x++) { ctx.beginPath(); ctx.moveTo(x * cw, 0); ctx.lineTo(x * cw, H); ctx.stroke(); }
    for (let y = 0; y <= world.height; y++) { ctx.beginPath(); ctx.moveTo(0, y * ch); ctx.lineTo(W, y * ch); ctx.stroke(); }
    // bloklar
    for (const b of world.blocks || []) {
      const palette = ['#a06b3b', '#888', '#ff6633', '#9c6633', '#444', '#cca85a'];
      ctx.fillStyle = palette[(b.item || 1) % palette.length];
      ctx.fillRect(b.x * cw, b.y * ch, cw - 1, ch - 1);
    }
    // diger oyuncular
    for (const [name, p] of Object.entries(players)) {
      ctx.fillStyle = name === (me && me.name) ? '#6cf09a' : '#6cd0ff';
      ctx.fillRect(p.x * cw, p.y * ch, cw, ch);
      ctx.fillStyle = '#fff'; ctx.font = '11px sans-serif';
      ctx.fillText(name, p.x * cw, p.y * ch - 2);
    }
    if (me) {
      ctx.fillStyle = '#fff'; ctx.fillRect(me.x * cw, me.y * ch, cw, ch);
      ctx.fillStyle = '#6cf09a'; ctx.fillRect(me.x * cw + 2, me.y * ch + 2, cw - 4, ch - 4);
      ctx.fillStyle = '#fff'; ctx.font = '11px sans-serif'; ctx.fillText(me.name, me.x * cw, me.y * ch - 2);
    }
    requestAnimationFrame(draw);
  }
  draw();

  // periyodik veriler
  setInterval(async () => {
    if (!me) return;
    // basit: /stats ile guncelle
  }, 5000);
})();
