require('dotenv').config();
const mysql = require('mysql2/promise');

async function main() {
  const db = await mysql.createConnection(process.env.DATABASE_URL + '?ssl={"rejectUnauthorized":false}');
  
  try {
    await db.query('ALTER TABLE categories ADD COLUMN icon VARCHAR(50) DEFAULT NULL');
    console.log("Added icon column");
  } catch(e) {
    console.log("icon column might already exist:", e.message);
  }
  
  try {
    await db.query('ALTER TABLE categories ADD COLUMN sort_order INT DEFAULT 0');
    console.log("Added sort_order column");
  } catch(e) {
    console.log("sort_order column might already exist:", e.message);
  }
  
  process.exit();
}

main();
