const mysql = require('mysql2/promise');
require('dotenv').config({ path: '.env' });

async function run() {
  const db = mysql.createPool(process.env.DATABASE_URL + '?ssl={"rejectUnauthorized":false}');
  try {
    const [rows] = await db.query('SELECT * FROM affiliates WHERE name LIKE "%WELIM%"');
    console.log(rows);
  } catch (err) {
    console.error(err);
  }
  process.exit(0);
}

run();
