const mysql = require('mysql2/promise');

let pool;
let schemaPromise;

function getPool() {
  if (!process.env.DATABASE_URL) return null;
  if (!pool) {
    const parsed = new URL(process.env.DATABASE_URL);
    pool = mysql.createPool({
      host: parsed.hostname,
      port: Number(parsed.port || 3306),
      user: decodeURIComponent(parsed.username),
      password: decodeURIComponent(parsed.password),
      database: decodeURIComponent(parsed.pathname.replace(/^\/+/, '')),
      waitForConnections: true,
      connectionLimit: 5,
      maxIdle: 5,
      idleTimeout: 60000,
      enableKeepAlive: true,
      ssl: process.env.DATABASE_SSL === 'false' ? undefined : { rejectUnauthorized: process.env.DATABASE_SSL_REJECT_UNAUTHORIZED !== 'false' },
    });
  }
  return pool;
}

async function ensureSchema() {
  const activePool = getPool();
  if (!activePool) return false;
  if (!schemaPromise) {
    schemaPromise = activePool.execute(`
      CREATE TABLE IF NOT EXISTS payment_orders (
        id BIGINT UNSIGNED NOT NULL AUTO_INCREMENT PRIMARY KEY,
        order_id VARCHAR(80) NOT NULL UNIQUE,
        authority VARCHAR(80) NULL UNIQUE,
        amount_rial BIGINT UNSIGNED NOT NULL,
        amount_toman BIGINT UNSIGNED NOT NULL,
        currency VARCHAR(8) NOT NULL DEFAULT 'IRR',
        description VARCHAR(255) NOT NULL,
        customer_name VARCHAR(120) NULL,
        customer_phone VARCHAR(40) NULL,
        customer_email VARCHAR(190) NULL,
        status VARCHAR(24) NOT NULL DEFAULT 'pending',
        provider_code INT NULL,
        ref_id VARCHAR(120) NULL,
        created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
        paid_at TIMESTAMP NULL,
        updated_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
        INDEX idx_payment_orders_status (status),
        INDEX idx_payment_orders_created_at (created_at)
      ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci
    `).then(() => true).catch((error) => {
      schemaPromise = undefined;
      throw error;
    });
  }
  return schemaPromise;
}

async function createOrder(order) {
  const activePool = getPool();
  await ensureSchema();
  await activePool.execute(
    `INSERT INTO payment_orders
      (order_id, amount_rial, amount_toman, description, customer_name, customer_phone, customer_email, status)
     VALUES (?, ?, ?, ?, ?, ?, ?, 'pending')`,
    [order.orderId, order.amountRial, order.amountToman, order.description, order.name || null, order.phone || null, order.email || null],
  );
}

async function findOrderById(orderId) {
  const activePool = getPool();
  await ensureSchema();
  const [rows] = await activePool.execute('SELECT * FROM payment_orders WHERE order_id = ? LIMIT 1', [orderId]);
  return rows[0] || null;
}

async function findOrderByAuthority(authority) {
  const activePool = getPool();
  await ensureSchema();
  const [rows] = await activePool.execute('SELECT * FROM payment_orders WHERE authority = ? LIMIT 1', [authority]);
  return rows[0] || null;
}

async function markCreated(orderId, authority, providerCode) {
  const activePool = getPool();
  await activePool.execute('UPDATE payment_orders SET authority = ?, provider_code = ?, status = \'created\' WHERE order_id = ?', [authority, providerCode, orderId]);
}

async function markFailed(orderId, providerCode) {
  const activePool = getPool();
  await activePool.execute("UPDATE payment_orders SET provider_code = ?, status = 'failed' WHERE order_id = ? AND status IN ('pending', 'created')", [providerCode || null, orderId]);
}

async function markPaid(orderId, providerCode, refId) {
  const activePool = getPool();
  await activePool.execute("UPDATE payment_orders SET provider_code = ?, ref_id = ?, status = 'paid', paid_at = CURRENT_TIMESTAMP WHERE order_id = ? AND status <> 'paid'", [providerCode || null, refId || null, orderId]);
}

async function checkDatabase() {
  const activePool = getPool();
  if (!activePool) return false;
  await ensureSchema();
  await activePool.query('SELECT 1');
  return true;
}

module.exports = {
  getPool,
  ensureSchema,
  checkDatabase,
  createOrder,
  findOrderById,
  findOrderByAuthority,
  markCreated,
  markFailed,
  markPaid,
};
