require('dotenv').config();
const mysql = require('mysql2/promise');

async function migrate() {
  const db = mysql.createPool(process.env.DATABASE_URL + '?ssl={"rejectUnauthorized":false}');
  try {
    await db.query(`ALTER TABLE product_variants ADD COLUMN old_price DECIMAL(10,2) NULL AFTER price`);
    console.log("Successfully added old_price to product_variants");
  } catch (err) {
    if (err.code === 'ER_DUP_FIELDNAME') {
      console.log("Column old_price already exists.");
    } else {
      console.error(err);
    }
  }
  process.exit(0);
}
migrate();
