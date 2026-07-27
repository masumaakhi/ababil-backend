const mysql = require('mysql2/promise');
require('dotenv').config({ path: '.env' });

async function run() {
  const db = mysql.createPool(process.env.DATABASE_URL + '?ssl={"rejectUnauthorized":false}');
  try {
    console.log('Adding affiliate_commission to categories...');
    await db.query('ALTER TABLE categories ADD COLUMN affiliate_commission DECIMAL(5,2) DEFAULT NULL AFTER name_bn');
    console.log('Added affiliate_commission to categories.');
  } catch (err) {
    if (err.code === 'ER_DUP_FIELDNAME') {
      console.log('Column affiliate_commission already exists.');
    } else {
      console.error(err);
    }
  }

  try {
    console.log('Adding commission_earned to orders...');
    await db.query('ALTER TABLE orders ADD COLUMN commission_earned DECIMAL(10,2) DEFAULT 0 AFTER total');
    console.log('Added commission_earned to orders.');
  } catch (err) {
    if (err.code === 'ER_DUP_FIELDNAME') {
      console.log('Column commission_earned already exists.');
    } else {
      console.error(err);
    }
  }

  console.log('Done!');
  process.exit(0);
}

run();
