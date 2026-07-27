const mysql = require('mysql2/promise');
require('dotenv').config({ path: '../.env' });

async function run() {
  try {
    const db = await mysql.createConnection(process.env.DATABASE_URL + '?ssl={"rejectUnauthorized":false}');
    
    const [rows] = await db.query("SELECT id FROM customers WHERE phone='01648085011' AND id != 23");
    if (rows.length > 0) {
      const guestId = rows[0].id;
      console.log('Guest ID with phone:', guestId);
      // Transfer orders
      await db.query('UPDATE orders SET customer_id = 23 WHERE customer_id = ?', [guestId]);
      // Remove phone from guest to allow setting it on main account
      await db.query('UPDATE customers SET phone = NULL WHERE id = ?', [guestId]);
      await db.query('DELETE FROM customers WHERE id = ?', [guestId]);
    }
    
    // Assign missing orders manually just in case
    await db.query('UPDATE orders SET customer_id = 23 WHERE order_id IN ("AB-379194", "AB-610015")');
    // Set phone to the correct user
    await db.query('UPDATE customers SET phone="01648085011" WHERE id=23');
    
    console.log('Fixed DB entries for real.');
    await db.end();
  } catch (err) {
    console.error(err);
  }
}
run();
