const mysql = require('mysql2/promise');
require('dotenv').config();

async function createTable() {
  try {
    const connection = await mysql.createConnection(process.env.DATABASE_URL);
    
    console.log("Creating affiliates table...");
    await connection.query(`
      CREATE TABLE IF NOT EXISTS affiliates (
        id INT AUTO_INCREMENT PRIMARY KEY,
        name VARCHAR(100) NOT NULL,
        reference_code VARCHAR(50) NOT NULL UNIQUE,
        commission_rate DECIMAL(5,2) DEFAULT 5.00,
        paid_amount DECIMAL(10,2) DEFAULT 0.00,
        status ENUM('active', 'inactive') DEFAULT 'active',
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
      )
    `);
    console.log("Table created successfully.");

    process.exit(0);
  } catch (err) {
    console.error(err);
    process.exit(1);
  }
}
createTable();
