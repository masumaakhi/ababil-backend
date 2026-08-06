const mysql = require('mysql2/promise');
require('dotenv').config();
async function run() {
  const db = await mysql.createConnection(process.env.DATABASE_URL.replace(/['"]/g, '') + '?ssl={"rejectUnauthorized":false}');
  const [rows] = await db.query('DESCRIBE customers');
  console.log(rows);
  process.exit(0);
}
run();
