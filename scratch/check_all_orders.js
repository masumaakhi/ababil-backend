const mysql = require('mysql2/promise');
require('dotenv').config({ path: '.env' });

async function run() {
  const db = mysql.createPool(process.env.DATABASE_URL + '?ssl={"rejectUnauthorized":false}');
  try {
    const [allOrders] = await db.query(
        "SELECT affiliate_code, total, commission_earned, created_at as order_datetime, DATE_FORMAT(created_at, '%Y-%m-%d') as order_date FROM orders WHERE affiliate_code IS NOT NULL AND status != 'cancelled'"
    );
    console.log(allOrders);
  } catch (err) {
    console.error(err);
  }
  process.exit(0);
}

run();
