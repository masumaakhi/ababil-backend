const mysql = require('mysql2/promise');
require('dotenv').config();
async function run() {
  const db = await mysql.createConnection(process.env.DATABASE_URL.replace(/['"]/g, '') + '?ssl={"rejectUnauthorized":false}');
  console.log('PRODUCTS:', await db.query('DESCRIBE products').then(r=>r[0].map(x=>x.Field)));
  console.log('ORDER_ITEMS:', await db.query('DESCRIBE order_items').catch(e=>e.message));
  console.log('ORDERS:', await db.query('DESCRIBE orders').then(r=>r[0].map(x=>x.Field)));
  console.log('CUSTOMERS:', await db.query('DESCRIBE customers').then(r=>r[0].map(x=>x.Field)));
  process.exit(0);
}
run();
