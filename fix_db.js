const mysql = require('mysql2/promise');
require('dotenv').config();

async function fix() {
  try {
    const connection = await mysql.createConnection(process.env.DATABASE_URL);
    console.log("Connected to DB, altering table...");
    await connection.query("ALTER TABLE orders MODIFY COLUMN status ENUM('pending', 'confirmed', 'processing', 'shipped', 'delivered', 'cancelled') DEFAULT 'pending'");
    console.log("Successfully altered orders table ENUM.");
    process.exit(0);
  } catch (err) {
    console.error(err);
    process.exit(1);
  }
}
fix();
