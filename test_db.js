const mysql = require('mysql2/promise');
async function run() {
  const db = await mysql.createConnection({host: 'localhost', user: 'root', password: '', database: 'ababil_shop'});
  const [rows] = await db.query("SELECT * FROM products WHERE name_en LIKE '%Colgate%'");
  console.log('Product:', rows);
  if (rows.length > 0) {
    const pId = rows[0].id;
    const [inv] = await db.query('SELECT * FROM inventory WHERE product_id = ?', [pId]);
    console.log('Inventory:', inv);
  }
  await db.end();
}
run();
