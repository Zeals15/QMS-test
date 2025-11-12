
const mysql = require('mysql2/promise');

let pool = null;

function initPool() {
  if (pool) return pool;
  // Use environment variables for credentials (DOCUMENTATION: set these before starting)
  pool = mysql.createPool({
    host: process.env.MYSQL_HOST || 'localhost',
    user: process.env.MYSQL_USER || 'root',
    password: process.env.MYSQL_PASSWORD || 'Zeals@151102',
    database: process.env.MYSQL_DATABASE || 'prayosha',
    waitForConnections: true,
    connectionLimit: 10,
    queueLimit: 0
  });
  return pool;
}

module.exports = {
  getConnection: async () => {
    const p = initPool();
    return p.getConnection();
  }
};
