require('dotenv').config();
const mysql = require('mysql2/promise');
async function run() {
  const db = mysql.createPool(process.env.DATABASE_URL + '?ssl={"rejectUnauthorized":false}');
  const [rows] = await db.query('DESCRIBE product_variants');
  console.log(rows);
  process.exit(0);
}
run();
