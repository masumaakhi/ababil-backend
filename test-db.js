const mysql = require('mysql2/promise');
require('dotenv').config();

async function run() {
  let db;
  try {
    db = await mysql.createConnection(process.env.DATABASE_URL + '?ssl={"rejectUnauthorized":false}');
    const [rows] = await db.query('SELECT * FROM customers');
    console.log(rows);
  } catch (err) {
    console.error(err);
  } finally {
    if (db) await db.end();
  }
}
run();
