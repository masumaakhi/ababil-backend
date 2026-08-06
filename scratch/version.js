const mysql = require('mysql2/promise');
require('dotenv').config();
async function run() {
  const db = await mysql.createConnection(process.env.DATABASE_URL.replace(/['"]/g, '') + '?ssl={"rejectUnauthorized":false}');
  console.log(await db.query('SELECT VERSION()').then(r=>r[0]));
  process.exit(0);
}
run();
