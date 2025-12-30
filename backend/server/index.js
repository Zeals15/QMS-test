// server/index.js
require('dotenv').config();

const express = require('express');
const cors = require('cors');
const db = require('./db'); // must expose getConnection() and endPool()
const bcrypt = require('bcryptjs');
const jwt = require('jsonwebtoken');
const path = require('path');
const http = require('http');
const { calculateTotals } = require('./utils/quotationCalculator');
const { Server } = require('socket.io');
const { getSettingsFromDB } = require("./utils/settings");

const nodemailer = require('nodemailer');

const dashboardRoutes = require("./routes/dashboard");

const app = express();

// Serve static public assets (frontend expects /logo.png etc.)
app.use(express.static(path.join(__dirname, '..', 'public'), { maxAge: '1h' }));

// ---------- CORS ----------
const allowedOrigins = (process.env.CORS_ORIGINS || '')
  .split(',')
  .map(s => s.trim())
  .filter(Boolean);

const corsOptions = {
  origin: (origin, callback) => {
    if (!origin) return callback(null, true);
    if (allowedOrigins.length === 0) return callback(null, true);
    if (allowedOrigins.includes(origin)) return callback(null, true);
    callback(new Error('Not allowed by CORS'));
  },
  methods: ['GET', 'POST', 'PUT', 'DELETE', 'OPTIONS'],
  allowedHeaders: ['Content-Type', 'Authorization', 'Accept', 'X-Requested-With'],
  credentials: true,
  optionsSuccessStatus: 204,
};

app.use(cors(corsOptions));
app.options('*', cors(corsOptions));
app.use(express.json({ limit: '1mb' }));

app.use("/api/dashboard", dashboardRoutes);

// App-level constants
const PORT = process.env.PORT || 4000;

if (!process.env.JWT_SECRET) {
  throw new Error('JWT_SECRET is not set');
}
const JWT_SECRET = process.env.JWT_SECRET;

// ---------- Helpers ----------
function nameToInitials(name) {
  if (!name) return '';
  return String(name).trim()
    .split(/\s+/)
    .filter(Boolean)
    .map(n => String(n)[0].toUpperCase())
    .slice(0, 3)
    .join('');
}

function getFinancialYearCode(date = new Date()) {
  const year = date.getFullYear();
  const month = date.getMonth() + 1;

  if (month >= 4) {
    return `${year}${year + 1}`.slice(2); // 2025-26 → 2526
  } else {
    return `${year - 1}${year}`.slice(2);
  }
}

function normalizeDateForDb(input) {
  if (!input) return null;
  const s = String(input).trim();
  if (/^\d{4}-\d{2}-\d{2}$/.test(s)) return s;
  const d = new Date(s);
  if (!isNaN(d.getTime())) {
    const yyyy = d.getFullYear();
    const mm = String(d.getMonth() + 1).padStart(2, '0');
    const dd = String(d.getDate()).padStart(2, '0');
    return `${yyyy}-${mm}-${dd}`;
  }
  return null;
}

function fixYearFormat(qno) {
  if (!qno || typeof qno !== 'string') return qno;
  const parts = qno.split('/');
  if (parts.length < 4) return qno;
  const yy = parts[1];
  if (/^\d{6}$/.test(yy)) return qno;
  if (/^\d{2}$/.test(yy)) {
    const startYear = Number(`20${yy}`);
    if (!isNaN(startYear)) {
      const next = String(startYear + 1).slice(-2);
      parts[1] = `${startYear}${next}`;
      return parts.join('/');
    }
  }
  if (/^\d{4}$/.test(yy)) {
    const startYear = Number(yy);
    if (!isNaN(startYear)) {
      const next = String(startYear + 1).slice(-2);
      parts[1] = `${startYear}${next}`;
      return parts.join('/');
    }
  }
  return qno;
}

function buildFiscalYearStringForDate(dt = new Date()) {
  const now = (dt instanceof Date) ? dt : new Date(dt);
  const month = now.getMonth();
  const startYear = (month <= 1) ? now.getFullYear() - 1 : now.getFullYear();
  const nextYearTwoDigits = String(startYear + 1).slice(-2);
  return `${startYear}${nextYearTwoDigits}`;
}

function bumpVersion(version) {
  const v = parseFloat(version);
  if (isNaN(v)) return '0.1';
  return (Math.round((v + 0.1) * 10) / 10).toFixed(1);
}

/**
 * Accept only integer numeric id parameters.
 * Returns sanitized numeric string or null if invalid.
 */
function sanitizeIdParam(raw) {
  if (raw == null) return null;
  try {
    const decoded = decodeURIComponent(String(raw));
    const beforeQ = decoded.split('?')[0].trim();
    if (/^\d+$/.test(beforeQ)) return beforeQ;
    return null;
  } catch (e) {
    return null;
  }
}



function escapeHtml(input) {
  if (input == null) return '';
  return String(input)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}

function safeJsonParse(val, fallback = []) {
  if (Array.isArray(val) || typeof val === 'object') return val;
  if (typeof val !== 'string') return fallback;
  try {
    return JSON.parse(val);
  } catch (e) {
    return fallback;
  }
}

// ---------- Global error handlers ----------

process.on('unhandledRejection', (reason, p) => {
  console.error('Unhandled Rejection:', { reason, promise: p });
});

process.on('uncaughtException', (err) => {
  console.error('UNCAUGHT EXCEPTION:', err);
});

// ---------- Schema/DB bootstrappers ----------
async function ensureUsersTable() {
  let conn;
  try {
    conn = await db.getConnection();
    await conn.query(`
      CREATE TABLE IF NOT EXISTS users (
        id INT AUTO_INCREMENT PRIMARY KEY,
        username VARCHAR(100) UNIQUE,
        email VARCHAR(255) NOT NULL,
        name VARCHAR(255) NOT NULL,
        password_hash VARCHAR(255),
        phone VARCHAR(50),
        position VARCHAR(100),
        role VARCHAR(50) DEFAULT 'user',
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
        UNIQUE KEY uq_users_email_name (email, name)
      ) ENGINE=INNODB;
    `);
  } finally {
    if (conn) await conn.release();
  }
}

async function getNextRunningNumber(conn, fyCode, initials) {
  const prefix = `QT/${fyCode}/${initials}/`;

  const [rows] = await conn.query(
    `
    SELECT quotation_no
    FROM quotations
    WHERE quotation_no LIKE ?
    ORDER BY id DESC
    LIMIT 1
    FOR UPDATE
    `,
    [`${prefix}%`]
  );

  if (!rows.length) return 1;

  const lastNo = rows[0].quotation_no;
  const lastSuffix = Number(lastNo.split('/').pop());

  return Number.isFinite(lastSuffix) ? lastSuffix + 1 : 1;
}

async function ensureQuotationsTable() {
  let conn;
  try {
    conn = await db.getConnection();
    await conn.query(`
      CREATE TABLE IF NOT EXISTS quotations (
        id INT AUTO_INCREMENT PRIMARY KEY,
        quotation_no VARCHAR(255) UNIQUE,
        customer_id INT,
        customer_snapshot JSON,
        customer_name VARCHAR(255),
        salesperson_id INT,
        quotation_date DATE,
        validity_days INT DEFAULT 30,
        items JSON,
        terms TEXT,
        notes TEXT,
        subtotal DECIMAL(18,2) DEFAULT 0,
        total_discount DECIMAL(18,2) DEFAULT 0,
        tax_total DECIMAL(18,2) DEFAULT 0,
        total_value DECIMAL(18,2) DEFAULT 0,
        version VARCHAR(50) DEFAULT '0.1',
        status VARCHAR(50) DEFAULT 'draft',
        approved_by VARCHAR(255) DEFAULT NULL,
        approved_at DATETIME DEFAULT NULL,
        is_deleted TINYINT(1) DEFAULT 0,
        deleted_at DATETIME DEFAULT NULL,
        deleted_by INT DEFAULT NULL,
        reissued_from_id INT DEFAULT NULL,
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
      ) ENGINE=INNODB;
    `);

    const schema =
  process.env.MYSQLDATABASE ||
  process.env.MYSQL_DATABASE ||
  'railway';
    const table = 'quotations';
    const [cols] = await conn.query(
      `SELECT COLUMN_NAME FROM information_schema.columns WHERE table_schema = ? AND table_name = ?`,
      [schema, table]
    );
    const existing = Array.isArray(cols) ? cols.map(c => String(c.COLUMN_NAME).toLowerCase()) : [];

    const required = [
      { name: 'is_deleted', def: 'is_deleted TINYINT(1) DEFAULT 0' },
      { name: 'deleted_at', def: 'deleted_at DATETIME DEFAULT NULL' },
      { name: 'deleted_by', def: 'deleted_by INT DEFAULT NULL' },
      { name: 'approved_by', def: 'approved_by VARCHAR(255) DEFAULT NULL' },
      { name: 'approved_at', def: 'approved_at DATETIME DEFAULT NULL' },
      { name: 'items', def: 'items JSON' },
      { name: 'version', def: "version VARCHAR(50) DEFAULT '0.1'" },
      { name: 'subtotal', def: 'subtotal DECIMAL(18,2) DEFAULT 0' },
      { name: 'total_discount', def: 'total_discount DECIMAL(18,2) DEFAULT 0' },
      { name: 'tax_total', def: 'tax_total DECIMAL(18,2) DEFAULT 0' },
      { name: 'total_value', def: 'total_value DECIMAL(18,2) DEFAULT 0' },
      { name: 'salesperson_phone', def: 'salesperson_phone VARCHAR(50)' },
      { name: 'salesperson_email', def: 'salesperson_email VARCHAR(255)' },
      { name: 'customer_contact_person', def: 'customer_contact_person VARCHAR(255)' },
      { name: 'customer_snapshot', def: 'customer_snapshot JSON' },
      { name: 'customer_phone', def: 'customer_phone VARCHAR(50)' },
      { name: 'customer_email', def: 'customer_email VARCHAR(255)' },
      { name: 'customer_address', def: 'customer_address TEXT' },
      { name: 'customer_gst', def: 'customer_gst VARCHAR(64)' },
      { name: 'reissued_from_id', def: 'reissued_from_id INT DEFAULT NULL' }
    ];

    for (const reqCol of required) {
      if (!existing.includes(reqCol.name)) {
        try {
          await conn.query(`ALTER TABLE ${table} ADD COLUMN ${reqCol.def}`);
          console.log(`ensureQuotationsTable: added missing column ${reqCol.name}`);
        } catch (alterErr) {
          console.warn(`ensureQuotationsTable: failed to add column ${reqCol.name}:`, alterErr && alterErr.message);
        }
      }
    }
  } finally {
    if (conn) try { await conn.release(); } catch (e) {}
  }
}

async function ensureCustomersTable() {
  let conn;
  try {
    conn = await db.getConnection();
    await conn.query(`
      CREATE TABLE IF NOT EXISTS customers (
        id INT AUTO_INCREMENT PRIMARY KEY,
        company_name VARCHAR(255) NOT NULL,
        contact_person VARCHAR(255),
        phone VARCHAR(50),
        email VARCHAR(255),
        gstin VARCHAR(64),
        address TEXT,
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
      ) ENGINE=INNODB;
    `);
  } finally {
    if (conn) try { await conn.release(); } catch (e) {}
  }
}

async function ensureProductsTable() {
  let conn;
  try {
    conn = await db.getConnection();
    await conn.query(`
      CREATE TABLE IF NOT EXISTS products (
        id INT AUTO_INCREMENT PRIMARY KEY,
        name VARCHAR(255) NOT NULL,
        description TEXT,
        hsn_code VARCHAR(50),
        uom VARCHAR(30),
        unit_price DECIMAL(12,2),
        tax_rate DECIMAL(5,2),
        status VARCHAR(20) DEFAULT 'active',
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
      ) ENGINE=INNODB;
    `);
  } finally {
    if (conn) try { await conn.release(); } catch (e) {}
  }
}

async function ensureCustomerLocationsTable() {
  let conn;
  try {
    conn = await db.getConnection();
    await conn.query(`
      CREATE TABLE IF NOT EXISTS customer_locations (
        id INT AUTO_INCREMENT PRIMARY KEY,
        customer_id INT NOT NULL,
        location_name VARCHAR(255) NOT NULL,
        gstin VARCHAR(64),
        address TEXT,
        city VARCHAR(100),
        state VARCHAR(100),
        is_active TINYINT DEFAULT 1,
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
        FOREIGN KEY (customer_id) REFERENCES customers(id) ON DELETE CASCADE,
        INDEX idx_customer_id (customer_id)
      ) ENGINE=INNODB;
    `);
  } finally {
    if (conn) try { await conn.release(); } catch (e) {}
  }
}

async function ensureCustomerContactsTable() {
  let conn;
  try {
    conn = await db.getConnection();
    await conn.query(`
      CREATE TABLE IF NOT EXISTS customer_contacts (
        id INT AUTO_INCREMENT PRIMARY KEY,
        location_id INT NOT NULL,
        contact_name VARCHAR(255) NOT NULL,
        phone VARCHAR(50),
        email VARCHAR(255),
        is_primary TINYINT DEFAULT 0,
        is_active TINYINT DEFAULT 1,
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
        FOREIGN KEY (location_id) REFERENCES customer_locations(id) ON DELETE CASCADE,
        INDEX idx_location_id (location_id)
      ) ENGINE=INNODB;
    `);
  } finally {
    if (conn) try { await conn.release(); } catch (e) {}
  }
}

async function ensureNotificationsTable() {
  let conn;
  try {
    conn = await db.getConnection();
    await conn.query(`
      CREATE TABLE IF NOT EXISTS notifications (
        id BIGINT AUTO_INCREMENT PRIMARY KEY,
        uuid VARCHAR(100) NOT NULL UNIQUE,
        title VARCHAR(255) NOT NULL,
        description TEXT NULL,
        url VARCHAR(255) NULL,
        user_id INT NULL,
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
      ) ENGINE=INNODB;
    `);

   

    const schema =
  process.env.MYSQLDATABASE ||
  process.env.MYSQL_DATABASE ||
  'railway';
    const [idxRows] = await conn.query(
      `SELECT COUNT(*) AS cnt 
      FROM information_schema.statistics
      WHERE table_schema = ? 
      AND table_name = 'notifications' 
      AND index_name = 'idx_notifications_created_at'`,
      [schema]
    );
    const cnt = Array.isArray(idxRows) && idxRows[0] ? Number(idxRows[0].cnt || 0) : 0;
    if (cnt === 0) {
      await conn.query(`CREATE INDEX idx_notifications_created_at ON notifications (created_at)`);
    }
  } finally {
    if (conn) try { await conn.release(); } catch (e) {}
  }
}



async function ensureQuotationVersionsTable() {
  let conn;
  try {
    conn = await db.getConnection();
    await conn.query(`
      CREATE TABLE IF NOT EXISTS quotation_versions (
        id INT AUTO_INCREMENT PRIMARY KEY,
        quotation_id INT NOT NULL,

        version_major INT NOT NULL,
        version_minor INT NOT NULL,
        version_label VARCHAR(32),

        items JSON,
        subtotal DECIMAL(18,2),
        tax DECIMAL(18,2),
        total DECIMAL(18,2),

        change_history JSON,
        created_by INT,
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,

        FOREIGN KEY (quotation_id) REFERENCES quotations(id) ON DELETE CASCADE,
        INDEX idx_qv_qid (quotation_id)
      ) ENGINE=INNODB;
    `);
  } finally {
    if (conn) await conn.release();
  }
}


async function ensureQuotationFollowupsTable() {
  let conn;
  try {
    conn = await db.getConnection();
    await conn.query(`
      CREATE TABLE IF NOT EXISTS quotation_followups (
        id INT AUTO_INCREMENT PRIMARY KEY,
        quotation_id INT NOT NULL,
        created_by INT,
        followup_date DATE NOT NULL,
        note TEXT NOT NULL,
        followup_type ENUM(
          'call','email','whatsapp','meeting','site_visit','other'
        ) NOT NULL DEFAULT 'other',
        next_followup_date DATE DEFAULT NULL,
        is_completed TINYINT DEFAULT 0,
        completed_at DATETIME DEFAULT NULL,
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
        FOREIGN KEY (quotation_id) REFERENCES quotations(id) ON DELETE CASCADE,
        INDEX idx_qf_quotation (quotation_id)
      ) ENGINE=InnoDB;
    `);
  } finally {
    if (conn) conn.release();
  }
}


// ---------- DB schema initialization (RUN ONCE AT STARTUP) ----------


(async function initDatabaseSchema() {
  try {
    console.log('Initializing database schema...');
    await ensureUsersTable();
    await ensureCustomersTable();
    await ensureCustomerLocationsTable();
    await ensureCustomerContactsTable();
    await ensureProductsTable();
    await ensureQuotationsTable();
    await ensureQuotationFollowupsTable();
    await ensureQuotationVersionsTable();
    
    await ensureNotificationsTable();
    console.log('Database schema ready');
  } catch (err) {
    console.error('❌ Failed to initialize DB schema:', err);
    process.exit(1);
  }
})();



// ---------- Auth middleware ----------
function authMiddleware(req, res, next) {
  const header = req.headers.authorization;
  if (!header) return res.status(401).json({ error: 'missing authorization header' });
  const parts = header.split(' ');
  if (parts.length !== 2 || parts[0] !== 'Bearer') return res.status(401).json({ error: 'invalid authorization format' });
  const token = parts[1];
  try {
    const payload = jwt.verify(token, JWT_SECRET);
    req.user = payload;
    return next();
  } catch (e) {
    return res.status(401).json({ error: 'invalid or expired token' });
  }
}

// ---------- Optional routers (kept as before if present) ----------
try {
  const quotationsRouter = require('./routes/quotations.js');
  // mount under plural to match endpoints and frontend (/api/quotations/...)
  app.use('/api/quotations', quotationsRouter);
  console.log('Mounted /api/quotations router from ./routes/quotation');
} catch (err) {
  console.warn('quotations router not mounted (missing ./routes/quotation):', err && err.message);
}

try {
  const quotationsAdvancedRouter = require('./routes/quotations-advanced');
  app.use('/api/v2/quotations', quotationsAdvancedRouter);
  console.log('Mounted /api/v2/quotations router from ./routes/quotations-advanced');
} catch (err) {
  console.warn('quotations-advanced router not mounted:', err && err.message);
}

try {
  const salesOrdersRouter = require('./routes/sales-orders');
  app.use('/api/sales-orders', salesOrdersRouter);
  console.log('Mounted /api/sales-orders router from ./routes/sales-orders');
} catch (err) {
  console.warn('sales-orders router not mounted:', err && err.message);
}

try {
  const reportsRouter = require('./routes/reports');
  app.use('/api/reports', reportsRouter);
  console.log('Mounted /api/reports router from ./routes/reports');
} catch (err) {
  console.warn('reports router not mounted:', err && err.message);
}

try {
  const remindersRouter = require('./routes/reminders');
  app.use('/api/quotations/reminders', remindersRouter);
  console.log('Mounted /api/quotations/reminders router from ./routes/reminders');
} catch (err) {
  console.warn('reminders router not mounted:', err && err.message);
}

// ---------- Health / debug ----------
app.get('/api/health', (req, res) => res.json({ status: 'ok' }));
app.get('/api/debug-headers', (req, res) => {
  const header = req.headers.authorization || null;
  const masked = header ? (typeof header === 'string' ? (header.slice(0, 20) + '...') : true) : null;
  res.json({ hasAuthorization: !!header, maskedAuthorization: masked });
});

// ---------- Auth routes ----------
// ---------- Auth routes ----------
app.post('/api/login', async (req, res) => {
  const { username, email, password } = req.body || {};

  if (!email || !password) {
    return res.status(400).json({
      error: 'missing_credentials',
      message: 'email and password are required',
    });
  }

  const USERNAME_REGEX =
    /^(?=.*[A-Z])(?=.*[0-9])(?=.*[@_])[A-Za-z0-9@_]{4,100}$/;

  let conn;
  try {
    conn = await db.getConnection();

    let rows;

    /* ================= ADMIN LOGIN ================= */
    if (!username) {
      // Admin login: email + password only
      [rows] = await conn.query(
        `SELECT 
           id,
           username,
           email,
           name,
           password_hash,
           role,
           is_active
         FROM users
         WHERE email = ? AND role = 'admin'
         LIMIT 1`,
        [email]
      );
    } 
    /* ================= NON-ADMIN LOGIN ================= */
    else {
      if (!USERNAME_REGEX.test(username)) {
        return res.status(400).json({
          error: 'invalid_username_format',
          message:
            'Username must contain at least one capital letter, one number, and @ or _',
        });
      }

      [rows] = await conn.query(
        `SELECT 
           id,
           username,
           email,
           name,
           password_hash,
           role,
           is_active
         FROM users
         WHERE username = ? AND email = ?
         LIMIT 1`,
        [username, email]
      );
    }

    if (!rows || !rows[0]) {
      return res.status(401).json({ error: 'invalid_credentials' });
    }

    const user = rows[0];

    if (user.is_active === 0) {
      return res.status(403).json({
        error: 'account_disabled',
        message: 'Your account has been disabled. Please contact admin.',
      });
    }

    const match = await bcrypt.compare(password, user.password_hash);
    if (!match) {
      return res.status(401).json({ error: 'invalid_credentials' });
    }

    // JWT payload (unchanged)
    const tokenPayload = {
      id: user.id,
      email: user.email,
      role: user.role,
      name: user.name,
    };

    const token = jwt.sign(tokenPayload, JWT_SECRET, {
      expiresIn: '8h',
    });

    return res.json({
      token,
      user: {
        id: user.id,
        username: user.username, // may be internal for admin
        email: user.email,
        name: user.name,
        role: user.role,
      },
    });
  } catch (err) {
    console.error('Login error:', err && err.message ? err.message : err);
    return res.status(500).json({ error: 'server error' });
  } finally {
    if (conn) try { await conn.release(); } catch {}
  }
});



app.post('/api/register', async (req, res) => {
  const { name, email, password } = req.body || {};
  if (!email || !password || !name) return res.status(400).json({ error: 'name, email and password required' });

  let conn;
  try {
    
    conn = await db.getConnection();

    const [existing] = await conn.query('SELECT id FROM users WHERE email = ? AND name = ? LIMIT 1', [email, name]);
    if (existing && existing.length > 0) {
      return res.status(409).json({ error: 'account_exists', message: 'An account with this email and name already exists' });
    }

    const saltRounds = parseInt(process.env.BCRYPT_SALT_ROUNDS || '10', 10);
    const hash = await bcrypt.hash(password, saltRounds);

    let r;
    try {
      [r] = await conn.query('INSERT INTO users (email, name, password_hash) VALUES (?, ?, ?)', [email, name, hash]);
    } catch (sqlErr) {
      if (sqlErr && sqlErr.code === 'ER_DUP_ENTRY') {
        return res.status(409).json({ error: 'account_exists', message: 'An account with this email and name already exists (duplicate key)' });
      }
      throw sqlErr;
    }

    const [rows] = await conn.query('SELECT id, email, name, role FROM users WHERE id = ? LIMIT 1', [r.insertId]);
    const created = Array.isArray(rows) && rows[0] ? rows[0] : null;
    if (!created) return res.status(500).json({ error: 'create_failed' });

    const payload = { id: created.id, email: created.email, name: created.name || created.email, role: created.role || 'user' };
    const token = jwt.sign(payload, JWT_SECRET, { expiresIn: '8h' });
    return res.status(201).json({ token, user: payload });
  } catch (err) {
    console.error('Register error:', err && err.message ? err.message : err);
    return res.status(500).json({ error: 'server error', details: err && err.message });
  } finally {
    if (conn) try { await conn.release(); } catch (e) {}
  }
});

// ---------- User info ----------
app.get('/api/me', authMiddleware, (req, res) => {
  try {
    res.json({ user: req.user });
  } catch (err) {
    console.error('Error in /api/me:', err);
    res.status(500).json({ error: 'server error' });
  }
});

// ---------- Stats ----------
app.get('/api/stats', async (req, res) => {
  let conn;
  try {
    
    conn = await db.getConnection();
    const [rows] = await conn.query('SELECT COUNT(*) as total FROM quotations WHERE is_deleted = 0');
    const total = (rows && rows[0] && rows[0].total) ? rows[0].total : 0;
    res.json({ totalQuotations: total });
  } catch (err) {
    console.error('Error fetching stats:', err && err.message ? err.message : err);
    res.status(500).json({ error: 'db error' });
  } finally {
    if (conn) try { await conn.release(); } catch (e) {}
  }
});

// ---------- Recent & list quotations (protected & filtered) ----------
app.get('/api/quotations/recent', authMiddleware, async (req, res) => {
  let conn;
  try {
    conn = await db.getConnection();

    const role = String(req.user?.role || '').toLowerCase();
    const userId = Number(req.user?.id || 0);
    const isAdmin = role === 'admin';

    const whereClause = isAdmin
      ? 'q.is_deleted = 0'
      : (userId ? 'q.is_deleted = 0 AND q.salesperson_id = ?' : 'q.is_deleted = 0 AND 1 = 0');

    const params = isAdmin ? [] : [userId];

    const [rows] = await conn.query(`
      SELECT
        q.id,
        q.quotation_no,
        q.items,
        q.total_value,
        q.status,
        q.created_at,

        u.name AS salesperson_name,

        c.id   AS customer_id,
        c.company_name,

        l.id   AS location_id,
        l.location_name,

        ct.id  AS contact_id,
        ct.contact_name

      FROM quotations q
      LEFT JOIN users u
        ON u.id = q.salesperson_id

      LEFT JOIN customers c
        ON c.id = q.customer_id

      LEFT JOIN customer_locations l
        ON l.id = q.customer_location_id

      LEFT JOIN customer_contacts ct
        ON ct.id = q.customer_contact_id

      WHERE ${whereClause}
      ORDER BY q.created_at DESC
      LIMIT 10
    `, params);

    const parsed = rows.map(r => {
      const items = safeJsonParse(r.items, []);
      const productNames = Array.isArray(items)
        ? items.map(it => it.name || it.product_name || '').filter(Boolean)
        : [];

      return {
        id: r.id,
        quotation_no: fixYearFormat(r.quotation_no),
        status: r.status,
        total_value: r.total_value,
        created_at: r.created_at,

        productNames,
        salesperson_name: r.salesperson_name || null,

        customer: r.customer_id ? {
          id: r.customer_id,
          company_name: r.company_name
        } : null,

        location: r.location_id ? {
          id: r.location_id,
          name: r.location_name
        } : null,

        contact: r.contact_id ? {
          id: r.contact_id,
          name: r.contact_name
        } : null
      };
    });

    res.json(parsed);
  } catch (err) {
    console.error('Error fetching recent quotations:', err);
    res.status(500).json({ error: 'db error' });
  } finally {
    if (conn) try { conn.release(); } catch {}
  }
});

// ---------- Get quotations (list) ----------
app.get('/api/quotations', authMiddleware, async (req, res) => {
  let conn;
  try {
    conn = await db.getConnection();

    const role = String(req.user?.role || '').toLowerCase();
    const userId = Number(req.user?.id || 0);
    const isAdmin = role === 'admin';

    let sql = `
      SELECT
        q.id,
        q.quotation_no,
        q.customer_id,
        q.customer_name,
        q.customer_location_id,
        q.customer_contact_id,
        q.items,
        q.total_value,
        q.status,
        q.version,
        q.created_at,
        q.quotation_date,
        q.validity_days,
         q.payment_terms,

        DATE_ADD(q.quotation_date, INTERVAL q.validity_days DAY) AS valid_until,

        DATEDIFF(
          DATE_ADD(q.quotation_date, INTERVAL q.validity_days DAY),
          CURRENT_DATE
        ) AS remaining_days,

        DATEDIFF(
  DATE_ADD(q.quotation_date, INTERVAL q.validity_days DAY),
  CURRENT_DATE
) AS remaining_days,

CASE
  WHEN DATEDIFF(
         DATE_ADD(q.quotation_date, INTERVAL q.validity_days DAY),
         CURRENT_DATE
       ) <= -1 THEN 'expired'
  WHEN DATEDIFF(
         DATE_ADD(q.quotation_date, INTERVAL q.validity_days DAY),
         CURRENT_DATE
       ) = 0 THEN 'overdue'
  WHEN DATEDIFF(
         DATE_ADD(q.quotation_date, INTERVAL q.validity_days DAY),
         CURRENT_DATE
       ) BETWEEN 1 AND 2 THEN 'due'
  ELSE 'valid'
END AS validity_state,

        u.name AS salesperson_name,

        c.company_name,
        c.gstin AS customer_gstin,

        l.location_name,
        l.address AS location_address,
        l.city,
        l.state,

        MAX(f.followup_date) AS next_followup_date,

        ct.contact_name,
        ct.phone AS contact_phone,
        ct.email AS contact_email

     FROM quotations q

LEFT JOIN quotation_followups f
  ON f.quotation_id = q.id

LEFT JOIN users u
  ON u.id = q.salesperson_id

LEFT JOIN customers c
  ON c.id = q.customer_id

LEFT JOIN customer_locations l
  ON l.id = q.customer_location_id

LEFT JOIN customer_contacts ct
  ON ct.id = q.customer_contact_id
 AND ct.is_active = 1

WHERE q.is_deleted = 0
    `;

    const params = [];

    if (!isAdmin) {
      if (!userId) return res.json([]);
      sql += ' AND q.salesperson_id = ?';
      params.push(userId);
    }

    sql += ' GROUP BY q.id ORDER BY q.created_at DESC';

    const [rows] = await conn.query(sql, params);

    const out = rows.map(r => {


      // Safe items parsing
      let items = [];
      try {
        items = safeJsonParse(r.items, []);
      } catch (e) {
        console.error('Invalid items JSON for quotation', r.id, e);
      }

      return {
        id: r.id,
        quotation_no: fixYearFormat(r.quotation_no),
        status: r.status,
        version: r.version,
        total_value: r.total_value,
        created_at: r.created_at,
         payment_terms: r.payment_terms || null,

        next_followup_date: r.next_followup_date,

        validity: {
         quotation_date: r.quotation_date,
         validity_days: r.validity_days,
         valid_until: r.valid_until,
         remaining_days: r.remaining_days,
         validity_state: r.validity_state
        },
        items,

        salesperson_name: r.salesperson_name || null,

        customer: {
          id: r.customer_id,
          company_name: r.company_name || r.customer_name || '—',
          gstin: r.customer_gstin || null
        },

        location: r.customer_location_id ? {
          name: r.location_name || '—',
          address: r.location_address || null,
          city: r.city || null,
          state: r.state || null
        } : null,

        contact: r.customer_contact_id && r.contact_name ? {
          id: r.customer_contact_id,
          name: r.contact_name,
          phone: r.contact_phone || null,
          email: r.contact_email || null
        } : null
      };
    });

    res.json(out);
  } catch (err) {
    console.error('Error fetching quotations:', err && err.message ? err.message : err);
    res.status(500).json({ error: 'db error' });
  } finally {
    if (conn) try { conn.release(); } catch {}
  }
});


// ---------- Next quotation preview ----------

async function handleNextQuotation(req, res) {
  let conn;
  try {
    conn = await db.getConnection();

    // 👤 Resolve salesperson initials from logged-in user
    const [[sp]] = await conn.query(
      'SELECT name FROM users WHERE id = ?',
      [req.user.id]
    );

    if (!sp) throw new Error('User not found');

    const initials = sp.name
      .trim()
      .split(/\s+/)
      .map(p => p[0])
      .join('')
      .toUpperCase();

    const fyCode = getFinancialYearCode(new Date());

    // 🔐 Preview must use same lock logic (but rollback)
    await conn.beginTransaction();

    const runningNo = await getNextRunningNumber(conn, fyCode, initials);

    if (conn) await conn.rollback(); // preview only

    const quotation_no =
      `QT/${fyCode}/${initials}/${String(runningNo).padStart(3, '0')}`;

    res.json({ quotation_no });
  } catch (err) {
    if (conn) await conn.rollback();
    console.error('failed to build next quotation number', err);
    res.status(500).json({ error: 'server_error' });
  } finally {
    if (conn) {
      try { await conn.release(); } catch {}
    }
  }
}

app.get('/api/quotations/next', authMiddleware, handleNextQuotation);


// ---------- Socket.IO bootstrap ----------
async function createServerAndIO() {
  

  const httpServer = http.createServer(app);
  const io = new Server(httpServer, {
    cors: {
  origin: allowedOrigins.length ? allowedOrigins : false,
  methods: ['GET', 'POST']
},
    path: '/socket.io'
  });

  io.use((socket, next) => {
    try {
      const token = socket.handshake.auth?.token || socket.handshake.query?.t || null;
      if (!token) {
        socket.user = null;
        return next();
      }
      const user = jwt.verify(token, JWT_SECRET);
      socket.user = user;
      if (user && user.id) socket.join(`user:${user.id}`);
      return next();
    } catch (err) {
      socket.user = null;
      return next(); // allow anonymous connections
    }
  });

  io.on('connection', (socket) => {
    console.log('WS connected', socket.id, 'user:', socket.user?.id ?? 'anon');
    socket.on('disconnect', () => {
      console.log('WS disconnected', socket.id);
    });
  });

  app.locals.io = io;
  app.locals.broadcastNotification = function broadcastNotification(notif) {
    try {
      if (notif && notif.user_id) {
        io.to(`user:${notif.user_id}`).emit('notification', notif);
      } else {
        io.emit('notification', notif);
      }
    } catch (err) {
      console.error('broadcastNotification error', err && err.message ? err.message : err);
    }
  };

  return { httpServer, io };
}

// ---------- Create quotation (protected) ----------
// ---------- Create quotation (protected) ----------
app.post('/api/quotations', authMiddleware, async (req, res) => {
  console.log('\n==== Incoming Create Quotation Request ====');
  console.log('Payload:', JSON.stringify(req.body, null, 2));

  const {
    customer_id,
    customer_location_id,
    customer_contact_id,
    customer_snapshot, // optional (frontend may send, backend rebuilds anyway)
    customer_name,
    salesperson_id,
    quotation_date,
    validity_days,
    payment_terms,
    items,
    terms,
    notes,
    status,
    version
  } = req.body || {};

  /* -------------------- VALIDATION -------------------- */

  if (!customer_id) {
    return res.status(400).json({ error: 'customer_id is required' });
  }
  if (!customer_location_id) {
    return res.status(400).json({ error: 'customer_location_id is required' });
  }
  if (!customer_contact_id) {
    return res.status(400).json({ error: 'customer_contact_id is required' });
  }

  const finalCustomerName =
    customer_name ||
    customer_snapshot?.company_name ||
    null;

  if (!finalCustomerName) {
    return res.status(400).json({
      error: 'customer_name_missing',
      message: 'customer_snapshot.company_name is required'
    });
  }

  let conn;
  try {
    conn = await db.getConnection();
    await conn.beginTransaction();

    /* -------------------- NORMALIZE DATA -------------------- */

    const dbDate = normalizeDateForDb(quotation_date);
    const totals = calculateTotals(items || []);
    const itemsJson = items ? JSON.stringify(items) : null;

    const normalizedPaymentTerms =
  typeof payment_terms === "string" && payment_terms.trim()
    ? payment_terms.trim()
    : null;

    /* -------------------- SALESPERSON -------------------- */

    const actorId =
      req.user && req.user.id != null ? Number(req.user.id) : null;

    const salespersonToSave =
      salesperson_id != null ? salesperson_id : actorId;

    const [userRows] = await conn.query(
      'SELECT phone, email FROM users WHERE id = ?',
      [salespersonToSave]
    );

    const salesperson = userRows?.[0] || {};

    /* -------------------- CUSTOMER SNAPSHOT -------------------- */

    const [custRows] = await conn.query(
      'SELECT company_name FROM customers WHERE id = ?',
      [customer_id]
    );

    const [locRows] = await conn.query(
      `SELECT location_name, gstin, address, city, state
       FROM customer_locations
       WHERE id = ?`,
      [customer_location_id]
    );

    const [contactRows] = await conn.query(
      `SELECT contact_name, phone, email
       FROM customer_contacts
       WHERE id = ?`,
      [customer_contact_id]
    );

    const snapshot = {
      company_name: custRows?.[0]?.company_name || null,
      location_name: locRows?.[0]?.location_name || null,
      gstin: locRows?.[0]?.gstin || null,
      address: locRows?.[0]?.address || null,
      city: locRows?.[0]?.city || null,
      state: locRows?.[0]?.state || null,
      contact_name: contactRows?.[0]?.contact_name || null,
      phone: contactRows?.[0]?.phone || null,
      email: contactRows?.[0]?.email || null
    };

    const snapshotJson = JSON.stringify(snapshot);

    console.log('Saving customer snapshot:', snapshotJson);

    /* -------------------- INSERT QUOTATION -------------------- */

    const [ins] = await conn.query(
      `
      INSERT INTO quotations
      (
        quotation_no,
        customer_id,
        customer_name,

        customer_location_id,
        customer_contact_id,
        customer_snapshot,

        salesperson_id,
        salesperson_phone,
        salesperson_email,

        quotation_date,
        validity_days,
        payment_terms,

        items,
        subtotal,
        total_discount,
        tax_total,
        total_value,

        terms,
        notes,
        status,
        version
      )
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
      `,
      [
        null,
        customer_id,
        finalCustomerName,

        customer_location_id,
        customer_contact_id,
        snapshotJson,

        salespersonToSave,
        salesperson.phone || null,
        salesperson.email || null,

        dbDate,
        validity_days || 30,
        normalizedPaymentTerms,

        itemsJson,
        totals.subtotal,
        totals.total_discount,
        totals.tax_total,
        totals.grand_total,

        terms || null,
        notes || null,
        (status || 'draft').toLowerCase(),
        version || '0.1'
      ]
    );

    /* -------------------- GENERATE QUOTATION NO -------------------- */
    const [[sp]] = await conn.query(
  'SELECT name FROM users WHERE id = ?',
  [salespersonToSave]
);

if (!sp) {
  throw new Error('Salesperson not found for quotation numbering');
}

const initials = sp.name
  .trim()
  .split(/\s+/)
  .map(p => p[0])
  .join('')
  .toUpperCase();

const fyCode = getFinancialYearCode(
  dbDate ? new Date(dbDate) : new Date()
);


const runningNo = await getNextRunningNumber(conn, fyCode, initials);

const quotation_no =
  `QT/${fyCode}/${initials}/${String(runningNo).padStart(3, '0')}`;

const newId = ins.insertId;

await conn.query(
  'UPDATE quotations SET quotation_no = ? WHERE id = ?',
  [quotation_no, newId]
);
    await conn.commit();


    console.log('Quotation created:', quotation_no);

    return res.status(201).json({ id: newId, quotation_no });

  } catch (err) {
    console.error('\n❌ ERROR CREATING QUOTATION', err);
    return res.status(500).json({
      error: 'db error',
      details: err?.message
    });
  } finally {
    if (conn) {
      try { await conn.release(); } catch {}
    }
  }
});

// ---------- Get quotation by id (protected + visibility enforcement) ----------
app.get('/api/quotations/:id', authMiddleware, async (req, res) => {
  let conn;
  try {
    const id = Number(req.params.id);
    if (!id) {
      return res.status(400).json({ error: 'invalid id' });
    }

    conn = await db.getConnection();

    const [rows] = await conn.query(
      `
      SELECT
        q.*,
        q.customer_snapshot,     
        
          DATE_ADD(q.quotation_date, INTERVAL q.validity_days DAY) AS valid_until,

  DATEDIFF(
    DATE_ADD(q.quotation_date, INTERVAL q.validity_days DAY),
    CURRENT_DATE
  ) AS remaining_days,

  CASE
    WHEN DATEDIFF(
           DATE_ADD(q.quotation_date, INTERVAL q.validity_days DAY),
           CURRENT_DATE
         ) <= -1 THEN 'expired'
    WHEN DATEDIFF(
           DATE_ADD(q.quotation_date, INTERVAL q.validity_days DAY),
           CURRENT_DATE
         ) = 0 THEN 'overdue'
    WHEN DATEDIFF(
           DATE_ADD(q.quotation_date, INTERVAL q.validity_days DAY),
           CURRENT_DATE
         ) BETWEEN 1 AND 2 THEN 'due'
    ELSE 'valid'
  END AS validity_state,

        u.name  AS salesperson_name,
        u.phone AS salesperson_phone,
        u.email AS salesperson_email,

        c.id AS customer_id,
        c.company_name,

        l.id AS location_id,
        l.location_name,
        l.address AS location_address,
        l.city,
        l.state,
        l.gstin AS location_gstin,

        ct.id AS contact_id,
        ct.contact_name,
        ct.phone AS contact_phone,
        ct.email AS contact_email

      FROM quotations q
      LEFT JOIN users u ON u.id = q.salesperson_id
      LEFT JOIN customers c ON c.id = q.customer_id
      LEFT JOIN customer_locations l ON l.id = q.customer_location_id
      LEFT JOIN customer_contacts ct ON ct.id = q.customer_contact_id
      WHERE q.id = ? AND q.is_deleted = 0
      LIMIT 1
      `,
      [id]
    );

    if (!rows.length) {
      return res.status(404).json({ error: 'not found' });
    }

    const q = rows[0];

    /* 🔐 Access control */
    const role = String(req.user?.role || '').toLowerCase();
    if (role !== 'admin' && q.salesperson_id !== req.user.id) {
      return res.status(403).json({ error: 'forbidden' });
    }

    /* ✅ Normalize items ONCE */
    const rawItems = safeJsonParse(q.items, []);
    const items = Array.isArray(rawItems)
      ? rawItems.map(it => ({
          product_id: it.product_id ?? null,
          product_name: it.product_name ?? it.name ?? '—',
          description: it.description ?? '',
          qty: Number(it.qty ?? it.quantity ?? 0),
          uom: it.uom ?? 'NOS',
          discount_percent: Number(it.discount_percent ?? 0),
          unit_price: Number(it.unit_price ?? it.price ?? 0),
          tax_rate: Number(it.tax_rate ?? 0),
        }))
      : [];

    /* ✅ PARSE CUSTOMER SNAPSHOT */
    let customerSnapshot = null;
    if (q.customer_snapshot) {
      try {
        customerSnapshot =
          typeof q.customer_snapshot === 'string'
            ? JSON.parse(q.customer_snapshot)
            : q.customer_snapshot;
      } catch {
        customerSnapshot = null;
      }
    }

    /* ✅ RESPONSE */
    return res.json({
      quotation: {
        id: q.id,
        quotation_no: fixYearFormat(q.quotation_no),
        status: q.status,
        version: q.version,
        total_value: q.total_value,
        created_at: q.created_at,
        quotation_date: q.quotation_date,
        terms: q.terms,
        notes: q.notes,
        validity_days: q.validity_days,

        payment_terms: q.payment_terms ?? null,

         validity: {
    quotation_date: q.quotation_date,
    validity_days: q.validity_days,
    valid_until: q.valid_until,
    remaining_days: q.remaining_days,
    validity_state: q.validity_state
  },

        customer_snapshot: customerSnapshot,     

        customer_name: q.company_name,
        customer_address: q.location_address || q.customer_address,
        customer_gst: q.location_gstin,
        customer_phone: q.contact_phone,
        customer_email: q.contact_email,
        customer_contact_person: q.contact_name,

        salesperson_id: q.salesperson_id,
        salesperson_name: q.salesperson_name,
        salesperson_phone: q.salesperson_phone,
        salesperson_email: q.salesperson_email,

        approved_by: q.approved_by,
        approved_at: q.approved_at,

        items,

        customer: q.customer_id
          ? {
              id: q.customer_id,
              company_name: q.company_name,
            }
          : null,

        location: q.location_id
          ? {
              id: q.location_id,
              location_name: q.location_name,
              address: q.location_address,
              city: q.city,
              state: q.state,
              gstin: q.location_gstin,
            }
          : null,

        contact: q.contact_id
          ? {
              id: q.contact_id,
              contact_name: q.contact_name,
              phone: q.contact_phone,
              email: q.contact_email,
            }
          : null,
      },
    });

  } catch (err) {
    console.error('Quotation fetch failed:', err);
    return res.status(500).json({ error: 'db error' });
  } finally {
    if (conn) conn.release();
  }
});


// ---------- Re-issue quotation (protected) ----------

app.post('/api/quotations/:id/reissue', authMiddleware, async (req, res) => {
  const sourceId = Number(req.params.id);
  const { validity_days = 30 } = req.body;

  if (!sourceId || !Number.isInteger(validity_days) || validity_days <= 0) {
    return res.status(400).json({ error: 'Invalid re-issue request' });
  }

  let conn;
  try {
    conn = await db.getConnection();
    await conn.beginTransaction();

    // 🔒 Lock source quotation
    const [[source]] = await conn.query(
      `
      SELECT
        q.*,
        CASE
          WHEN DATEDIFF(
                 DATE_ADD(q.quotation_date, INTERVAL q.validity_days DAY),
                 CURRENT_DATE
               ) <= -1 THEN 'expired'
          ELSE 'active'
        END AS validity_state
      FROM quotations q
      WHERE q.id = ?
      FOR UPDATE
      `,
      [sourceId]
    );

    if (!source) {
      return res.status(404).json({ error: 'Source quotation not found' });
    }

    if (source.validity_state !== 'expired') {
      return res.status(409).json({
        error: 'Only expired quotations can be re-issued',
      });
    }

    if (source.status === 'won' || source.status === 'lost') {
      return res.status(409).json({
        error: 'Cannot re-issue a closed quotation',
      });
    }

    // 👤 Fetch salesperson initials
    const [[sp]] = await conn.query(
      'SELECT name FROM users WHERE id = ?',
      [source.salesperson_id]
    );

    if (!sp) {
      throw new Error('Salesperson not found');
    }

    const initials = sp.name
      .trim()
      .split(/\s+/)
      .map(p => p[0])
      .join('')
      .toUpperCase();

    // 🔢 Generate quotation number
    const fyCode = getFinancialYearCode(new Date());
    const runningNo = await getNextRunningNumber(conn, fyCode, initials);
    const quotation_no = `QT/${fyCode}/${initials}/${String(runningNo).padStart(3, '0')}`;

    const itemsJson =
      typeof source.items === 'string'
        ? source.items
        : JSON.stringify(source.items ?? []);
    

    const customerSnapshotJson =
  typeof source.customer_snapshot === 'string'
    ? source.customer_snapshot
    : JSON.stringify(source.customer_snapshot ?? {});    


    // 🧬 Clone quotation
// 🧬 Clone quotation (NEW quotation)
const [result] = await conn.query(
  `
  INSERT INTO quotations (
    quotation_no,
    quotation_date,
    validity_days,
    customer_id,
    customer_location_id,
    customer_contact_id,
    salesperson_id,
    customer_snapshot,
    items,
    terms,
    notes,
    total_value,
    status,
    version,
    is_deleted,
    reissued_from_id,
    created_at
  )
  VALUES (
    ?,
    CURRENT_DATE,
    ?,
    ?,
    ?,
    ?,
    ?,
    ?,
    ?,
    ?,
    ?,
    ?,
    'pending',
    '1.0',
    0,
    NULL,
    NOW()
  )
  `,
  [
    quotation_no,
    validity_days,
    source.customer_id,
    source.customer_location_id,
    source.customer_contact_id,
    source.salesperson_id,
    customerSnapshotJson,
    itemsJson,
    source.terms ?? null,
    source.notes ?? null,
    source.total_value ?? 0,
  ]
);

const newQuotationId = result.insertId;

/* 🔒 MARK OLD QUOTATION AS REISSUED (CRITICAL) */
await conn.query(
  `
  UPDATE quotations
  SET reissued_from_id = ?
  WHERE id = ?
  `,
  [newQuotationId, source.id]
);


    await conn.commit();
    return res.json({ id: newQuotationId });

  } catch (err) {
    if (conn) await conn.rollback();
    console.error('Re-issue failed:', err);
    return res.status(500).json({ error: 'Failed to re-issue quotation' });
  } finally {
    if (conn) conn.release();
  }
});

// ---------- Notifications ----------
app.get('/api/notifications', authMiddleware, async (req, res) => {
  let conn;
  try {
   
    conn = await db.getConnection();
    const userId = req.user?.id ?? null;
    const [rows] = await conn.query(
  `SELECT id, uuid, title, description, url, user_id, created_at
   FROM notifications
   WHERE user_id IS NULL OR user_id = ?
   ORDER BY created_at DESC
   LIMIT 200`,
  [userId]
);
    const out = (rows || []).map(r => ({
      id: r.id,
      uuid: r.uuid,
      title: r.title,
      description: r.description,
      url: r.url,
      user_id: r.user_id,
      createdAt: (r.created_at instanceof Date) ? r.created_at.toISOString() : String(r.created_at)
    }));
    res.json(out);
  } catch (err) {
    console.error('Error fetching notifications:', err && err.message ? err.message : err);
    res.status(500).json({ error: 'db error', details: err && err.message });
  } finally {
    if (conn) try { await conn.release(); } catch (e) {}
  }
});

//--- PDF Router mount---///

const quotationPdfRouter = require('./routes/quotation-pdf');
app.use('/api/quotations', quotationPdfRouter);

// ---------- Customers CRUD ----------
app.get('/api/customers', async (req, res) => {
  let conn;
  try {
    
    conn = await db.getConnection();
    const [rows] = await conn.query('SELECT id, company_name, gstin, address, created_at FROM customers ORDER BY created_at DESC');
    res.json(rows);
  } catch (err) {
    console.error('customers GET error', err && err.message ? err.message : err);
    res.status(500).json({ error: 'db error', details: err && err.message });
  } finally {
    if (conn) try { await conn.release(); } catch (e) {}
  }
});

app.post('/api/customers', async (req, res) => {
  let conn;
  try {
    const { company_name, name, gstin, address } = req.body || {};
    const custName = (company_name || name || '').trim();

    if (!custName) {
      return res.status(400).json({ error: 'company_name required' });
    }

    conn = await db.getConnection();

    const [result] = await conn.query(
      `INSERT INTO customers
       SET company_name = ?, gstin = ?, address = ?`,
        [custName, gstin || null, address || null]
      );

    const [rows] = await conn.query(
      `SELECT id, company_name, gstin, address, created_at
       FROM customers
       WHERE id = ?`,
      [result.insertId]
    );

    res.status(201).json(rows[0]);
  } catch (err) {
  console.error('create customer error:', err.sqlMessage || err.message || err);
  res.status(500).json({
    error: 'db error',
    details: err.sqlMessage || err.message
  });
  } finally {
    if (conn) conn.release();
  }
});

app.put('/api/customers/:id', async (req, res) => {
  let conn;
  const id = Number(req.params.id);

  try {
    const { company_name, name, gstin, address } = req.body || {};
    const custName = (company_name || name || '').trim();

    if (!custName) {
      return res.status(400).json({ error: 'company_name required' });
    }

    conn = await db.getConnection();

    const [result] = await conn.query(
      `UPDATE customers
       SET company_name = ?, gstin = ?, address = ?
       WHERE id = ?`,
      [custName, gstin || null, address || null, id]
    );

    if (result.affectedRows === 0) {
      return res.status(404).json({ error: 'not found' });
    }

    const [rows] = await conn.query(
      `SELECT id, company_name, gstin, address, created_at
       FROM customers
       WHERE id = ?`,
      [id]
    );

    res.json(rows[0]);
  } catch (err) {
    console.error('update customer error', err);
    res.status(500).json({ error: 'db error' });
  } finally {
    if (conn) conn.release();
  }
});

app.delete('/api/customers/:id', /* authMiddleware, */ async (req, res) => {
  let conn;
  const { id } = req.params;
  try {
    conn = await db.getConnection();
    const [r] = await conn.query('DELETE FROM customers WHERE id = ?', [id]);
    res.json({ affectedRows: r.affectedRows });
  } catch (err) {
    console.error('delete customer error', err && err.message ? err.message : err);
    res.status(500).json({ error: 'db error', details: err && err.message });
  } finally {
    if (conn) try { await conn.release(); } catch (e) {}
  }
});

// ========== CUSTOMER LOCATIONS CRUD ==========

app.get('/api/customers/:customerId/locations', async (req, res) => {
  let conn;
  const customerId = Number(req.params.customerId);
  try {
    conn = await db.getConnection();
    const [rows] = await conn.query(
      `SELECT id, customer_id, location_name, gstin, address, city, state, is_active, created_at 
       FROM customer_locations 
       WHERE customer_id = ? AND is_active = 1
       ORDER BY created_at DESC`,
      [customerId]
    );
    res.json(rows || []);
  } catch (err) {
    console.error('get locations error', err);
    res.status(500).json({ error: 'db error' });
  } finally {
    if (conn) try { await conn.release(); } catch (e) {}
  }
});

app.post('/api/customers/:customerId/locations', async (req, res) => {
  let conn;
  const customerId = Number(req.params.customerId);
  try {
    const { location_name, gstin, address, city, state } = req.body || {};

    if (!location_name || !location_name.trim()) {
      return res.status(400).json({ error: 'location_name required' });
    }

    conn = await db.getConnection();

    // Verify customer exists
    const [custRows] = await conn.query('SELECT id FROM customers WHERE id = ?', [customerId]);
    if (!custRows || custRows.length === 0) {
      return res.status(404).json({ error: 'customer not found' });
    }

    const [result] = await conn.query(
      `INSERT INTO customer_locations (customer_id, location_name, gstin, address, city, state)
       VALUES (?, ?, ?, ?, ?, ?)`,
      [customerId, location_name.trim(), gstin || null, address || null, city || null, state || null]
    );

    const [rows] = await conn.query(
      `SELECT id, customer_id, location_name, gstin, address, city, state, is_active, created_at 
       FROM customer_locations 
       WHERE id = ?`,
      [result.insertId]
    );

    res.status(201).json(rows[0]);
  } catch (err) {
    console.error('create location error', err);
    res.status(500).json({ error: 'db error' });
  } finally {
    if (conn) try { await conn.release(); } catch (e) {}
  }
});

app.put('/api/customers/:customerId/locations/:locationId', async (req, res) => {
  let conn;
  const customerId = Number(req.params.customerId);
  const locationId = Number(req.params.locationId);
  try {
    const { location_name, gstin, address, city, state } = req.body || {};

    if (!location_name || !location_name.trim()) {
      return res.status(400).json({ error: 'location_name required' });
    }

    conn = await db.getConnection();

    const [result] = await conn.query(
      `UPDATE customer_locations 
       SET location_name = ?, gstin = ?, address = ?, city = ?, state = ?
       WHERE id = ? AND customer_id = ?`,
      [location_name.trim(), gstin || null, address || null, city || null, state || null, locationId, customerId]
    );

    if (result.affectedRows === 0) {
      return res.status(404).json({ error: 'location not found' });
    }

    const [rows] = await conn.query(
      `SELECT id, customer_id, location_name, gstin, address, city, state, is_active, created_at 
       FROM customer_locations 
       WHERE id = ?`,
      [locationId]
    );

    res.json(rows[0]);
  } catch (err) {
    console.error('update location error', err);
    res.status(500).json({ error: 'db error' });
  } finally {
    if (conn) try { await conn.release(); } catch (e) {}
  }
});

app.delete('/api/customers/:customerId/locations/:locationId', async (req, res) => {
  let conn;
  const customerId = Number(req.params.customerId);
  const locationId = Number(req.params.locationId);
  try {
    conn = await db.getConnection();
    
    // Soft delete: set is_active = 0
    const [result] = await conn.query(
      `UPDATE customer_locations 
       SET is_active = 0 
       WHERE id = ? AND customer_id = ?`,
      [locationId, customerId]
    );

    if (result.affectedRows === 0) {
      return res.status(404).json({ error: 'location not found' });
    }

    res.json({ success: true, affectedRows: result.affectedRows });
  } catch (err) {
    console.error('delete location error', err);
    res.status(500).json({ error: 'db error' });
  } finally {
    if (conn) try { await conn.release(); } catch (e) {}
  }
});

// ========== CUSTOMER CONTACTS CRUD ==========

app.get('/api/customer-locations/:locationId/contacts', async (req, res) => {
  let conn;
  const locationId = Number(req.params.locationId);

  try {
    conn = await db.getConnection();

    const [rows] = await conn.query(
      `SELECT id, customer_location_id, contact_name, phone, email, is_primary, is_active, created_at
       FROM customer_contacts
       WHERE customer_location_id = ? AND is_active = 1
       ORDER BY is_primary DESC, created_at DESC`,
      [locationId]
    );

    res.json(rows || []);
  } catch (err) {
    console.error('get contacts error', err);
    res.status(500).json({ error: 'db error' });
  } finally {
    if (conn) try { await conn.release(); } catch {}
  }
});

app.post('/api/customer-locations/:locationId/contacts', async (req, res) => {
  let conn;
  const locationId = Number(req.params.locationId);

  try {
    const { contact_name, phone, email, is_primary } = req.body || {};

    if (!contact_name?.trim()) {
      return res.status(400).json({ error: 'contact_name required' });
    }

    conn = await db.getConnection();

    const [locRows] = await conn.query(
      'SELECT id FROM customer_locations WHERE id = ?',
      [locationId]
    );
    if (locRows.length === 0) {
      return res.status(404).json({ error: 'location not found' });
    }

    if (is_primary) {
      await conn.query(
        `UPDATE customer_contacts SET is_primary = 0 WHERE customer_location_id = ?`,
        [locationId]
      );
    }

    const [result] = await conn.query(
      `INSERT INTO customer_contacts
       (customer_location_id, contact_name, phone, email, is_primary)
       VALUES (?, ?, ?, ?, ?)`,
      [locationId, contact_name.trim(), phone || null, email || null, is_primary ? 1 : 0]
    );

    const [rows] = await conn.query(
      `SELECT id, customer_location_id, contact_name, phone, email, is_primary, is_active, created_at
       FROM customer_contacts
       WHERE id = ?`,
      [result.insertId]
    );

    res.status(201).json(rows[0]);
  } catch (err) {
    console.error('create contact error', err);
    res.status(500).json({ error: 'db error' });
  } finally {
    if (conn) try { await conn.release(); } catch {}
  }
});

app.put('/api/customer-locations/:locationId/contacts/:contactId', async (req, res) => {
  let conn;
  const locationId = Number(req.params.locationId);
  const contactId = Number(req.params.contactId);

  try {
    const { contact_name, phone, email, is_primary } = req.body || {};

    if (!contact_name?.trim()) {
      return res.status(400).json({ error: 'contact_name required' });
    }

    conn = await db.getConnection();

    if (is_primary) {
      await conn.query(
        `UPDATE customer_contacts
         SET is_primary = 0
         WHERE customer_location_id = ? AND id != ?`,
        [locationId, contactId]
      );
    }

    const [result] = await conn.query(
      `UPDATE customer_contacts
       SET contact_name = ?, phone = ?, email = ?, is_primary = ?
       WHERE id = ? AND customer_location_id = ?`,
      [contact_name.trim(), phone || null, email || null, is_primary ? 1 : 0, contactId, locationId]
    );

    if (result.affectedRows === 0) {
      return res.status(404).json({ error: 'contact not found' });
    }

    const [rows] = await conn.query(
      `SELECT id, customer_location_id, contact_name, phone, email, is_primary, is_active, created_at
       FROM customer_contacts
       WHERE id = ?`,
      [contactId]
    );

    res.json(rows[0]);
  } catch (err) {
    console.error('update contact error', err);
    res.status(500).json({ error: 'db error' });
  } finally {
    if (conn) try { await conn.release(); } catch {}
  }
});

app.delete('/api/customer-locations/:locationId/contacts/:contactId', async (req, res) => {
  let conn;
  const locationId = Number(req.params.locationId);
  const contactId = Number(req.params.contactId);

  try {
    conn = await db.getConnection();

    const [result] = await conn.query(
      `UPDATE customer_contacts
       SET is_active = 0
       WHERE id = ? AND customer_location_id = ?`,
      [contactId, locationId]
    );

    if (result.affectedRows === 0) {
      return res.status(404).json({ error: 'contact not found' });
    }

    res.json({ success: true });
  } catch (err) {
    console.error('delete contact error', err);
    res.status(500).json({ error: 'db error' });
  } finally {
    if (conn) try { await conn.release(); } catch {}
  }
});

// Clear primary flag for all contacts in a location
app.put('/api/customer-locations/:locationId/clear-primary', async (req, res) => {
  let conn;
  const locationId = Number(req.params.locationId);
  try {
    conn = await db.getConnection();
    const [result] = await conn.query(
      `UPDATE customer_contacts SET is_primary = 0 WHERE customer_location_id = ?`,
      [locationId]
    );
    res.json({ success: true, affectedRows: result.affectedRows });
  } catch (err) {
    console.error('clear primary contacts error', err);
    res.status(500).json({ error: 'db error' });
  } finally {
    if (conn) try { await conn.release(); } catch (e) {}
  }
});

// ---------- Users list & delete (admin) ----------
app.get('/api/users', authMiddleware, async (req, res) => {
  const requesterRole = (req.user && req.user.role) ? String(req.user.role).toLowerCase() : null;
  if (requesterRole !== 'admin') return res.status(403).json({ error: 'forbidden', message: 'Only admin can list all users' });

  let conn;
  try {
    
    conn = await db.getConnection();
    const [rows] = await conn.query('SELECT id, username, email, name, phone, position, role, is_active, created_at FROM users ORDER BY created_at DESC');
    res.json(rows || []);
  } catch (err) {
    console.error('/api/users error', err && err.message ? err.message : err);
    res.status(500).json({ error: 'db_error', details: err && err.message });
  } finally {
    if (conn) try { await conn.release(); } catch (e) {}
  }
});

app.delete('/api/users/:id', authMiddleware, async (req, res) => {
  let conn;
  try {
    
    const rawId = req.params.id;
    const id = sanitizeIdParam(rawId);
    if (!id) return res.status(400).json({ error: 'invalid id' });

    const requesterRole = (req.user && req.user.role) ? String(req.user.role).toLowerCase() : null;
    const requesterId = (req.user && req.user.id) ? Number(req.user.id) : null;
    if (requesterRole !== 'admin') return res.status(403).json({ error: 'forbidden', message: 'Only admin users can delete accounts' });
    if (requesterId !== null && Number(id) === requesterId) return res.status(400).json({ error: 'cannot_delete_self', message: 'You cannot delete your own account' });

    const force = String(req.query.force || '').toLowerCase() === 'true';
    conn = await db.getConnection();

    const [rows] = await conn.query('SELECT id, email, name, role FROM users WHERE id = ? LIMIT 1', [id]);
    if (!rows || rows.length === 0) return res.status(404).json({ error: 'not_found', message: `User ${id} not found` });

    if (!force) {
      const [qc] = await conn.query('SELECT COUNT(*) AS c FROM quotations WHERE salesperson_id = ? AND is_deleted = 0', [id]);
      const quotationsCount = Array.isArray(qc) && qc[0] ? Number(qc[0].c || 0) : 0;
      if (quotationsCount > 0) {
        return res.status(409).json({
          error: 'cannot_delete_user_has_quotations',
          message: `User has ${quotationsCount} quotations. Use force=true to delete and cascade if desired.`
        });
      }
    }

    if (force) {
      const [delRes] = await conn.query('DELETE FROM users WHERE id = ?', [id]);
      const affected = delRes && (delRes.affectedRows != null) ? delRes.affectedRows : 0;
      try {
        
        const notifUUID = `notif-user-force-delete-${id}-${Date.now()}`;
        const title = `User ${id} force-deleted`;
        const description = `User ${id} (${rows[0].email}) was force-deleted by ${req.user && (req.user.name || req.user.email) ? (req.user.name || req.user.email) : 'admin'}`;
        const url = `/users/${id}`;
        await conn.query('INSERT INTO notifications (uuid, title, description, url, user_id) VALUES (?, ?, ?, ?, ?)', [notifUUID, title, description, url, req.user ? req.user.id : null]);
      } catch (notifErr) {
        console.error('Failed to persist force-delete notification:', notifErr && notifErr.message ? notifErr.message : notifErr);
      }
      return res.json({ success: true, force: true, affectedRows: affected });
    } else {
      const [delRes] = await conn.query('DELETE FROM users WHERE id = ?', [id]);
      const affected = delRes && (delRes.affectedRows != null) ? delRes.affectedRows : 0;
      try {
        
        const notifUUID = `notif-user-delete-${id}-${Date.now()}`;
        const title = `User ${id} deleted`;
        const description = `User ${id} (${rows[0].email}) was deleted by ${req.user && (req.user.name || req.user.email) ? (req.user.name || req.user.email) : 'admin'}`;
        const url = `/users/${id}`;
        await conn.query('INSERT INTO notifications (uuid, title, description, url, user_id) VALUES (?, ?, ?, ?, ?)', [notifUUID, title, description, url, req.user ? req.user.id : null]);
      } catch (notifErr) {
        console.error('Failed to persist delete notification:', notifErr && notifErr.message ? notifErr.message : notifErr);
      }
      return res.json({ success: true, affectedRows: affected, force: false });
    }
  } catch (err) {
    console.error('DELETE /api/users/:id error:', err && err.message ? err.message : err);
    return res.status(500).json({ error: 'server_error', message: 'Failed to delete user', details: err && err.message });
  } finally {
    if (conn) try { await conn.release(); } catch (e) {}
  }
});

// ---------- Create user (admin only) ----------
app.post('/api/users', authMiddleware, async (req, res) => {
  const requesterRole = (req.user && req.user.role)
    ? String(req.user.role).toLowerCase()
    : null;

  if (requesterRole !== 'admin') {
    return res.status(403).json({
      error: 'forbidden',
      message: 'Only admin users can create users'
    });
  }

 const { username, name, email, phone, position, role, password } = req.body || {};

  if (!username || !email || !password) {
  return res.status(400).json({
    error: 'validation_error',
    message: 'username, email and password are required'
  });
}

const USERNAME_REGEX =
  /^(?=.*[A-Z])(?=.*[0-9])(?=.*[@_])[A-Za-z0-9@_]{4,100}$/;

if (!USERNAME_REGEX.test(username)) {
  return res.status(400).json({
    error: 'invalid_username_format',
    message: 'Username must contain 1 capital letter, 1 number, and @ or _'
  });
}

  let conn;
  try {
    
    conn = await db.getConnection();

    // Check duplicate email
    const [existing] = await conn.query(
  'SELECT id FROM users WHERE email = ? OR username = ? LIMIT 1',
  [email, username]
);

    if (existing && existing.length > 0) {
      return res.status(409).json({
        error: 'user_exists',
        message: 'Username or email already exists'
      });
    }

    const saltRounds = parseInt(process.env.BCRYPT_SALT_ROUNDS || '10', 10);
    const passwordHash = await bcrypt.hash(password, saltRounds);

    const [result] = await conn.query(
      `INSERT INTO users
   (username, email, name, password_hash, phone, position, role, is_active)
   VALUES (?, ?, ?, ?, ?, ?, ?, 1)`,
      [username, email, name, passwordHash, phone || '', position || '', role || 'user']
    );

    const [rows] = await conn.query(
      'SELECT id, username, email, name, phone, position, role, created_at FROM users WHERE id = ? LIMIT 1',
      [result.insertId]
    );

    return res.status(201).json({
      success: true,
      user: rows[0]
    });
  } catch (err) {
    console.error('Create user error:', err && err.message ? err.message : err);
    return res.status(500).json({
      error: 'server_error',
      message: 'Failed to create user'
    });
  } finally {
    if (conn) try { await conn.release(); } catch (e) {}
  }
});


// ---------- Update user (admin only) ----------
app.put('/api/users/:id', authMiddleware, async (req, res) => {
  if (req.user.role !== 'admin') {
    return res.status(403).json({ error: 'forbidden' });
  }

  const userId = Number(req.params.id);
  const { username, name, email, phone, position, role } = req.body || {};

  if (!userId || !username || !email) {
    return res.status(400).json({
      error: 'validation_error',
      message: 'username and email are required',
    });
  }

  let conn;
  try {
    conn = await db.getConnection();

    // Prevent duplicate username/email
    const [dup] = await conn.query(
      `SELECT id FROM users
       WHERE (username = ? OR email = ?)
       AND id != ?
       LIMIT 1`,
      [username, email, userId]
    );

    if (dup.length) {
      return res.status(409).json({
        error: 'duplicate_user',
        message: 'Username or email already exists',
      });
    }

    await conn.query(
      `UPDATE users SET
        username = ?,
        name = ?,
        email = ?,
        phone = ?,
        position = ?,
        role = ?
       WHERE id = ?`,
      [
        username,
        name || '',
        email,
        phone || '',
        position || '',
        role || 'sales',
        userId,
      ]
    );

    res.json({ success: true });
  } catch (err) {
    console.error('Update user error:', err);
    res.status(500).json({ error: 'server_error' });
  } finally {
    if (conn) conn.release();
  }
});


// ---------- Update user password (admin only OR self) ----------
app.put('/api/users/:id/password', authMiddleware, async (req, res) => {
  const userId = Number(req.params.id);
  const { password } = req.body || {};

  if (!userId || !password) {
    return res.status(400).json({
      error: 'validation_error',
      message: 'password is required',
    });
  }

  // Admin can change anyone's password
  // User can change own password
  if (req.user.role !== 'admin' && req.user.id !== userId) {
    return res.status(403).json({ error: 'forbidden' });
  }

  let conn;
  try {
    conn = await db.getConnection();

    const saltRounds = parseInt(process.env.BCRYPT_SALT_ROUNDS || '10', 10);
    const passwordHash = await bcrypt.hash(password, saltRounds);

    await conn.query(
      'UPDATE users SET password_hash = ? WHERE id = ?',
      [passwordHash, userId]
    );

    res.json({ success: true });
  } catch (err) {
    console.error('Update password error:', err);
    res.status(500).json({ error: 'server_error' });
  } finally {
    if (conn) conn.release();
  }
});




// ---------- Enable / Disable user (admin only) ----------
app.put("/api/users/:id/status", authMiddleware, async (req, res) => {
  let conn;
  try {
    const userId = Number(req.params.id);
    const { is_active } = req.body;

    if (!Number.isInteger(userId)) {
      return res.status(400).json({ error: "invalid_user_id" });
    }

    if (typeof is_active !== "boolean" && is_active !== 0 && is_active !== 1) {
      return res.status(400).json({ error: "invalid_status" });
    }

    // only admin can disable users
    if (req.user.role !== "admin") {
      return res.status(403).json({ error: "forbidden" });
    }

    conn = await db.getConnection();

    const [result] = await conn.query(
      "UPDATE users SET is_active = ? WHERE id = ?",
      [is_active ? 1 : 0, userId]
    );

    if (result.affectedRows === 0) {
      return res.status(404).json({ error: "user_not_found" });
    }

    res.json({
      success: true,
      user_id: userId,
      is_active: is_active ? 1 : 0,
    });
  } catch (err) {
    console.error("Disable user error:", err);
    res.status(500).json({ error: "server_error" });
  } finally {
    if (conn) await conn.release();
  }
});


// ---------- Products endpoints ----------
app.get('/api/products', async (req, res) => {
  let conn;
  try {
    
    conn = await db.getConnection();
    const [rows] = await conn.query('SELECT * FROM products ORDER BY created_at DESC');
    res.json(rows);
  } catch (err) {
    console.error('products error', err && err.message ? err.message : err);
    res.status(500).json({ error: 'db error' });
  } finally {
    if (conn) try { await conn.release(); } catch (e) {}
  }
});

app.post('/api/products', async (req, res) => {
  let conn;
  try {
    const { name, description, hsn_code, uom, unit_price, tax_rate, status } = req.body || {};
    if (!name) return res.status(400).json({ error: 'name required' });

    conn = await db.getConnection();

    const [r] = await conn.query(
      `INSERT INTO products
       (name, description, hsn_code, uom, unit_price, tax_rate, status)
       VALUES (?, ?, ?, ?, ?, ?, ?)`,
      [
        name,
        description || '',
        hsn_code || '',
        uom || 'NOS',
        unit_price ?? 0,
        tax_rate ?? 0,
        status || 'active'
      ]
    );

    // ✅ GOLD STANDARD: return what DB actually stored
    const [rows] = await conn.query(
      `SELECT id, name, description, uom, unit_price, tax_rate, status
       FROM products
       WHERE id = ?`,
      [r.insertId]
    );

    res.status(201).json(rows[0]);
  } catch (err) {
    console.error('create product error', err && err.message ? err.message : err);
    res.status(500).json({ error: 'db error' });
  } finally {
    if (conn) try { await conn.release(); } catch (e) {}
  }
});

app.put('/api/products/:id', async (req, res) => {
  let conn;
  const { id } = req.params;
  const { name, description, hsn_code, uom, unit_price, tax_rate, status } = req.body || {};
  if (!name) return res.status(400).json({ error: 'name required' });

  try {
    conn = await db.getConnection();
    const [r] = await conn.query(
      `UPDATE products 
       SET name=?, description=?, hsn_code=?, uom=?, unit_price=?, tax_rate=?, status=? 
       WHERE id=?`,
      [name, description || '', hsn_code || '', uom || 'NOS', unit_price || 0, tax_rate || 0, status || 'active', id]
    );
    res.json({ affectedRows: r.affectedRows });
  } catch (err) {
    console.error('update product error', err && err.message ? err.message : err);
    res.status(500).json({ error: 'db error' });
  } finally {
    if (conn) try { await conn.release(); } catch (e) {}
  }
});

app.delete('/api/products/:id', async (req, res) => {
  let conn;
  const { id } = req.params;
  try {
    conn = await db.getConnection();
    const [r] = await conn.query('DELETE FROM products WHERE id = ?', [id]);
    res.json({ affectedRows: r.affectedRows });
  } catch (err) {
    console.error('delete product error', err && err.message ? err.message : err);
    res.status(500).json({ error: 'db error' });
  } finally {
    if (conn) try { await conn.release(); } catch (e) {}
  }
});


// ✅ NEW ENDPOINT: View a specific version snapshot
// GET /api/quotations/:id/version/:versionNumber
// Allows users to view v0.3 as it was, even when quotation is at v0.4
app.get('/api/quotations/:id/version/:versionNumber', authMiddleware, async (req, res) => {
  let conn;
  const rawId = req.params.id;
  const versionNumber = req.params.versionNumber;
  const id = sanitizeIdParam(rawId);
  if (!id) return res.status(400).json({ error: 'invalid id' });
  if (!versionNumber) return res.status(400).json({ error: 'version required' });

  try {
    if (!/^\d+$/.test(String(id))) return res.status(400).json({ error: 'invalid id' });

    conn = await db.getConnection();

    const [quotRows] = await conn.query('SELECT * FROM quotations WHERE id = ? LIMIT 1', [id]);
    if (!quotRows || quotRows.length === 0) return res.status(404).json({ error: 'quotation not found' });
    const current = quotRows[0];

    // If requesting current version, return from quotations table
    if (String(versionNumber) === String(current.version)) {
      return res.json({
        success: true,
        version: versionNumber,
        is_current: true,
        items: safeJsonParse(current.items, []),
        customer_name: current.customer_name,
        quotation_date: current.quotation_date,
        validity_days: current.validity_days,
        totals: {
          subtotal: current.subtotal,
          total_discount: current.total_discount,
          tax_total: current.tax_total,
          grand_total: current.total_value
        },
        terms: current.terms,
        notes: current.notes,
        status: current.status,
        updated_at: current.updated_at
      });
    }

    // Otherwise fetch from version history
    const [versionRows] = await conn.query(
      `SELECT
  qv.id,
  qv.version_label AS version,
  qv.items,
  qv.subtotal,
  qv.total_discount,
  qv.tax,
  qv.total,
  qv.change_history,
  qv.created_at,
  u.name AS changed_by
FROM quotation_versions qv
LEFT JOIN users u ON u.id = qv.created_by
WHERE qv.quotation_id = ? AND qv.version_label = ?
LIMIT 1`,
      [id, versionNumber]
    );

    if (!versionRows || versionRows.length === 0) {
      return res.status(404).json({ error: 'version not found' });
    }

    const versionData = versionRows[0];
    const changeHistory = safeJsonParse(versionData.change_history, {});
    const items = Array.isArray(changeHistory.items) ? changeHistory.items : safeJsonParse(versionData.items, []);
    
    return res.json({
      success: true,
      version: versionData.version,
      is_current: false,
      items: items,
     totals: {
  subtotal: Number(versionData.subtotal),
  total_discount: Number(versionData.total_discount),
  tax_total: Number(versionData.tax),
  grand_total: Number(versionData.total)
},
      comment: changeHistory.comment || null,
      changed_by: versionData.changed_by || '',
      changed_at: versionData.created_at,
      note: `You are viewing version ${versionData.version} (historical). This is a snapshot from ${versionData.created_at}.`
    });
  } catch (err) {
    console.error('fetch specific version error:', err && err.message ? err.message : err);
    return res.status(500).json({ error: 'db error', details: err && err.message });
  } finally {
    if (conn) try { await conn.release(); } catch (e) {}
  }
  });


  // Version

  // ---------- Get quotation version history (LIST) ----------
// GET /api/quotations/:id/versions
app.get('/api/quotations/:id/versions', authMiddleware, async (req, res) => {
  let conn;
  const rawId = req.params.id;
  const id = sanitizeIdParam(rawId);
  if (!id) return res.status(400).json({ error: 'invalid id' });

  try {
    conn = await db.getConnection();

    // Ensure quotation exists & access control
    const [qRows] = await conn.query(
      'SELECT id, salesperson_id FROM quotations WHERE id = ? LIMIT 1',
      [id]
    );
    if (!qRows || qRows.length === 0) {
      return res.status(404).json({ error: 'quotation not found' });
    }

    const q = qRows[0];
    const role = String(req.user?.role || '').toLowerCase();
    if (role !== 'admin' && q.salesperson_id !== req.user.id) {
      return res.status(403).json({ error: 'forbidden' });
    }
const [currentRows] = await conn.query(
  'SELECT version FROM quotations WHERE id = ? LIMIT 1',
  [id]
);

const currentVersion = currentRows?.[0]?.version || null;

    // Fetch version history
    const [rows] = await conn.query(
      `
      SELECT
  qv.id,
  qv.version_label AS version,
  qv.items AS items_snapshot,
  JSON_OBJECT(
  'subtotal', qv.subtotal,
  'total_discount', qv.total_discount,  
  'tax_total', qv.tax,
  'grand_total', qv.total
) AS totals_snapshot,
  JSON_EXTRACT(qv.change_history, '$.comment') AS comment,
  u.name AS changed_by,
  qv.created_at AS changed_at
FROM quotation_versions qv
LEFT JOIN users u ON u.id = qv.created_by
WHERE qv.quotation_id = ?
ORDER BY qv.created_at DESC
      `,
      [id]
    );

    const history = (rows || []).map(r => ({
  ...r,
  is_current: false,
}));

// Inject current version at top
if (currentVersion) {
  history.unshift({
    id: 0,
    version: currentVersion,
    is_current: true,
    changed_by: 'Current',
    changed_at: new Date(),
    items_snapshot: null,
    totals_snapshot: null,
    comment: null,
  });
}

res.json(history);
  } catch (err) {
    console.error('fetch version history error', err);
    res.status(500).json({ error: 'db error' });
  } finally {
    if (conn) try { await conn.release(); } catch {}
  }
});

// ---------- Get quotation decisions (Won/Lost) ----------
app.get('/api/quotations/:id/decisions', authMiddleware, async (req, res) => {
  let conn;
  const rawId = req.params.id;
  const id = sanitizeIdParam(rawId);
  if (!id) return res.status(400).json({ error: 'invalid id' });

  try {
    if (!/^\d+$/.test(String(id))) return res.status(400).json({ error: 'invalid id' });

    conn = await db.getConnection();

    const [rows] = await conn.query('SELECT * FROM quotations WHERE id = ? LIMIT 1', [id]);
    if (!rows || rows.length === 0) return res.status(404).json({ error: 'quotation not found' });

    // Fetch decisions
    const [decisions] = await conn.query(
      `SELECT id, quotation_id, decision, comment, decided_by, decided_at
       FROM quotation_decisions
       WHERE quotation_id = ?
       ORDER BY decided_at DESC
       LIMIT 1`,
      [id]
    );

    const latest = Array.isArray(decisions) && decisions.length > 0 ? decisions[0] : null;

    return res.json({ success: true, decision: latest });
  } catch (err) {
    console.error('fetch decisions error:', err && err.message ? err.message : err);
    return res.status(500).json({ error: 'db error', details: err && err.message });
  } finally {
    if (conn) try { await conn.release(); } catch (e) {}
  }
});

// ---------- Update quotation (protected) ----------
app.put('/api/quotations/:id', authMiddleware, async (req, res) => {
  let conn;
  const rawId = req.params.id;
  const id = sanitizeIdParam(rawId);
  if (!id) return res.status(400).json({ error: 'invalid id' });
  

  const {
    customer_name,
    quotation_date,
    validity_days,
    items,
    terms,
    notes,
    
    status,
    salesperson_id,
    version,
    versionComment
  } = req.body || {};

  try {
    
    conn = await db.getConnection();

    const [rows] = await conn.query('SELECT * FROM quotations WHERE id = ? LIMIT 1', [id]);
    if (!rows || rows.length === 0) return res.status(404).json({ error: 'not found' });
    const existing = rows[0];

    // Visibility enforcement: non-admins can update only their own quotation
    const requesterRole = (req.user && req.user.role) ? String(req.user.role).toLowerCase() : null;
    const requesterId = (req.user && req.user.id) ? Number(req.user.id) : null;
    const isAdmin = requesterRole === 'admin';
    if (!isAdmin) {
      const ownerId = existing.salesperson_id != null ? Number(existing.salesperson_id) : null;
      if (!requesterId || ownerId !== requesterId) {
        return res.status(403).json({ error: 'forbidden', message: 'You do not have permission to update this quotation' });
      }
    }
     
  const editableStatuses = ['draft', 'pending'];

 if (!editableStatuses.includes(String(existing.status).toLowerCase())) {
  return res.status(409).json({
    error: 'locked',
    message: 'Quotation cannot be edited in this status'
  });
 }
    const itemsJson = (typeof items === 'string') ? items : (items ? JSON.stringify(items) : (existing.items ? JSON.stringify(existing.items) : null));
    const dbDate =
      normalizeDateForDb(quotation_date) ||
      normalizeDateForDb(existing.quotation_date);
  const parsedItems =
  Array.isArray(items)
    ? items
    : typeof items === 'string'
      ? safeJsonParse(items, [])
      : safeJsonParse(existing.items, []);

   const totals = calculateTotals(parsedItems);

   const newVersion = bumpVersion(existing.version);

   const finalSalespersonId =
  salesperson_id ?? existing.salesperson_id ?? req.user.id;

  const salespersonChanged =
  Number(finalSalespersonId) !== Number(existing.salesperson_id);

  //Re-fetch snapshot ONLY if changed

 let salespersonPhone = existing.salesperson_phone;
 let salespersonEmail = existing.salesperson_email;

  if (salespersonChanged) {
  const [userRows] = await conn.query(
    'SELECT phone, email FROM users WHERE id = ?',
    [finalSalespersonId]
  );
  const u = userRows && userRows[0] ? userRows[0] : {};
  salespersonPhone = u.phone || null;
  salespersonEmail = u.email || null;
 }

 // 🔍 DEBUG LOG — ADD HERE
 console.log('UPDATE QUOTATION TOTALS:', {
  quotationId: id,
  subtotal: totals.subtotal,
  discount: totals.total_discount,
  tax: totals.tax_total,
  grandTotal: totals.grand_total,
  itemsCount: parsedItems.length,
 });

    

    const [r] = await conn.query(
        `UPDATE quotations SET
        customer_name = ?,
        quotation_date = ?,
        validity_days = ?,
        items = ?,
        subtotal = ?,
        total_discount = ?,
        tax_total = ?,
        total_value = ?,
        terms = ?,
        notes = ?,
        status = ?,
        salesperson_id = ?,
        salesperson_phone = ?,
        salesperson_email = ?,
        version = ?
       WHERE id = ?`,
      [
         customer_name ?? existing.customer_name,
        dbDate,
        validity_days ?? existing.validity_days,
        itemsJson,
        totals.subtotal,
        totals.total_discount,
        totals.tax_total,
        totals.grand_total,
        terms ?? existing.terms,
        notes ?? existing.notes,
        status ?? existing.status,
        salesperson_id ?? existing.salesperson_id,
        salespersonPhone ?? existing.salesperson_phone,
        salespersonEmail ?? existing.salesperson_email,
        newVersion,
        id
      ]
    );

  console.log('VERSION UPDATED:', {
      quotationId: id,
      from: existing.version,
      to: newVersion
});

    // Save version snapshot to quotation_versions table if version changed
    // Save OLD version snapshot before bumping to newVersion
if (String(newVersion) !== String(existing.version)) {
  const changedByUserId = req.user?.id ?? null;

  // extract major/minor from OLD version (example: "0.3")
  const [major, minor] = String(existing.version)
    .split('.')
    .map(v => parseInt(v, 10) || 0);

 await conn.query(
  `INSERT INTO quotation_versions (
    quotation_id,
    version_major,
    version_minor,
    version_label,
    items,
    subtotal,
    total_discount,     
    tax,
    total,
    change_history,
    created_by
  ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
  [
    id,
    major,
    minor,
    existing.version,
   JSON.stringify(safeJsonParse(existing.items, [])),
    existing.subtotal,
    existing.total_discount ?? 0,
    existing.tax_total,
    existing.total_value,
    JSON.stringify({
      comment: versionComment || null,
      saved_from_version: existing.version
    }),
    req.user?.id ?? null
  ]
);

      console.log(`Version snapshot saved: ${existing.version}`);
    }


    // Auto-create sales order if quotation status changed to 'won'
    const newStatus = status ? String(status).toLowerCase() : (existing.status ? String(existing.status).toLowerCase() : null);
    const oldStatus = existing.status ? String(existing.status).toLowerCase() : null;
    if (newStatus === 'won' && oldStatus !== 'won') {
      try {
        const soNumber = `SO/${Date.now()}/${id}`;
        const actorName = (req.user && (req.user.name || req.user.email)) ? (req.user.name || req.user.email) : 'system';
        const [soRes] = await conn.query(
          `INSERT INTO sales_orders 
           (so_number, 
           quotation_id,
            quotation_no, 
            customer_name, 
            total_value, 
            items, status, 
            created_by_user_id, 
            user_name)
           VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`,
          [
            soNumber,
            id,
            existing.quotation_no || null,
            (customer_name != null) ? customer_name : existing.customer_name,
            totals.grand_total,
            itemsJson,
            'draft',
            req.user ? req.user.id : null,
            actorName
          ]
        );
        console.log(`Auto-created sales order ${soNumber} for won quotation ${existing.quotation_no}`);
      } catch (soErr) {
        console.error('Failed to auto-create sales order for won quotation:', soErr && soErr.message ? soErr.message : soErr);
      }
    }

    const [rows2] = await conn.query(`
      SELECT q.*, u.name as salesperson_name
      FROM quotations q
      LEFT JOIN users u ON u.id = q.salesperson_id
      WHERE q.id = ?
      LIMIT 1
    `, [id]);

    if (!rows2 || rows2.length === 0) return res.status(500).json({ error: 'fetch_failed' });

    const updated = rows2[0];
    updated.items = safeJsonParse(updated.items, []);
    updated.quotation_no = fixYearFormat(updated.quotation_no);

    return res.json({ success: true, affectedRows: r.affectedRows, quotation: updated });
  } catch (err) {
    console.error('update quotation error', err && err.message ? err.message : err);
    res.status(500).json({ error: 'db error', details: err && err.message });
  } finally {
    if (conn) try { await conn.release(); } catch (e) {}
  }
});

// ---------- Approve quotation (admin only) ----------
async function handleApproveQuotation(req, res) {
  let conn;
  const rawId = req.params.id;
  const id = sanitizeIdParam(rawId);
  if (!id) return res.status(400).json({ error: 'invalid id' });

  try {
    if (!/^\d+$/.test(String(id))) return res.status(400).json({ error: 'invalid id' });

    const requesterRole = (req.user && req.user.role) ? String(req.user.role).toLowerCase() : null;
    if (requesterRole !== 'admin') return res.status(403).json({ error: 'forbidden', message: 'Only admin users can approve quotations' });

    
    conn = await db.getConnection();

    const [rows] = await conn.query('SELECT * FROM quotations WHERE id = ? LIMIT 1', [id]);
    if (!rows || rows.length === 0) return res.status(404).json({ error: 'not found' });
    const q = rows[0];

    if (q.status && String(q.status).toLowerCase() === 'approved') return res.status(409).json({ error: 'already_approved', message: 'Quotation already approved' });

    const approver = (req.user && (req.user.name || req.user.email)) ? (req.user.name || req.user.email) : 'system';
    const approvedAt = new Date();

    const [uRes] = await conn.query('UPDATE quotations SET status = ?, approved_by = ?, approved_at = ? WHERE id = ?', ['approved', approver, approvedAt, id]);
    if (!uRes || (uRes.affectedRows == null) || uRes.affectedRows === 0) return res.status(500).json({ error: 'update_failed' });

    const [rows2] = await conn.query(`
      SELECT q.*, u.name as salesperson_name
      FROM quotations q
      LEFT JOIN users u ON u.id = q.salesperson_id
      WHERE q.id = ?
      LIMIT 1
    `, [id]);

    if (!rows2 || rows2.length === 0) return res.status(500).json({ error: 'fetch_failed' });

    const updated = rows2[0];
    updated.items = safeJsonParse(updated.items, []);
    updated.quotation_no = fixYearFormat(updated.quotation_no);

    try {
      
      const notifUUID = `notif-qt-approve-${id}-${Date.now()}`;
      const title = `Quotation ${updated.quotation_no} approved`;
      const description = `Quotation ${updated.quotation_no} approved by ${approver}`;
      const url = `/quotations/${id}`;
      const [nRes] = await conn.query(`INSERT INTO notifications (uuid, title, description, url, user_id) VALUES (?, ?, ?, ?, NULL)`, [notifUUID, title, description, url]);
      const [nRows] = await conn.query('SELECT id, uuid, title, description, url, user_id, created_at FROM notifications WHERE id = ?', [nRes.insertId]);
      const notifRow = Array.isArray(nRows) && nRows[0] ? nRows[0] : null;

      if (notifRow && app.locals && typeof app.locals.broadcastNotification === 'function') {
        const notif = {
          id: notifRow.id,
          uuid: notifRow.uuid,
          title: notifRow.title,
          description: notifRow.description,
          url: notifRow.url,
          user_id: notifRow.user_id,
          createdAt: (notifRow.created_at instanceof Date) ? notifRow.created_at.toISOString() : String(notifRow.created_at)
        };
        app.locals.broadcastNotification(notif);
      }
    } catch (notifErr) {
      console.error('Failed to persist/broadcast approval notification:', notifErr && notifErr.message ? notifErr.message : notifErr);
    }

    return res.json({ success: true, quotation: updated });
  } catch (err) {
    console.error('approve quotation error:', err && err.message ? err.message : err);
    return res.status(500).json({ error: 'db error', details: err && err.message });
  } finally {
    if (conn) try { await conn.release(); } catch (e) {}
  }
}

app.put('/api/quotations/:id/approve', authMiddleware, handleApproveQuotation);
app.post('/api/quotations/:id/approve', authMiddleware, handleApproveQuotation);

// ---------- Mark quotation as WON ----------
app.post('/api/quotations/:id/won', authMiddleware, async (req, res) => {
  let conn;
  const rawId = req.params.id;
  const id = sanitizeIdParam(rawId);
  if (!id) return res.status(400).json({ error: 'invalid id' });

  try {
    if (!/^\d+$/.test(String(id))) return res.status(400).json({ error: 'invalid id' });

    conn = await db.getConnection();

    const [rows] = await conn.query('SELECT * FROM quotations WHERE id = ? LIMIT 1', [id]);
    if (!rows || rows.length === 0) return res.status(404).json({ error: 'quotation not found' });
    const q = rows[0];

    // Check if already won/lost
    const existingStatus = q.status && String(q.status).toLowerCase();
    if (existingStatus === 'won' || existingStatus === 'lost') {
      return res.status(409).json({ error: 'already_decided', message: `Quotation already marked as ${existingStatus}` });
    }

    // Only salesperson, admin can mark won
    const requesterRole = (req.user && req.user.role) ? String(req.user.role).toLowerCase() : null;
    const requesterId = (req.user && req.user.id) ? Number(req.user.id) : null;
    const isAdmin = requesterRole === 'admin';
    const ownerId = q.salesperson_id != null ? Number(q.salesperson_id) : null;
    
    if (!isAdmin && (!requesterId || ownerId !== requesterId)) {
      return res.status(403).json({ error: 'forbidden', message: 'You do not have permission to mark this quotation as won' });
    }

    const decidedBy = (req.user && (req.user.name || req.user.email)) ? (req.user.name || req.user.email) : 'system';
    const decidedAt = new Date();

    // Update quotation status to 'won'
    const [uRes] = await conn.query(
      'UPDATE quotations SET status = ? WHERE id = ?',
      ['won', id]
    );
    if (!uRes || (uRes.affectedRows == null) || uRes.affectedRows === 0) {
      return res.status(500).json({ error: 'update_failed' });
    }

    // Record decision in quotation_decisions table
    const [dRes] = await conn.query(
      'INSERT INTO quotation_decisions (quotation_id, decision, decided_by, decided_at) VALUES (?, ?, ?, ?)',
      [id, 'won', decidedBy, decidedAt]
    );

    // Fetch updated quotation
    const [rows2] = await conn.query(`
      SELECT q.*, u.name as salesperson_name
      FROM quotations q
      LEFT JOIN users u ON u.id = q.salesperson_id
      WHERE q.id = ?
      LIMIT 1
    `, [id]);

    if (!rows2 || rows2.length === 0) return res.status(500).json({ error: 'fetch_failed' });

    const updated = rows2[0];
    updated.items = safeJsonParse(updated.items, []);
    updated.quotation_no = fixYearFormat(updated.quotation_no);

    // Notify
    try {
      const notifUUID = `notif-qt-won-${id}-${Date.now()}`;
      const title = `Quotation ${updated.quotation_no} marked as Won`;
      const description = `Quotation ${updated.quotation_no} marked as Won by ${decidedBy}`;
      const url = `/quotations/${id}`;
      await conn.query(
        'INSERT INTO notifications (uuid, title, description, url, user_id) VALUES (?, ?, ?, ?, NULL)',
        [notifUUID, title, description, url]
      );
    } catch (notifErr) {
      console.error('Failed to persist won notification:', notifErr && notifErr.message ? notifErr.message : notifErr);
    }

    return res.json({ success: true, quotation: updated });
  } catch (err) {
    console.error('mark won quotation error:', err && err.message ? err.message : err);
    return res.status(500).json({ error: 'db error', details: err && err.message });
  } finally {
    if (conn) try { await conn.release(); } catch (e) {}
  }
});

// ---------- Mark quotation as LOST (requires comment) ----------
app.post('/api/quotations/:id/lost', authMiddleware, async (req, res) => {
  let conn;
  const rawId = req.params.id;
  const id = sanitizeIdParam(rawId);
  if (!id) return res.status(400).json({ error: 'invalid id' });

  const { comment } = req.body || {};

  // Validate: comment is mandatory for lost
  if (!comment || String(comment).trim() === '') {
    return res.status(400).json({ error: 'comment_required', message: 'Loss reason (comment) is mandatory' });
  }

  try {
    if (!/^\d+$/.test(String(id))) return res.status(400).json({ error: 'invalid id' });

    conn = await db.getConnection();

    const [rows] = await conn.query('SELECT * FROM quotations WHERE id = ? LIMIT 1', [id]);
    if (!rows || rows.length === 0) return res.status(404).json({ error: 'quotation not found' });
    const q = rows[0];

    // Check if already won/lost
    const existingStatus = q.status && String(q.status).toLowerCase();
    if (existingStatus === 'won' || existingStatus === 'lost') {
      return res.status(409).json({ error: 'already_decided', message: `Quotation already marked as ${existingStatus}` });
    }

    // Any authenticated user can mark lost (sales team)
    const decidedBy = (req.user && (req.user.name || req.user.email)) ? (req.user.name || req.user.email) : 'system';
    const decidedAt = new Date();

    // Update quotation status to 'lost'
    const [uRes] = await conn.query(
      'UPDATE quotations SET status = ? WHERE id = ?',
      ['lost', id]
    );
    if (!uRes || (uRes.affectedRows == null) || uRes.affectedRows === 0) {
      return res.status(500).json({ error: 'update_failed' });
    }

    // Record decision in quotation_decisions table with reason
    const [dRes] = await conn.query(
      'INSERT INTO quotation_decisions (quotation_id, decision, comment, decided_by, decided_at) VALUES (?, ?, ?, ?, ?)',
      [id, 'lost', comment, decidedBy, decidedAt]
    );

    // Fetch updated quotation
    const [rows2] = await conn.query(`
      SELECT q.*, u.name as salesperson_name
      FROM quotations q
      LEFT JOIN users u ON u.id = q.salesperson_id
      WHERE q.id = ?
      LIMIT 1
    `, [id]);

    if (!rows2 || rows2.length === 0) return res.status(500).json({ error: 'fetch_failed' });

    const updated = rows2[0];
    updated.items = safeJsonParse(updated.items, []);
    updated.quotation_no = fixYearFormat(updated.quotation_no);

    // Notify
    try {
      const notifUUID = `notif-qt-lost-${id}-${Date.now()}`;
      const title = `Quotation ${updated.quotation_no} marked as Lost`;
      const description = `Quotation ${updated.quotation_no} marked as Lost by ${decidedBy}. Reason: ${comment}`;
      const url = `/quotations/${id}`;
      await conn.query(
        'INSERT INTO notifications (uuid, title, description, url, user_id) VALUES (?, ?, ?, ?, NULL)',
        [notifUUID, title, description, url]
      );
    } catch (notifErr) {
      console.error('Failed to persist lost notification:', notifErr && notifErr.message ? notifErr.message : notifErr);
    }

    return res.json({ success: true, quotation: updated });
  } catch (err) {
    console.error('mark lost quotation error:', err && err.message ? err.message : err);
    return res.status(500).json({ error: 'db error', details: err && err.message });
  } finally {
    if (conn) try { await conn.release(); } catch (e) {}
  }
});

// ---------- Create follow-up for a quotation ----------

app.post('/api/quotations/:id/followups', authMiddleware,async (req, res) => {
  const quotationId = Number(req.params.id);
    const {
  followup_date,
  note,
  followup_type,
  next_followup_date = null,
} = req.body;

const ALLOWED_TYPES = [
  "call",
  "email",
  "whatsapp",
  "meeting",
  "site_visit",
  "other",
];

if (
  !quotationId ||
  !followup_date ||
  !note?.trim() ||
  !ALLOWED_TYPES.includes(followup_type)
) {
  return res.status(400).json({ error: "Invalid follow-up data" });
}

    const userId = req.user.id;

    if (!quotationId || !followup_date || !note?.trim()) {
      return res.status(400).json({ error: 'Invalid follow-up data' });
    }

    let conn;
    try {
      conn = await db.getConnection();
      await conn.beginTransaction();

      // 🔒 Lock quotation & validate status
      const [[quotation]] = await conn.query(
        `
        SELECT id, status
        FROM quotations
        WHERE id = ?
        FOR UPDATE
        `,
        [quotationId]
      );

      if (!quotation) {
        await conn.rollback();
        return res.status(404).json({ error: 'Quotation not found' });
      }

      if (quotation.status !== 'pending') {
        await conn.rollback();
        return res.status(409).json({
          error: 'Follow-ups allowed only for pending quotations',
        });
      }

      // ✅ Insert follow-up
      await conn.query(
        `
        INSERT INTO quotation_followups
  (
    quotation_id,
    created_by,
    followup_date,
    note,
    followup_type,
    next_followup_date
  )
VALUES (?, ?, ?, ?, ?, ?)
        `,
       [
    quotationId,
    userId,
    followup_date,
    note.trim(),
    followup_type,
    next_followup_date,
  ]
      );

      await conn.commit();
      res.json({ success: true });
    } catch (err) {
      if (conn) await conn.rollback();
      console.error(err);
      res.status(500).json({ error: 'Failed to create follow-up' });
    } finally {
      if (conn) conn.release();
    }
  }
);

//---------------Fetch follow-ups for a quotation ----------------

app.get('/api/quotations/:id/followups', authMiddleware, async (req, res) => {
  const quotationId = Number(req.params.id);
 if (!quotationId) {
      return res.status(400).json({ error: 'Invalid quotation id' });
    }

    let conn;
    try {
      conn = await db.getConnection();

      const [rows] = await conn.query(
        `
        SELECT
  f.id,
  f.followup_date,
  f.note,
  f.followup_type,
  f.next_followup_date,
  f.is_completed,
  f.completed_at,
  f.created_at,
  u.name AS created_by_name
FROM quotation_followups f
LEFT JOIN users u ON u.id = f.created_by
WHERE f.quotation_id = ?
ORDER BY f.created_at DESC
        `,
        [quotationId]
      );

      res.json(rows);
    } catch (err) {
      console.error(err);
      res.status(500).json({ error: 'Failed to fetch follow-ups' });
    } finally {
      if (conn) conn.release();
    }
  }
);

//-----------complete follow-up ----------------

app.put('/api/quotation-followups/:id/complete', authMiddleware, async (req, res) => {
  const id = Number(req.params.id);
    if (!id) {
      return res.status(400).json({ error: "Invalid follow-up id" });
    }

    let conn;
    try {
      conn = await db.getConnection();

      await conn.query(
        `
        UPDATE quotation_followups
SET
  is_completed = 1,
  completed_at = NOW(),
  next_followup_date = NULL
WHERE id = ?
        `,
        [id]
      );

      res.json({ success: true });
    } catch (err) {
      console.error("Failed to complete follow-up:", err);
      res.status(500).json({ error: "Failed to complete follow-up" });
    } finally {
      if (conn) conn.release();
    }
  }
);

// ---------- Delete quotation ----------
app.delete('/api/quotations/:id', authMiddleware, async (req, res) => {
  let conn;
  const rawId = req.params.id;
  const id = sanitizeIdParam(rawId);
  if (!id) return res.status(400).json({ error: 'invalid id' });

  const force = String(req.query.force || '').toLowerCase() === 'true';
  try {
    
    conn = await db.getConnection();

    const [rows] = await conn.query('SELECT id, status, salesperson_id FROM quotations WHERE id = ? LIMIT 1', [id]);
    if (!rows || rows.length === 0) return res.status(404).json({ error: 'quotation not found' });
    const q = rows[0];

    // Only owner or admin can delete; force delete requires admin
    const requesterRole = (req.user && req.user.role) ? String(req.user.role).toLowerCase() : null;
    const requesterId = (req.user && req.user.id) ? Number(req.user.id) : null;
    const isAdmin = requesterRole === 'admin';
    const ownerId = q.salesperson_id != null ? Number(q.salesperson_id) : null;
    if (!isAdmin && (!requesterId || ownerId !== requesterId)) {
      return res.status(403).json({ error: 'forbidden', message: 'You do not have permission to delete this quotation' });
    }

    if (q.status && String(q.status).toLowerCase() === 'approved' && !force) {
      return res.status(409).json({ error: 'cannot_delete_approved', message: 'Approved quotations cannot be deleted.' });
    }

    if (force) {
      if (!isAdmin) return res.status(403).json({ error: 'forbidden', message: 'Only admin users can force delete quotations' });

      const [delRes] = await conn.query('DELETE FROM quotations WHERE id = ?', [id]);
      const affected = delRes && (delRes.affectedRows != null) ? delRes.affectedRows : 0;

      try {
        
        const notifUUID = `notif-qt-force-delete-${id}-${Date.now()}`;
        const title = `Quotation ${id} force-deleted`;
        const description = `Quotation ${id} force-deleted by ${req.user && (req.user.name || req.user.email) ? (req.user.name || req.user.email) : 'admin'}`;
        const url = `/quotations/${id}`;
        await conn.query('INSERT INTO notifications (uuid, title, description, url, user_id) VALUES (?, ?, ?, ?, ?)', [notifUUID, title, description, url, req.user ? req.user.id : null]);
      } catch (notifErr) {
        console.error('Failed to persist force-delete notification:', notifErr && notifErr.message ? notifErr.message : notifErr);
      }

      return res.json({ success: true, force: true, affectedRows: affected });
    }

    const deleterId = (req.user && req.user.id) ? req.user.id : null;
    const now = new Date();
    const [uRes] = await conn.query('UPDATE quotations SET is_deleted = 1, deleted_at = ?, deleted_by = ? WHERE id = ?', [now, deleterId, id]);

    try {
      
      const notifUUID = `notif-qt-delete-${id}-${Date.now()}`;
      const title = `Quotation ${id} deleted`;
      const description = `Quotation ${id} deleted by ${req.user && (req.user.name || req.user.email) ? (req.user.name || req.user.email) : 'user'}`;
      const url = `/quotations/${id}`;
      await conn.query('INSERT INTO notifications (uuid, title, description, url, user_id) VALUES (?, ?, ?, ?, ?)', [notifUUID, title, description, url, deleterId]);
    } catch (notifErr) {
      console.error('Failed to persist deletion notification:', notifErr && notifErr.message ? notifErr.message : notifErr);
    }

    return res.json({ success: true, affectedRows: uRes.affectedRows, force: false });
  } catch (err) {
    console.error('❌ delete quotation error:', {
      message: err && err.message,
      code: err && err.code,
      sqlMessage: err && err.sqlMessage,
      stack: err && err.stack
    });
    return res.status(500).json({ error: 'db error', details: err && err.message, code: err && err.code });
  } finally {
    if (conn) try { await conn.release(); } catch (e) {}
  }
});

/*-----------App settings------*/


app.get('/api/settings', authMiddleware, async (req, res) => {
  // Only Admin can read
  if ((req.user?.role || '').toLowerCase() !== 'admin') {
    return res.status(403).json({ error: 'Forbidden' });
  }

  let conn;
  try {
    conn = await db.getConnection();
    const [[row]] = await conn.query(
      'SELECT * FROM app_settings WHERE id = 1'
    );
    res.json(row || {});
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Failed to load settings' });
  } finally {
    conn?.release();
  }
});



app.post('/api/settings', authMiddleware, async (req, res) => {
  if ((req.user?.role || '').toLowerCase() !== 'admin') {
    return res.status(403).json({ error: 'Forbidden' });
  }

  const {
    companyName,
    companyAddress,
    contactEmail,
    contactPhone,
    invoicePrefix,
    invoiceNextSeq,
    smtpHost,
    smtpPort,
    smtpUser,
    smtpFrom,
    enforceStrongPassword,
    logoDataUrl,
  } = req.body;

  let conn;
  try {
    conn = await db.getConnection();

    await conn.query(
      `
      UPDATE app_settings SET
        company_name = ?,
        company_address = ?,
        contact_email = ?,
        contact_phone = ?,
        invoice_prefix = ?,
        invoice_next_seq = ?,
        smtp_host = ?,
        smtp_port = ?,
        smtp_user = ?,
        smtp_from = ?,
        enforce_strong_password = ?,
        logo_data_url = ?
      WHERE id = 1
      `,
      [
        companyName || null,
        companyAddress || null,
        contactEmail || null,
        contactPhone || null,
        invoicePrefix || 'QT',
        Number(invoiceNextSeq || 1),
        smtpHost || null,
        smtpPort || null,
        smtpUser || null,
        smtpFrom || null,
        enforceStrongPassword ? 1 : 0,
        logoDataUrl || null,
      ]
    );

    res.json({ success: true });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Failed to save settings' });
  } finally {
    conn?.release();
  }
});


//////////////////--------------EXAMPLE-----------------------/////////////////////////

app.post("/api/settings/test-email", authMiddleware, async (req, res) => {
  if (req.user.role !== "admin") {
    return res.status(403).json({ error: "Admin only" });
  }

  const settings = await getSettingsFromDB();

  if (!settings.smtp_host || !settings.smtp_user) {
    return res.status(400).json({ error: "SMTP not configured" });
  }

 const transporter = nodemailer.createTransport({
  host: settings.smtp_host,
  port: Number(settings.smtp_port),
  secure: Number(settings.smtp_port) === 465,
  auth: {
    user: settings.smtp_user,
    pass: process.env.SMTP_PASSWORD,
  },
});

  await transporter.sendMail({
    from: settings.smtp_from || settings.smtp_user,
    to: req.user.email,
    subject: "SMTP Test Email",
    text: "Your SMTP configuration is working correctly.",
  });

  res.json({ ok: true });
});




// ---------- Server start (when run directly) ----------
if (require.main === module) {
  (async () => {
    try {
      const { httpServer, io } = await createServerAndIO();

      httpServer.listen(PORT, () => {
        console.log(`Server listening on port ${PORT}`);
        console.log('Socket.IO path: /socket.io');
      });

      httpServer.on('error', (err) => {
        if (err && err.code === 'EADDRINUSE') {
          console.error(`Port ${PORT} is already in use.`);
        } else {
          console.error('Server error:', err && err.message ? err.message : err);
        }
        process.exit(1);
      });

      const shutdown = async () => {
        console.log('Shutdown initiated — closing server and DB pool');
        try {
          if (app.locals && app.locals.io) {
            try { await app.locals.io.close(); } catch (e) { console.warn('Error closing io', e && e.message); }
          }
          await db.endPool();
        } catch (e) {
          console.error('Error during shutdown', e && e.message ? e.message : e);
        }
        httpServer.close(() => process.exit(0));
      };

      process.on('SIGINT', shutdown);
      process.on('SIGTERM', shutdown);
    } catch (err) {
      console.error('Failed to start server with Socket.IO:', err && (err.message || err));
      process.exit(1);
    }
  })();
}







module.exports = app;
