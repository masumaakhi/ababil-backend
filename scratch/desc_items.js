const mysql = require('mysql2/promise');
require('dotenv').config();
async function run() {
  const db = await mysql.createConnection(process.env.DATABASE_URL.replace(/['"]/g, '') + '?ssl={"rejectUnauthorized":false}');
  const [rows] = await db.query('SELECT items FROM orders LIMIT 1');
  console.log(JSON.stringify(rows[0].items, null, 2));
  process.exit(0);
}
run();
