require('dotenv').config();
const mysql = require('mysql2/promise');

async function main() {
  const db = await mysql.createConnection(process.env.DATABASE_URL + '?ssl={"rejectUnauthorized":false}');
  try {
    const [r] = await db.query('SELECT id, name_en, status, is_flash_sale FROM products WHERE is_flash_sale = 1');
    console.log("Flash sale products in DB:", r);
  } catch (e) {
    console.error(e);
  } finally {
    await db.end();
  }
}

main();
