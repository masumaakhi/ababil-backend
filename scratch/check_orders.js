const mysql = require('mysql2/promise');
require('dotenv').config({ path: '../.env' });

async function run() {
  try {
    const db = await mysql.createConnection(process.env.DATABASE_URL + '?ssl={"rejectUnauthorized":false}');
    console.log('Connected to DB');
    
    // Check Masuma Akter in customers
    const [customers] = await db.query("SELECT id, name, phone, email, account_type FROM customers WHERE name='Masuma Akter'");
    console.log('Customers found:', customers);

    // Check recent orders
    const [orders] = await db.query("SELECT id, order_id, customer_id, customer_name, phone FROM orders ORDER BY id DESC LIMIT 5");
    console.log('Recent orders:', orders);

    await db.end();
  } catch (err) {
    console.error(err);
  }
}
run();
