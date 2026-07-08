const mysql = require('mysql2/promise');
require('dotenv').config();

async function patchStatus() {
  try {
    const db = await mysql.createConnection(process.env.DATABASE_URL + '?ssl={"rejectUnauthorized":false}');
    console.log("Altering affiliates table status enum...");
    await db.query(`ALTER TABLE affiliates MODIFY COLUMN status ENUM('active', 'inactive', 'pending', 'suspended') DEFAULT 'active'`);
    console.log("Success.");
    process.exit(0);
  } catch(e) {
    console.error(e);
    process.exit(1);
  }
}
patchStatus();
