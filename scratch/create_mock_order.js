const mysql = require('mysql2/promise');
require('dotenv').config({ path: '.env' });

async function run() {
  const db = mysql.createPool(process.env.DATABASE_URL + '?ssl={"rejectUnauthorized":false}');
  try {
    const [result] = await db.query(
      "INSERT INTO orders (customer_id, customer_name, phone, email, address, city, upazila, total, payment_method, transaction_id, status, items, affiliate_code, commission_earned) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)",
      [
        1,
        'Test User',
        '0123456789',
        'test@test.com',
        'Address',
        'City',
        'Upazila',
        '1000.00',
        'cod',
        null,
        'pending',
        '[]',
        'WELIM20',
        '100.00'
      ]
    );
    console.log("Inserted order ID:", result.insertId);
  } catch (err) {
    console.error(err);
  }
  process.exit(0);
}

run();
