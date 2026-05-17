(() => {
  const $ = s => document.querySelector(s);
  const $$ = s => [...document.querySelectorAll(s)];
  let token = localStorage.getItem('gt_admin_token') || null;
  let me = null;

  async function api(path, opts = {}) {
    const headers = Object.assign({ 'Content-Type': 'application/json' }, opts.headers || {});
    if (token) headers['x-auth'] = token;
    const r = await fetch('/api' + path, { ...opts, headers, body: opts.body ? JSON.stringify(opts.body) : undefined });
    if (r.status === 401) { logout(); return null; }
    return r.json();
  }

  function show(tab) {
    $$('.view').forEach(v => v.style.display = 'none');
    $$('.tab').forEach(b => b.classList.remove('active'));
    document.getElementById(tab).style.display = '';
    document.querySelector(`.tab[data-tab="${tab}"]`).classList.add('active');
    if (tab === 'dashboard') refreshDashboard();
    if (tab === 'players') refreshPlayers();
    if (tab === 'worlds') refreshWorlds();
    if (tab === 'bans') refreshBans();
    if (tab === 'audit') refreshAudit();
    if (tab === 'events') refreshEvents();
    if (tab === 'items') refreshItems();
    if (tab === 'economy') refreshEconomy();
    if (tab === 'users') refreshWebUsers();
  }

  $$('.tab').forEach(b => b.onclick = () => show(b.dataset.tab));

  async function login() {
    const r = await fetch('/api/login', { method: 'POST', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ username: $('#lUser').value, password: $('#lPass').value }) }).then(x => x.json());
    if (!r.ok) { $('#loginError').textContent = r.error || 'hata'; return; }
    token = r.token; localStorage.setItem('gt_admin_token', token);
    me = { username: r.username, role: r.role };
    enter();
  }
  $('#btnAdminLogin').onclick = login;

  function logout() {
    token = null; localStorage.removeItem('gt_admin_token');
    $('#login').style.display = ''; $('#panel').style.display = 'none';
  }
  $('#btnAdminLogout').onclick = async () => { await api('/logout', { method: 'POST' }); logout(); };

  async function enter() {
    const m = await api('/me'); if (!m) return;
    me = m.session;
    $('#meName').textContent = me.username;
    $('#meRole').textContent = me.role;
    $('#login').style.display = 'none'; $('#panel').style.display = '';
    show('dashboard');
    connectAdminWs();
    setInterval(refreshDashboard, 5000);
  }

  async function refreshDashboard() {
    const d = await api('/dashboard'); if (!d) return;
    $('#dOnline').textContent = d.online;
    $('#dTotal').textContent = d.totalPlayers;
    $('#dWorlds').textContent = d.worldCount;
    $('#dRam').textContent = d.memoryMB.rss + ' MB';
    $('#dUptime').textContent = fmtUp(d.uptimeMs);
    $('#dPot').textContent = d.lotteryPot + 'g';
    $('#dEvents').innerHTML = d.activeEvents.length ?
      d.activeEvents.map(e => `<div class="event-card active">${e.name} - ${Math.ceil(e.remaining / 60000)}dk</div>`).join('') :
      '<p class="muted">Su an aktif olay yok.</p>';
    const top = await api('/economy/top');
    if (top) $('#dTopRich').innerHTML = top.slice(0, 5).map(p => `<li>${p.name} - ${p.gems}g (lvl${p.level})</li>`).join('');
  }
  function fmtUp(ms) {
    const s = Math.floor(ms / 1000); const d = Math.floor(s / 86400);
    return `${d}g ${Math.floor((s % 86400) / 3600)}s ${Math.floor((s % 3600) / 60)}d`;
  }

  $('#btnBcast').onclick = async () => {
    await api('/broadcast', { method: 'POST', body: { text: $('#bcastText').value } });
    $('#bcastText').value = '';
  };

  // PLAYERS
  let lastSearch = '';
  async function refreshPlayers() {
    const q = $('#pSearch').value.trim();
    const online = $('#pOnline').checked ? '&online=1' : '';
    lastSearch = q;
    const list = await api('/players?q=' + encodeURIComponent(q) + online);
    if (!list) return;
    $('#playerTable').innerHTML = list.map(p => `
      <tr>
        <td>${p.name}</td><td>${p.role}</td><td>${p.level}</td><td>${p.gems}</td>
        <td>${p.world}</td><td>${p.online ? '<b style="color:#6cf09a">ON</b>' : '<span style="color:#99a2c1">off</span>'}</td>
        <td><button data-detail="${p.name}">Detay</button></td>
      </tr>`).join('');
    $$('#playerTable button[data-detail]').forEach(b => b.onclick = () => showPlayerDetail(b.dataset.detail));
  }
  $('#btnPSearch').onclick = refreshPlayers;
  $('#pSearch').addEventListener('keypress', e => { if (e.key === 'Enter') refreshPlayers(); });

  async function showPlayerDetail(name) {
    const p = await api('/players/' + encodeURIComponent(name));
    if (!p) return;
    $('#playerDetail').innerHTML = `
      <h4>${p.name} <small>${p.role}</small></h4>
      <p><b>Gems:</b> ${p.gems} | <b>Lvl:</b> ${p.level} (xp ${p.xp}) | <b>HP:</b> ${p.health} | <b>Dunya:</b> ${p.world}</p>
      <p><b>K:</b> ${p.stats.kills} <b>D:</b> ${p.stats.deaths} <b>Balik:</b> ${p.stats.fish} <b>Maden:</b> ${p.stats.mined} <b>Hasat:</b> ${p.stats.harvested}</p>
      <p><b>Warnlar:</b> ${p.warns} <b>Klan:</b> ${p.clan || '-'} <b>Unvan:</b> ${p.title || '-'}</p>
      <div class="inline">
        <button data-a="kick">Kick</button>
        <button data-a="warn">Warn</button>
        <button data-a="mute">Mute 10dk</button>
        <button data-a="unmute">Unmute</button>
        <button data-a="jail">Jail 30dk</button>
        <button data-a="unjail">Unjail</button>
        <button data-a="ban" class="danger">Ban kalici</button>
        <button data-a="unban">Unban</button>
      </div>
      <div class="inline">
        <label>Rol:</label>
        <select id="setRole"><option>player</option><option>vip</option><option>helper</option><option>mod</option><option>admin</option><option>owner</option></select>
        <button data-a="setrole-go">Ayarla</button>
        <input id="setGems" placeholder="Gems">
        <button data-a="setgems-go">Gems Ayarla</button>
        <input id="addGems" placeholder="Ekle">
        <button data-a="addgems-go">Gem Ekle</button>
        <input id="setLvl" placeholder="Lvl">
        <button data-a="setlevel-go">Lvl Ayarla</button>
        <button data-a="reset" class="danger">Resetle</button>
      </div>
      <p><b>Envanter:</b> ${Object.entries(p.inventory).map(([id, q]) => `#${id} x${q}`).join(', ') || 'bos'}</p>
    `;
    const callAction = async (action, value, mins) => {
      const r = await api('/players/' + encodeURIComponent(name) + '/action', { method: 'POST', body: { action, value, mins } });
      if (r && r.ok) { showPlayerDetail(name); refreshPlayers(); }
      else alert(r && r.error || 'hata');
    };
    $$('#playerDetail [data-a]').forEach(b => {
      b.onclick = () => {
        const a = b.dataset.a;
        if (a === 'setrole-go') callAction('setrole', $('#setRole').value);
        else if (a === 'setgems-go') callAction('setgems', $('#setGems').value);
        else if (a === 'addgems-go') callAction('addgems', $('#addGems').value);
        else if (a === 'setlevel-go') callAction('setlevel', $('#setLvl').value);
        else if (a === 'reset') { if (confirm('Oyuncuyu sifirla?')) callAction('reset'); }
        else if (a === 'mute') callAction('mute', null, 10);
        else if (a === 'jail') callAction('jail', null, 30);
        else if (a === 'ban') { if (confirm('Kalici ban?')) callAction('ban', null, null); }
        else callAction(a);
      };
    });
  }

  // WORLDS
  async function refreshWorlds() {
    const list = await api('/worlds'); if (!list) return;
    $('#worldTable').innerHTML = list.map(w => `
      <tr>
        <td>${w.name}</td><td>${w.owner}</td><td>${w.visits}</td><td>${w.players.length}</td>
        <td>${w.blocks}</td><td>${w.special || '-'}</td>
        <td>${w.owner === 'SYSTEM' ? '' : '<button data-w="' + w.name + '" class="danger">Sil</button>'}</td>
      </tr>`).join('');
    $$('#worldTable button[data-w]').forEach(b => b.onclick = async () => {
      if (!confirm('Dunyayi sil: ' + b.dataset.w + '?')) return;
      await api('/worlds/' + b.dataset.w, { method: 'DELETE' });
      refreshWorlds();
    });
  }
  $('#btnWNew').onclick = async () => {
    await api('/worlds', { method: 'POST', body: { name: $('#wNew').value } });
    $('#wNew').value = ''; refreshWorlds();
  };

  // BANS
  async function refreshBans() {
    const b = await api('/bans'); if (!b) return;
    $('#banTable').innerHTML = b.banned.map(x => `<tr><td>${x.name}</td><td>${x.by}</td><td>${x.reason || '-'}</td><td>${x.until ? new Date(x.until).toLocaleString() : 'kalici'}</td></tr>`).join('');
    $('#muteTable').innerHTML = b.muted.map(x => `<tr><td>${x.name}</td><td>${x.by}</td><td>${x.reason || '-'}</td><td>${new Date(x.until).toLocaleString()}</td></tr>`).join('');
  }

  // AUDIT
  async function refreshAudit() {
    const a = await api('/audit?n=200'); if (!a) return;
    $('#auditTable').innerHTML = a.map(e => `<tr><td>${new Date(e.ts).toLocaleTimeString()}</td><td><b>${e.action}</b></td><td>${e.by}</td><td>${e.target || '-'}</td><td><code>${JSON.stringify(e.detail || {})}</code></td></tr>`).join('');
  }

  // EVENTS
  async function refreshEvents() {
    const d = await api('/events'); if (!d) return;
    const active = new Set(d.active.map(a => a.id));
    $('#eventGrid').innerHTML = d.all.map(e => `
      <div class="event-card ${active.has(e.id) ? 'active' : ''}">
        <h4>${e.name}</h4>
        <p class="muted">${e.id} | sure: ${Math.round(e.dur / 60000)}dk</p>
        ${active.has(e.id) ? '<button data-stop="' + e.id + '" class="danger">Durdur</button>' : '<button data-start="' + e.id + '">Baslat</button>'}
      </div>`).join('');
    $$('#eventGrid [data-start]').forEach(b => b.onclick = async () => { await api('/events/' + b.dataset.start + '/start', { method: 'POST' }); refreshEvents(); });
    $$('#eventGrid [data-stop]').forEach(b => b.onclick = async () => { await api('/events/' + b.dataset.stop + '/stop', { method: 'POST' }); refreshEvents(); });
  }

  // ITEMS
  async function refreshItems() {
    const list = await api('/items'); if (!list) return;
    window._items = list;
    const q = $('#itemSearch').value.toLowerCase();
    const filtered = q ? list.filter(i => i.name.toLowerCase().includes(q)) : list;
    $('#itemTable').innerHTML = filtered.map(i => `<tr><td>${i.id}</td><td>${i.name}</td><td>${i.category}</td><td>${i.rarity}</td><td>${i.value}g</td></tr>`).join('');
  }
  $('#itemSearch').addEventListener('input', refreshItems);

  // ECONOMY
  async function refreshEconomy() {
    const top = await api('/economy/top'); if (!top) return;
    $('#topRich').innerHTML = top.map(p => `<li>${p.name} - ${p.gems}g (lvl${p.level})</li>`).join('');
  }

  // CONSOLE
  $('#consoleForm').onsubmit = async (e) => {
    e.preventDefault();
    const line = $('#consoleIn').value.trim(); if (!line) return;
    const out = $('#consoleOut');
    out.textContent += '\n> ' + line;
    const r = await api('/console', { method: 'POST', body: { line } });
    if (r && r.text) out.textContent += '\n' + r.text;
    out.scrollTop = out.scrollHeight;
    $('#consoleIn').value = '';
  };

  // WEB USERS
  async function refreshWebUsers() {
    const list = await api('/webusers'); if (!list) return;
    $('#wuTable').innerHTML = list.map(u => `<tr><td>${u.username}</td><td>${u.role}</td><td>${new Date(u.createdAt).toLocaleDateString()}</td>
      <td>${u.username === 'admin' ? '' : '<button data-del="' + u.username + '" class="danger">Sil</button>'}</td></tr>`).join('');
    $$('#wuTable button[data-del]').forEach(b => b.onclick = async () => { await api('/webusers/' + b.dataset.del, { method: 'DELETE' }); refreshWebUsers(); });
  }
  $('#btnWuAdd').onclick = async () => {
    await api('/webusers', { method: 'POST', body: { username: $('#wuName').value, password: $('#wuPass').value, role: $('#wuRole').value } });
    $('#wuName').value = ''; $('#wuPass').value = ''; refreshWebUsers();
  };

  // ACCOUNT
  $('#btnChangePass').onclick = async () => {
    const r = await api('/change-password', { method: 'POST', body: { newPassword: $('#newPass').value } });
    $('#passResult').textContent = r && r.ok ? 'Sifre degistirildi.' : (r && r.error) || 'hata';
  };

  // Admin WS - canli sohbet ve log
  function connectAdminWs() {
    const proto = location.protocol === 'https:' ? 'wss' : 'ws';
    const ws = new WebSocket(`${proto}://${location.host}/wsadmin?token=${token}`);
    ws.onmessage = (e) => {
      const m = JSON.parse(e.data);
      if (m.kind === 'chat') {
        const el = $('#chatLive'); if (!el) return;
        const div = document.createElement('div'); div.className = 'l ' + (m.entry.type === 'system' ? 'sys' : '');
        div.textContent = `[${new Date(m.entry.ts).toLocaleTimeString()}] ${formatLive(m.entry)}`;
        el.appendChild(div); el.scrollTop = el.scrollHeight;
      } else if (m.kind === 'log') {
        const el = $('#logStream'); if (!el) return;
        const div = document.createElement('div'); div.textContent = m.line;
        el.appendChild(div); el.scrollTop = el.scrollHeight;
        while (el.children.length > 500) el.removeChild(el.firstChild);
      }
    };
    ws.onclose = () => setTimeout(connectAdminWs, 3000);
  }
  function formatLive(e) {
    if (e.type === 'system') return e.text;
    if (e.type === 'pm') return `[${e.from}->${e.to}] ${e.text}`;
    if (e.type === 'shout') return `*** ${e.player}: ${e.text} ***`;
    return `${e.player}: ${e.text}`;
  }

  if (token) enter();
})();
