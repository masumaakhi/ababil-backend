const mysql = require('mysql2/promise');
require('dotenv').config({ path: '../.env' });

async function run() {
  try {
    const db = await mysql.createConnection(process.env.DATABASE_URL + '?ssl={"rejectUnauthorized":false}');
    
    const [c1] = await db.query("SELECT id, name, phone, email, account_type FROM customers WHERE id=1");
    console.log('Customer 1:', c1);

    await db.end();
  } catch (err) {
    console.error(err);
  }
}
run();
