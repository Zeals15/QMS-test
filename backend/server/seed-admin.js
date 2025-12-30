// server/seed-admin.js
require('dotenv').config();
const bcrypt = require('bcryptjs');
const mysql = require('mysql2/promise');

(async () => {
  try {
    const {
      MYSQLHOST,
      MYSQLUSER,
      MYSQLPASSWORD,
      MYSQLDATABASE,
      MYSQLPORT,
      ADMIN_EMAIL,
      ADMIN_PASSWORD,
    } = process.env;

    if (!MYSQLHOST || !MYSQLUSER || !MYSQLPASSWORD || !MYSQLDATABASE) {
      throw new Error('Missing MySQL environment variables');
    }

    if (!ADMIN_EMAIL || !ADMIN_PASSWORD) {
      throw new Error('ADMIN_EMAIL and ADMIN_PASSWORD must be set');
    }

    const conn = await mysql.createConnection({
      host: MYSQLHOST,
      user: MYSQLUSER,
      password: MYSQLPASSWORD,
      database: MYSQLDATABASE,
      port: Number(MYSQLPORT || 3306),
      ssl: { rejectUnauthorized: false },
    });

    const passwordHash = await bcrypt.hash(ADMIN_PASSWORD, 10);

    await conn.query(
      `
      INSERT INTO users (email, name, password_hash, role, is_active)
      SELECT ?, 'Admin', ?, 'admin', 1
      WHERE NOT EXISTS (
        SELECT 1 FROM users WHERE email = ? AND role = 'admin'
      )
      `,
      [ADMIN_EMAIL, passwordHash, ADMIN_EMAIL]
    );

    console.log('✅ Admin ensured');
    console.log(`👉 Email: ${ADMIN_EMAIL}`);

    await conn.end();
  } catch (err) {
    console.error('❌ Admin seed failed:', err.message);
    process.exit(1);
  }
})();
