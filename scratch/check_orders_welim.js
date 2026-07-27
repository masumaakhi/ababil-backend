const mysql = require('mysql2/promise');
require('dotenv').config({ path: '.env' });

async function run() {
  const db = mysql.createPool(process.env.DATABASE_URL + '?ssl={"rejectUnauthorized":false}');
  try {
    const [rows] = await db.query('SELECT * FROM orders WHERE affiliate_code = "WELIM20" ORDER BY created_at DESC LIMIT 5');
    console.log(rows);
  } catch (err) {
    console.error(err);
  }
  process.exit(0);
}

run();
