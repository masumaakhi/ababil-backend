require('dotenv').config();
const mysql = require('mysql2/promise');

async function main() {
  const db = await mysql.createConnection(process.env.DATABASE_URL + '?ssl={"rejectUnauthorized":false}');
  const [rows] = await db.query('DESCRIBE categories');
  console.log(JSON.stringify(rows, null, 2));
  process.exit();
}

main();
