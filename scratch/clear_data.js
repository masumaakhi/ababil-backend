const mysql = require('mysql2/promise');
require('dotenv').config();

async function clearData() {
    try {
        const cleanUrl = process.env.DATABASE_URL.replace(/^["']|["']$/g, '');
        const db = await mysql.createConnection(cleanUrl + '?ssl={"rejectUnauthorized":false}');
        
        console.log("Disabling foreign key checks...");
        await db.query('SET FOREIGN_KEY_CHECKS = 0;');

        const tablesToClear = [
            'orders',
            'customers',
            'riders',
            'rider_settlements',
            'affiliates',
            'affiliate_payouts'
        ];

        for (const table of tablesToClear) {
            console.log(`Clearing table: ${table}...`);
            await db.query(`TRUNCATE TABLE ${table};`);
            console.log(`✔ ${table} cleared.`);
        }

        console.log("Enabling foreign key checks...");
        await db.query('SET FOREIGN_KEY_CHECKS = 1;');

        console.log("\nData cleared successfully!");
        process.exit(0);
    } catch (e) {
        console.error("Error clearing data:", e);
        process.exit(1);
    }
}
clearData();
