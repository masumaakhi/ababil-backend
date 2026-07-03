require('dotenv').config();
const mysql = require('mysql2/promise');

async function main() {
  const db = await mysql.createConnection(process.env.DATABASE_URL + '?ssl={"rejectUnauthorized":false}');
  const [rows] = await db.query('DESCRIBE products');
  console.log(JSON.stringify(rows, null, 2));
  
  const [fks] = await db.query(`
    SELECT TABLE_NAME, COLUMN_NAME, CONSTRAINT_NAME, REFERENCED_TABLE_NAME, REFERENCED_COLUMN_NAME
    FROM INFORMATION_SCHEMA.KEY_COLUMN_USAGE
    WHERE REFERENCED_TABLE_SCHEMA = 'ababilshop' AND TABLE_NAME = 'products';
  `);
  console.log(JSON.stringify(fks, null, 2));
  
  process.exit();
}

main();
