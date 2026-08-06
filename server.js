const express = require('express');
const cors = require('cors');
const sqlite3 = require('sqlite3').verbose();
const path = require('path');

const app = express();
const PORT = process.env.PORT || 3000;

// Middleware
app.use(cors());
app.use(express.json());
app.use(express.static(path.join(__dirname, 'public')));
// ============================
//  پێکهێنانی پایەی داتا
// ============================
const DB_PATH = path.join(__dirname, 'database.sqlite');
const db = new sqlite3.Database(DB_PATH);

// دروستکردنی خشتەکان
db.serialize(() => {
  db.run(`
    CREATE TABLE IF NOT EXISTS users (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      username TEXT UNIQUE NOT NULL,
      password TEXT NOT NULL,
      role TEXT NOT NULL DEFAULT 'vendor',
      shopName TEXT,
      phone TEXT,
      email TEXT UNIQUE
    )
  `);

  db.run(`
    CREATE TABLE IF NOT EXISTS submissions (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      vendorId INTEGER NOT NULL,
      shopName TEXT NOT NULL,
      contactPhone TEXT NOT NULL,
      contactEmail TEXT NOT NULL,
      category TEXT NOT NULL,
      items TEXT NOT NULL,
      total REAL NOT NULL,
      createdAt TEXT NOT NULL,
      FOREIGN KEY (vendorId) REFERENCES users(id)
    )
  `);
});

// ============================
//  داخڵکردنی بەکارهێنەری admin (ئەگەر بوونی نەبوو)
// ============================
function seedAdmin() {
  db.get("SELECT id FROM users WHERE username = 'admin'", (err, row) => {
    if (err) return console.error(err);
    if (!row) {
      db.run(
        "INSERT INTO users (username, password, role, shopName, email) VALUES (?, ?, ?, ?, ?)",
        ['admin', 'admin123', 'admin', 'Administrator', 'admin@mop.gov'],
        (err) => {
          if (err) console.error(err);
          else console.log('✅ Admin user created (username: admin, password: admin123)');
        }
      );
    }
  });
}
seedAdmin();

// ============================
//  ڕێڕەوەکانی API
// ============================

// تۆمارکردن
app.post('/api/register', (req, res) => {
  const { username, password, shopName, phone, email } = req.body;
  if (!username || !password) {
    return res.status(400).json({ error: 'Username and password are required' });
  }
  db.run(
    "INSERT INTO users (username, password, role, shopName, phone, email) VALUES (?, ?, ?, ?, ?, ?)",
    [username, password, 'vendor', shopName || username, phone || '', email || username],
    function(err) {
      if (err) {
        return res.status(400).json({ error: 'Username or email already exists' });
      }
      res.status(201).json({ id: this.lastID, username, role: 'vendor', shopName: shopName || username });
    }
  );
});

// چوونەژوورەوە
app.post('/api/login', (req, res) => {
  const { username, password } = req.body;
  db.get(
    "SELECT id, username, password, role, shopName, phone, email FROM users WHERE (username = ? OR email = ?) AND password = ?",
    [username, username, password],
    (err, user) => {
      if (err || !user) {
        return res.status(401).json({ error: 'Invalid credentials' });
      }
      delete user.password;
      res.json(user);
    }
  );
});

// پێشکەشکردنی نوێ
app.post('/api/submissions', (req, res) => {
  const { vendorId, shopName, contactPhone, contactEmail, category, items } = req.body;
  if (!vendorId || !items || !Array.isArray(items) || items.length === 0) {
    return res.status(400).json({ error: 'Invalid submission data' });
  }
  const total = items.reduce((sum, it) => sum + (it.quantity * it.unitPrice), 0);
  const createdAt = new Date().toISOString();
  const itemsJson = JSON.stringify(items);

  db.run(
    "INSERT INTO submissions (vendorId, shopName, contactPhone, contactEmail, category, items, total, createdAt) VALUES (?, ?, ?, ?, ?, ?, ?, ?)",
    [vendorId, shopName, contactPhone, contactEmail, category, itemsJson, total, createdAt],
    function(err) {
      if (err) {
        console.error(err);
        return res.status(500).json({ error: 'Failed to save submission' });
      }
      res.status(201).json({
        id: this.lastID,
        vendorId,
        shopName,
        contactPhone,
        contactEmail,
        category,
        items,
        total,
        createdAt
      });
    }
  );
});

// دەستکەوتنی هەموو پێشکەشکردنەکان (بۆ بەڕێوەبەر)
app.get('/api/submissions', (req, res) => {
  const { category, shop } = req.query;
  let sql = "SELECT * FROM submissions WHERE 1=1";
  const params = [];
  if (category) {
    sql += " AND category = ?";
    params.push(category);
  }
  if (shop) {
    sql += " AND shopName LIKE ?";
    params.push(`%${shop}%`);
  }
  sql += " ORDER BY createdAt DESC";
  db.all(sql, params, (err, rows) => {
    if (err) {
      return res.status(500).json({ error: err.message });
    }
    const result = rows.map(row => ({
      ...row,
      items: JSON.parse(row.items)
    }));
    res.json(result);
  });
});

// دەستکەوتنی پێشکەشکردنەکانی دابینکەرێکی دیاریکراو
app.get('/api/submissions/vendor/:vendorId', (req, res) => {
  const { vendorId } = req.params;
  db.all(
    "SELECT * FROM submissions WHERE vendorId = ? ORDER BY createdAt DESC",
    [vendorId],
    (err, rows) => {
      if (err) {
        return res.status(500).json({ error: err.message });
      }
      const result = rows.map(row => ({
        ...row,
        items: JSON.parse(row.items)
      }));
      res.json(result);
    }
  );
});

// دەستکەوتنی هەموو دابینکەران (تەنها بۆ بەڕێوەبەر)
app.get('/api/vendors', (req, res) => {
  db.all(
    "SELECT id, username, role, shopName, phone, email FROM users WHERE role = 'vendor'",
    (err, rows) => {
      if (err) {
        return res.status(500).json({ error: err.message });
      }
      res.json(rows);
    }
  );
});

// ============================
//  ڕێڕەوی گشتی بۆ هەموو داواکارییەکانی تر (SPA)
//  ئەم ڕێڕەوە دەبێت لە کۆتایی هەموو ڕێڕەوەکانی APIـدا بێت
// ============================
app.get('*', (req, res) => {
    res.sendFile(path.join(__dirname, 'public', 'index.html'));
});

// ============================
//  ڕاگەیاندنی سەرڤەر
// ============================
app.listen(PORT, () => {
  console.log(`🚀 Server running on http://localhost:${PORT}`);
  console.log(`📁 Database: ${DB_PATH}`);
});