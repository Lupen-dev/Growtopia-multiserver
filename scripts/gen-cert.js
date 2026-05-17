#!/usr/bin/env node
// Self-signed sertifika olustur - openssl ile (macOS/Linux'ta varsayilan).
// data/runtime/ssl/server.key + server.crt
const fs = require('fs');
const path = require('path');
const { execSync } = require('child_process');

const SSL_DIR = path.resolve(__dirname, '..', 'data', 'runtime', 'ssl');
if (!fs.existsSync(SSL_DIR)) fs.mkdirSync(SSL_DIR, { recursive: true });

const KEY = path.join(SSL_DIR, 'server.key');
const CRT = path.join(SSL_DIR, 'server.crt');

if (fs.existsSync(KEY) && fs.existsSync(CRT)) {
  console.log('SSL sertifikalari zaten var:', SSL_DIR);
  process.exit(0);
}

try {
  execSync('openssl version', { stdio: 'pipe' });
} catch {
  console.error('openssl bulunamadi. macOS: zaten yuklu. Ubuntu/Debian: sudo apt install openssl');
  process.exit(1);
}

const CONF = path.join(SSL_DIR, 'openssl.cnf');
fs.writeFileSync(CONF, `[req]
default_bits = 2048
prompt = no
default_md = sha256
distinguished_name = dn
req_extensions = san
[dn]
C = TR
ST = Local
L = Local
O = GrowTurk
CN = www.growtopia1.com
[san]
subjectAltName = @alt
[alt]
DNS.1 = www.growtopia1.com
DNS.2 = www.growtopia2.com
DNS.3 = growtopia1.com
DNS.4 = growtopia2.com
DNS.5 = localhost
DNS.6 = login.growserver.app
IP.1  = 127.0.0.1
`);

const cmd = `openssl req -x509 -newkey rsa:2048 -nodes -days 3650 -keyout "${KEY}" -out "${CRT}" -config "${CONF}" -extensions san`;
try {
  execSync(cmd, { stdio: 'pipe' });
  console.log('Sertifika olusturuldu:', CRT);
  console.log('Anahtar:', KEY);
} catch (e) {
  console.error('Sertifika olusturulamadi:', e.message);
  process.exit(1);
}
