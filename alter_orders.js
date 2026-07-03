const mysql = require('mysql2/promise');
require('dotenv').config();

async function fix() {
  try {
    const connection = await mysql.createConnection(process.env.DATABASE_URL);
    
    // Check if columns exist
    const [columns] = await connection.query("SHOW COLUMNS FROM orders LIKE 'consignment_id'");
    if (columns.length === 0) {
      console.log("Adding consignment_id and tracking_url to orders table...");
      await connection.query("ALTER TABLE orders ADD COLUMN consignment_id VARCHAR(100) NULL, ADD COLUMN tracking_url VARCHAR(255) NULL");
      console.log("Columns added successfully.");
    } else {
      console.log("Columns already exist.");
    }

    process.exit(0);
  } catch (err) {
    console.error(err);
    process.exit(1);
  }
}
fix();
