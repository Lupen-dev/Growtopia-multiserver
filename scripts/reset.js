#!/usr/bin/env node
// Calisma zamani verilerini temizler ve tekrar tohumlar.
const path = require('path');
const fs = require('fs');
const RUNTIME = path.resolve(__dirname, '..', 'data', 'runtime');
if (fs.existsSync(RUNTIME)) fs.rmSync(RUNTIME, { recursive: true, force: true });
require('./seed.js');
