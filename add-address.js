const mysql = require('mysql2/promise');
require('dotenv').config();

async function run() {
  let db;
  try {
    db = await mysql.createConnection(process.env.DATABASE_URL + '?ssl={"rejectUnauthorized":false}');
    
    // Add address column if it doesn't exist
    try {
      await db.query('ALTER TABLE customers ADD COLUMN address TEXT DEFAULT NULL');
      console.log('Successfully added address column.');
    } catch (err) {
      if (err.code === 'ER_DUP_FIELDNAME') {
        console.log('Address column already exists.');
      } else {
        throw err;
      }
    }
  } catch (err) {
    console.error('Error:', err);
  } finally {
    if (db) await db.end();
  }
}

run();
