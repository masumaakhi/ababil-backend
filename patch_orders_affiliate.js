const mysql = require('mysql2/promise');
require('dotenv').config();

async function patchOrders() {
  try {
    const db = await mysql.createConnection(process.env.DATABASE_URL + '?ssl={"rejectUnauthorized":false}');
    console.log("Checking orders table for affiliate_paid column...");
    const [columns] = await db.query(`SHOW COLUMNS FROM orders LIKE 'affiliate_paid'`);
    if (columns.length === 0) {
        console.log("Adding affiliate_paid column...");
        await db.query(`ALTER TABLE orders ADD COLUMN affiliate_paid BOOLEAN DEFAULT FALSE`);
        console.log("Column added successfully.");
    } else {
        console.log("Column already exists.");
    }
    process.exit(0);
  } catch(e) {
    console.error(e);
    process.exit(1);
  }
}
patchOrders();
