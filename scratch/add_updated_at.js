const mysql = require('mysql2/promise');
require('dotenv').config();

async function run() {
    try {
        const cleanUrl = process.env.DATABASE_URL.replace(/^["']|["']$/g, '');
        const db = await mysql.createConnection(cleanUrl + '?ssl={"rejectUnauthorized":false}');
        await db.execute('ALTER TABLE orders ADD COLUMN updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP');
        console.log('updated_at added to orders successfully.');
        process.exit(0);
    } catch (e) {
        if (e.code === 'ER_DUP_FIELDNAME') {
            console.log('updated_at already exists.');
            process.exit(0);
        } else {
            console.error(e);
            process.exit(1);
        }
    }
}
run();
