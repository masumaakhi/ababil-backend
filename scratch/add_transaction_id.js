const mysql = require('mysql2/promise');
require('dotenv').config();

async function run() {
  const db = mysql.createPool(process.env.DATABASE_URL + '?ssl={"rejectUnauthorized":false}');
  
  // Check if column already exists
  const [columns] = await db.query('SHOW COLUMNS FROM orders');
  const hasTxn = columns.some(col => col.Field === 'transaction_id');
  
  if (!hasTxn) {
    console.log('Adding transaction_id column to orders table...');
    await db.query('ALTER TABLE orders ADD COLUMN transaction_id VARCHAR(100) NULL AFTER payment_method');
    console.log('Column added successfully.');
  } else {
    console.log('transaction_id column already exists.');
  }
  
  await db.end();
}

run().catch(console.error);
