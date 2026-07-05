const express = require('express');
const fs = require('fs');
const path = require('path');

const PORT = process.env.PORT || 3000;
const DATA_FILE = process.env.DATA_FILE || path.join(__dirname, 'data', 'db.json');

// ---- Basit JSON dosya veritabanı ----
function loadDb() {
  try {
    return JSON.parse(fs.readFileSync(DATA_FILE, 'utf8'));
  } catch {
    return { products: [], sales: [] };
  }
}

let db = loadDb();
let saveTimer = null;

function saveDb() {
  // Kısa aralıklı ardışık yazmaları tek dosya yazımına indirger.
  clearTimeout(saveTimer);
  saveTimer = setTimeout(() => {
    fs.mkdirSync(path.dirname(DATA_FILE), { recursive: true });
    const tmp = DATA_FILE + '.tmp';
    fs.writeFileSync(tmp, JSON.stringify(db, null, 2));
    fs.renameSync(tmp, DATA_FILE);
  }, 100);
}

const app = express();
app.use(express.json());
app.use(express.static(path.join(__dirname, 'public')));

// ---- Ürünler ----
app.get('/api/products', (req, res) => {
  res.json(db.products);
});

app.post('/api/products', (req, res) => {
  const { barcode, name, category, purchasePrice, salePrice, stockQuantity, criticalStockLevel } = req.body;
  if (!barcode || !name) {
    return res.status(400).json({ error: 'Barkod ve ürün adı zorunludur.' });
  }
  if (db.products.some(p => p.barcode === barcode)) {
    return res.status(409).json({ error: 'Bu barkod zaten kayıtlı: ' + barcode });
  }
  const product = {
    barcode: String(barcode).trim(),
    name: String(name).trim(),
    category: category || 'Genel',
    purchasePrice: Number(purchasePrice) || 0,
    salePrice: Number(salePrice) || 0,
    stockQuantity: 0,
    criticalStockLevel: Number(criticalStockLevel) >= 0 ? Number(criticalStockLevel) : 5,
    movements: [],
    createdAt: new Date().toISOString(),
  };
  const initialStock = Number(stockQuantity) || 0;
  if (initialStock > 0) applyMovement(product, initialStock, 'Alış', 'İlk stok girişi');
  db.products.push(product);
  saveDb();
  res.status(201).json(product);
});

app.put('/api/products/:barcode', (req, res) => {
  const product = db.products.find(p => p.barcode === req.params.barcode);
  if (!product) return res.status(404).json({ error: 'Ürün bulunamadı.' });
  const { name, category, purchasePrice, salePrice, criticalStockLevel } = req.body;
  if (name !== undefined) product.name = String(name).trim();
  if (category !== undefined) product.category = category;
  if (purchasePrice !== undefined) product.purchasePrice = Number(purchasePrice) || 0;
  if (salePrice !== undefined) product.salePrice = Number(salePrice) || 0;
  if (criticalStockLevel !== undefined) product.criticalStockLevel = Number(criticalStockLevel) || 0;
  saveDb();
  res.json(product);
});

app.delete('/api/products/:barcode', (req, res) => {
  const index = db.products.findIndex(p => p.barcode === req.params.barcode);
  if (index === -1) return res.status(404).json({ error: 'Ürün bulunamadı.' });
  db.products.splice(index, 1);
  saveDb();
  res.json({ ok: true });
});

// Stok girişi/çıkışı (alış, düzeltme, fire)
app.post('/api/products/:barcode/stock', (req, res) => {
  const product = db.products.find(p => p.barcode === req.params.barcode);
  if (!product) return res.status(404).json({ error: 'Ürün bulunamadı.' });
  const delta = Number(req.body.delta);
  if (!Number.isFinite(delta) || delta === 0) {
    return res.status(400).json({ error: 'Geçerli bir miktar girin.' });
  }
  applyMovement(product, delta, req.body.type || 'Düzeltme', req.body.note || '');
  saveDb();
  res.json(product);
});

function applyMovement(product, delta, type, note) {
  product.stockQuantity += delta;
  product.movements.unshift({ delta, type, note, date: new Date().toISOString() });
  product.movements = product.movements.slice(0, 100);
}

// ---- Satışlar ----
app.post('/api/sales', (req, res) => {
  const { items, paymentMethod } = req.body;
  if (!Array.isArray(items) || items.length === 0) {
    return res.status(400).json({ error: 'Sepet boş.' });
  }
  const sale = {
    id: Date.now().toString(36) + Math.random().toString(36).slice(2, 6),
    date: new Date().toISOString(),
    paymentMethod: paymentMethod === 'Kart' ? 'Kart' : 'Nakit',
    items: [],
    totalAmount: 0,
    totalProfit: 0,
  };
  for (const line of items) {
    const product = db.products.find(p => p.barcode === line.barcode);
    if (!product) return res.status(400).json({ error: 'Ürün bulunamadı: ' + line.barcode });
    const quantity = Math.max(1, Math.floor(Number(line.quantity) || 1));
    sale.items.push({
      barcode: product.barcode,
      productName: product.name,
      quantity,
      unitPrice: product.salePrice,
      unitCost: product.purchasePrice,
    });
    sale.totalAmount += product.salePrice * quantity;
    sale.totalProfit += (product.salePrice - product.purchasePrice) * quantity;
    applyMovement(product, -quantity, 'Satış', 'Satış #' + sale.id);
  }
  db.sales.unshift(sale);
  saveDb();
  res.status(201).json(sale);
});

app.get('/api/sales', (req, res) => {
  const since = req.query.since ? new Date(req.query.since) : null;
  const sales = since ? db.sales.filter(s => new Date(s.date) >= since) : db.sales;
  res.json(sales.slice(0, 200));
});

app.listen(PORT, () => {
  console.log('TekelStok web sunucusu çalışıyor: http://localhost:' + PORT);
});
