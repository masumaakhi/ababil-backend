const mysql = require('mysql2/promise');
require('dotenv').config();

async function createTable() {
  try {
    const connection = await mysql.createConnection(
      process.env.DATABASE_URL + '?ssl={"rejectUnauthorized":false}'
    );
    
    console.log("Creating affiliate_payouts table...");
    await connection.query(`
      CREATE TABLE IF NOT EXISTS affiliate_payouts (
        id INT AUTO_INCREMENT PRIMARY KEY,
        affiliate_id INT NOT NULL,
        amount DECIMAL(10,2) NOT NULL,
        period_start DATE DEFAULT NULL,
        period_end DATE DEFAULT NULL,
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
        FOREIGN KEY (affiliate_id) REFERENCES affiliates(id) ON DELETE CASCADE
      ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
    `);
    console.log("Table affiliate_payouts created successfully.");
    process.exit(0);
  } catch (err) {
    console.error(err);
    process.exit(1);
  }
}
createTable();
