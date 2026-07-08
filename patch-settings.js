const mysql = require('mysql2/promise');
require('dotenv').config();

async function patchSettings() {
  try {
    const db = await mysql.createConnection(process.env.DATABASE_URL + '?ssl={"rejectUnauthorized":false}');
    
    console.log("Creating store_settings table...");
    await db.query(`
      CREATE TABLE IF NOT EXISTS store_settings (
        setting_key VARCHAR(100) PRIMARY KEY,
        setting_value TEXT
      )
    `);

    // Insert default settings
    const defaultSettings = [
      ['store_name', 'Ababil Shop'],
      ['support_email', 'support@ababil-shop.com'],
      ['support_phone', '+8801848711688'],
      ['store_address', 'Mirpur 10, Dhaka, Bangladesh'],
      ['steadfast_api_key', ''],
      ['steadfast_secret_key', ''],
      ['shipping_inside_dhaka', '60'],
      ['shipping_outside_dhaka', '120'],
      ['notify_order_placed', 'true'],
      ['notify_order_dispatched', 'true']
    ];

    console.log("Inserting default settings...");
    for (const [k, v] of defaultSettings) {
      await db.query('INSERT IGNORE INTO store_settings (setting_key, setting_value) VALUES (?, ?)', [k, v]);
    }

    console.log("Settings patch completed successfully.");
    process.exit(0);
  } catch(e) {
    console.error(e);
    process.exit(1);
  }
}
patchSettings();
