(() => {
  const $ = s => document.querySelector(s);
  const path = location.pathname;
  const params = new URLSearchParams(location.search);
  let token = localStorage.getItem('gt_player_token') || params.get('token') || null;
  if (params.get('token')) localStorage.setItem('gt_player_token', params.get('token'));

  async function api(p, opts = {}) {
    const h = { 'Content-Type': 'application/json' };
    if (token) h['x-player-token'] = token;
    const r = await fetch('/api/account' + p, { ...opts, headers: h, body: opts.body ? JSON.stringify(opts.body) : undefined });
    return r.json().catch(() => ({ ok: false, error: 'sunucu yaniti okunamadi' }));
  }

  // LOGIN
  if (path === '/login' || path.endsWith('/login.html')) {
    const returnTo = params.get('return') || params.get('redirect') || '';
    if (returnTo) $('#returnTo').value = returnTo;
    $('#loginForm').addEventListener('submit', async e => {
      e.preventDefault();
      $('#err').textContent = ''; $('#ok').textContent = '';
      const r = await api('/login', { method: 'POST',
        body: { username: $('#username').value.trim(), password: $('#password').value } });
      if (!r.ok) { $('#err').textContent = r.error || 'Giris basarisiz'; return; }
      token = r.token;
      localStorage.setItem('gt_player_token', token);
      $('#token').value = token;
      $('#ok').textContent = 'Basarili, yonlendiriliyor...';
      const ret = $('#returnTo').value;
      if (ret) {
        // GT istemcisi set_url akisi: token+username'i geri yansit
        const url = new URL(ret, location.origin);
        url.searchParams.set('token', token);
        url.searchParams.set('username', r.username);
        location.href = url.toString();
      } else {
        location.href = '/account';
      }
    });
  }

  // REGISTER
  if (path === '/register' || path.endsWith('/register.html')) {
    $('#registerForm').addEventListener('submit', async e => {
      e.preventDefault();
      $('#err').textContent = ''; $('#ok').textContent = '';
      const u = $('#username').value.trim();
      const p1 = $('#password').value, p2 = $('#password2').value;
      if (p1 !== p2) { $('#err').textContent = 'Sifreler eslesmiyor'; return; }
      const r = await api('/register', { method: 'POST', body: { username: u, password: p1 } });
      if (!r.ok) { $('#err').textContent = r.error || 'Kayit basarisiz'; return; }
      token = r.token; localStorage.setItem('gt_player_token', token);
      $('#ok').textContent = 'Hesap olusturuldu! Yonlendiriliyor...';
      setTimeout(() => location.href = '/account', 800);
    });
  }

  // ACCOUNT
  if (path === '/account' || path.endsWith('/account.html')) {
    if (!token) { location.href = '/login?return=/account'; return; }
    api('/me').then(r => {
      if (!r.ok) { localStorage.removeItem('gt_player_token'); location.href = '/login'; return; }
      const p = r.player;
      $('#hName').textContent = p.name;
      $('#hRole').textContent = p.role;
      $('#sLvl').textContent = p.level;
      $('#sXp').textContent = p.xp + '/' + r.xpNext;
      $('#sGems').textContent = p.gems;
      $('#sHp').textContent = p.health + '/' + p.maxHealth;
      $('#sWorld').textContent = p.world;
      $('#sClan').textContent = p.clan || '-';
      $('#sFish').textContent = p.stats.fish;
      $('#sMine').textContent = p.stats.mined;
      $('#sFarm').textContent = p.stats.harvested;
      $('#sKD').textContent = p.stats.kills + ' / ' + p.stats.deaths;
      const inv = $('#invList'); inv.innerHTML = '';
      for (const [id, qty] of Object.entries(p.inventory)) {
        const it = (r.items || {})[id] || { name: '#' + id };
        const li = document.createElement('li');
        li.innerHTML = `<span>${it.name}</span><b>x${qty}</b>`;
        inv.appendChild(li);
      }
    });
    $('#passForm').addEventListener('submit', async e => {
      e.preventDefault();
      const r = await api('/password', { method: 'POST', body: { oldPassword: $('#oldPw').value, newPassword: $('#newPw').value } });
      $('#passMsg').textContent = r.ok ? 'Sifre degistirildi.' : (r.error || 'hata');
      if (r.ok) { $('#oldPw').value = ''; $('#newPw').value = ''; }
    });
    $('#btnLogout').addEventListener('click', async e => {
      e.preventDefault();
      await api('/logout', { method: 'POST' });
      localStorage.removeItem('gt_player_token');
      location.href = '/';
    });
  }
})();
