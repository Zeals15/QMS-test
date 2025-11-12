// server/seed-admin.js

require('dotenv').config();
const bcrypt = require('bcrypt');
const mysql = require('mysql2/promise');

(async () => {
  try {
    const hash = await bcrypt.hash('prayosha@admin123', 10);
    const conn = await mysql.createConnection({
      host: process.env.MYSQL_HOST || 'localhost',
      user: process.env.MYSQL_USER || 'root',
      password: process.env.MYSQL_PASSWORD || 'Zeals@151102',
      database: process.env.MYSQL_DATABASE || 'prayosha'
    });

    // Create users table if it doesn't exist
    await conn.query(`
      CREATE TABLE IF NOT EXISTS users (
        id INT AUTO_INCREMENT PRIMARY KEY,
        email VARCHAR(255) NOT NULL UNIQUE,
        name VARCHAR(255),
        password_hash VARCHAR(255),
        role VARCHAR(50) DEFAULT 'user',
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
      );
    `);

    // Insert admin if not already present
    await conn.execute(
      'INSERT IGNORE INTO users (email, name, password_hash, role) VALUES (?, ?, ?, ?)',
      ['admin@prayosha.net.in', 'Admin', hash, 'admin']
    );

    console.log('✅ Admin seeded successfully');
    console.log('👉 Email: admin@prayosha.net.in');
    console.log('👉 Password: prayosha@admin123');

    await conn.end();
  } catch (err) {
    console.error('❌ Error seeding admin:', err);
  }
})();