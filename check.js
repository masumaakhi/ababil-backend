const mysql = require('mysql2/promise');
require('dotenv').config();
async function run() {
  const db = await mysql.createConnection(process.env.DATABASE_URL + '?ssl={"rejectUnauthorized":false}');
  const [rows] = await db.query('SELECT id, name, email, phone, address FROM customers ORDER BY id DESC LIMIT 5');
  console.log(rows);
  process.exit();
}
run();
