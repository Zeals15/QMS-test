// server/index.js
require('dotenv').config();

const express = require('express');
const cors = require('cors');
const db = require('./db'); // your db.js that returns getConnection()
const bcrypt = require('bcrypt');
const jwt = require('jsonwebtoken');

const app = express();
// Enable CORS and explicitly allow Authorization header for preflight requests
app.use(cors({
  origin: true,
  methods: ['GET','POST','PUT','DELETE','OPTIONS'],
  allowedHeaders: ['Content-Type', 'Authorization']
}));
app.use(express.json());

const PORT = process.env.PORT || 4000;
const JWT_SECRET = process.env.JWT_SECRET || 'change_this_secret';

// ----- Health check -----
app.get('/api/health', (req, res) => {
  res.json({ status: 'ok' });
});

// ----- Auth: login -----
// Expects JSON { email, password }
app.post('/api/login', async (req, res) => {
  const { email, password } = req.body || {};
  if (!email || !password) return res.status(400).json({ error: 'missing email or password' });

  try {
    const conn = await db.getConnection();
    const [rows] = await conn.query('SELECT id, email, name, password_hash, role FROM users WHERE email = ?', [email]);
    conn.release();

    if (!rows[0]) return res.status(401).json({ error: 'Invalid credentials' });

    const user = rows[0];
    const match = await bcrypt.compare(password, user.password_hash);
    if (!match) return res.status(401).json({ error: 'Invalid credentials' });

    const token = jwt.sign({ id: user.id, email: user.email, role: user.role }, JWT_SECRET, { expiresIn: '8h' });

    res.json({
      token,
      user: {
        id: user.id,
        email: user.email,
        name: user.name,
        role: user.role
      }
    });
  } catch (err) {
    console.error('Login error:', err);
    res.status(500).json({ error: 'server error' });
  }
});

// ----- Middleware: protect routes -----
function authMiddleware(req, res, next) {
  const header = req.headers.authorization;
  // log presence of auth header for debugging (do not print token)
  console.log('auth header present:', !!header);
  if (!header) return res.status(401).json({ error: 'missing authorization header' });
  const parts = header.split(' ');
  if (parts.length !== 2 || parts[0] !== 'Bearer') return res.status(401).json({ error: 'invalid authorization format' });
  const token = parts[1];
  try {
    const payload = jwt.verify(token, JWT_SECRET);
    req.user = payload;
    next();
  } catch (e) {
    return res.status(401).json({ error: 'invalid or expired token' });
  }
}

// ----- Debug endpoint: check if browser sends Authorization header -----
app.get('/api/debug-headers', (req, res) => {
  const header = req.headers.authorization || null;
  const masked = header ? (typeof header === 'string' ? (header.slice(0, 20) + '...') : true) : null;
  res.json({ hasAuthorization: !!header, maskedAuthorization: masked });
});

// ----- Stats endpoint (uses DB) -----
app.get('/api/stats', async (req, res) => {
  try {
    const conn = await db.getConnection();
    const [rows] = await conn.query('SELECT COUNT(*) as total FROM quotations');
    conn.release();
    const total = (rows && rows[0] && rows[0].total) ? rows[0].total : 0;
    // you can extend this to more stats later
    res.json({ totalQuotations: total });
  } catch (err) {
    console.error('Error fetching stats:', err);
    res.status(500).json({ error: 'db error' });
  }
});

// ----- Recent quotations (for dashboard) -----
app.get('/api/quotations/recent', async (req, res) => {
  try {
    const conn = await db.getConnection();
    const [rows] = await conn.query('SELECT id, quotation_no, customer_name, total_value, status, created_at FROM quotations ORDER BY created_at DESC LIMIT 10');
    conn.release();
    res.json(rows || []);
  } catch (err) {
    console.error('Error fetching recent quotations:', err);
    res.status(500).json({ error: 'db error' });
  }
});

// ----- Get all quotations (full page) -----
app.get('/api/quotations', async (req, res) => {
  try {
    const conn = await db.getConnection();
    const [rows] = await conn.query('SELECT * FROM quotations ORDER BY created_at DESC');
    conn.release();
    res.json(rows || []);
  } catch (err) {
    console.error('Error fetching quotations:', err);
    res.status(500).json({ error: 'db error' });
  }
});

// ----- Create a new quotation (protected) -----
// Accepts JSON payload with fields: quotation_no, customer_name, total_value, status (optional)
app.post('/api/quotations', authMiddleware, async (req, res) => {
  // Log a masked preview for debugging authorization/body issues
  try { console.log('POST /api/quotations called by user:', req.user ? { id: req.user.id, email: req.user.email } : null); } catch(e){}
  const { quotation_no, customer_name, total_value, status } = req.body || {};
  try { console.log('quotation payload preview:', { quotation_no: quotation_no ? quotation_no.slice(0,20) : null, customer_name, total_value }); } catch(e){}
  if (!quotation_no || !customer_name) {
    return res.status(400).json({ error: 'quotation_no and customer_name are required' });
  }

  try {
    const conn = await db.getConnection();
    const [result] = await conn.query(
      'INSERT INTO quotations (quotation_no, customer_name, total_value, status) VALUES (?, ?, ?, ?)',
      [quotation_no, customer_name, total_value || 0, status || 'draft']
    );
    conn.release();
    res.status(201).json({ id: result.insertId, quotation_no });
  } catch (err) {
    console.error('Error creating quotation:', err);
    res.status(500).json({ error: 'db error' });
  }
});

// Optionally: a route to get the current user info (protected)
app.get('/api/me', authMiddleware, async (req, res) => {
  // req.user is from token payload
  res.json({ user: req.user });
});

// --- customers endpoints ---
app.get('/api/customers', async (req, res) => {
  try {
    const conn = await db.getConnection();
    await conn.query(`
      CREATE TABLE IF NOT EXISTS customers (
        id INT AUTO_INCREMENT PRIMARY KEY,
        company_name VARCHAR(255),
        contact_person VARCHAR(255),
        phone VARCHAR(50),
        email VARCHAR(255),
        gstin VARCHAR(50),
        address TEXT,
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
      ) ENGINE=INNODB;
    `);
    const [rows] = await conn.query('SELECT * FROM customers ORDER BY created_at DESC');
    conn.release();
    res.json(rows);
  } catch (err) {
    console.error('customers error', err);
    res.status(500).json({ error: 'db error' });
  }
});

app.post('/api/customers', async (req, res) => {
  const { company_name, contact_person, phone, email, gstin, address } = req.body || {};
  if (!company_name) return res.status(400).json({ error: 'company_name required' });
  try {
    const conn = await db.getConnection();
    const [resu] = await conn.query(
      'INSERT INTO customers (company_name, contact_person, phone, email, gstin, address) VALUES (?, ?, ?, ?, ?, ?)',
      [company_name, contact_person, phone, email, gstin, address]
    );
    conn.release();
    res.status(201).json({ id: resu.insertId });
  } catch (err) {
    console.error('create customer error', err);
    res.status(500).json({ error: 'db error' });
  }
});

// --- products endpoints ---
app.get('/api/products', async (req, res) => {
  try {
    const conn = await db.getConnection();
    await conn.query(`
      CREATE TABLE IF NOT EXISTS products (
        id INT AUTO_INCREMENT PRIMARY KEY,
        name VARCHAR(255),
        hsn_code VARCHAR(50),
        uom VARCHAR(30),
        unit_price DECIMAL(12,2),
        tax_rate DECIMAL(5,2),
        status VARCHAR(20) DEFAULT 'active',
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
      ) ENGINE=INNODB;
    `);
    const [rows] = await conn.query('SELECT * FROM products ORDER BY created_at DESC');
    conn.release();
    res.json(rows);
  } catch (err) {
    console.error('products error', err);
    res.status(500).json({ error: 'db error' });
  }
});

app.post('/api/products', async (req, res) => {
  const { name, hsn_code, uom, unit_price, tax_rate, status } = req.body || {};
  if (!name) return res.status(400).json({ error: 'name required' });
  try {
    const conn = await db.getConnection();
    const [r] = await conn.query(
      'INSERT INTO products (name, hsn_code, uom, unit_price, tax_rate, status) VALUES (?, ?, ?, ?, ?, ?)',
      [name, hsn_code || '', uom || 'NOS', unit_price || 0, tax_rate || 0, status || 'active']
    );
    conn.release();
    res.status(201).json({ id: r.insertId });
  } catch (err) {
    console.error('create product error', err);
    res.status(500).json({ error: 'db error' });
  }
});

// Update a product
app.put('/api/products/:id', async (req, res) => {
  const { id } = req.params;
  const { name, hsn_code, uom, unit_price, tax_rate, status } = req.body || {};
  if (!name) return res.status(400).json({ error: 'name required' });
  try {
    const conn = await db.getConnection();
    const [r] = await conn.query(
      'UPDATE products SET name = ?, hsn_code = ?, uom = ?, unit_price = ?, tax_rate = ?, status = ? WHERE id = ?',
      [name, hsn_code || '', uom || 'NOS', unit_price || 0, tax_rate || 0, status || 'active', id]
    );
    conn.release();
    res.json({ affectedRows: r.affectedRows });
  } catch (err) {
    console.error('update product error', err);
    res.status(500).json({ error: 'db error' });
  }
});

// Delete a product
app.delete('/api/products/:id', async (req, res) => {
  const { id } = req.params;
  try {
    const conn = await db.getConnection();
    const [r] = await conn.query('DELETE FROM products WHERE id = ?', [id]);
    conn.release();
    res.json({ affectedRows: r.affectedRows });
  } catch (err) {
    console.error('delete product error', err);
    res.status(500).json({ error: 'db error' });
  }
});
// Start server
app.listen(PORT, () => {
  console.log(`Server listening on port ${PORT}`);
});
