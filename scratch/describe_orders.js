const mysql = require('mysql2/promise');
require('dotenv').config();

async function run() {
  const db = mysql.createPool(process.env.DATABASE_URL + '?ssl={"rejectUnauthorized":false}');
  const [columns] = await db.query('SHOW COLUMNS FROM orders');
  console.log(columns);
  await db.end();
}

run().catch(console.error);
