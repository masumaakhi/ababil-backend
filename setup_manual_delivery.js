const mysql = require('mysql2/promise');
require('dotenv').config();

async function run() {
  const db = await mysql.createConnection(process.env.DATABASE_URL + '?ssl={"rejectUnauthorized":false}&timezone=Z');
  console.log("Connected to DB.");

  try {
    console.log("Checking orders table columns...");
    await db.query(`ALTER TABLE orders ADD COLUMN rider_id INT NULL`);
    console.log("Added rider_id to orders.");
  } catch(e) {
    if (e.code === 'ER_DUP_FIELDNAME') console.log("rider_id already exists.");
    else console.log(e);
  }

  try {
    await db.query(`ALTER TABLE orders ADD COLUMN delivery_type ENUM('courier', 'manual') DEFAULT 'courier'`);
    console.log("Added delivery_type to orders.");
  } catch(e) {
    if (e.code === 'ER_DUP_FIELDNAME') console.log("delivery_type already exists.");
    else console.log(e);
  }

  try {
    console.log("Creating riders table...");
    await db.query(`
      CREATE TABLE IF NOT EXISTS riders (
        id INT AUTO_INCREMENT PRIMARY KEY,
        name VARCHAR(255) NOT NULL,
        phone VARCHAR(20) NOT NULL UNIQUE,
        password VARCHAR(255) NOT NULL,
        zone VARCHAR(255) NULL,
        payment_model ENUM('fixed', 'commission') DEFAULT 'fixed',
        per_parcel_rate DECIMAL(10,2) DEFAULT 0,
        cash_in_hand DECIMAL(10,2) DEFAULT 0,
        wallet_balance DECIMAL(10,2) DEFAULT 0,
        status ENUM('active', 'inactive') DEFAULT 'active',
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
      )
    `);
    console.log("Riders table created successfully!");
  } catch(e) {
    console.error(e);
  }

  db.end();
}

run();
