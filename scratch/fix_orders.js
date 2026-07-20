const mysql = require('mysql2/promise');
require('dotenv').config({ path: '../.env' });

async function run() {
  try {
    const db = await mysql.createConnection(process.env.DATABASE_URL + '?ssl={"rejectUnauthorized":false}');
    await db.query('UPDATE orders SET customer_id = 23 WHERE order_id IN ("AB-379194", "AB-610015")');
    await db.query('UPDATE customers SET phone="01648085011" WHERE id=23');
    console.log('Fixed DB entries.');
    await db.end();
  } catch (err) {
    console.error(err);
  }
}
run();
