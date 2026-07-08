const mysql = require('mysql2/promise');
require('dotenv').config();

async function run() {
  const db = mysql.createPool(process.env.DATABASE_URL + '?ssl={"rejectUnauthorized":false}');
  
  console.log('Altering payment_method column to VARCHAR(50)...');
  await db.query('ALTER TABLE orders MODIFY COLUMN payment_method VARCHAR(50) DEFAULT "cod"');
  console.log('Column altered successfully.');
  
  await db.end();
}

run().catch(console.error);
