const mysql = require('mysql2/promise');
require('dotenv').config();

async function showDb() {
    try {
        const cleanUrl = process.env.DATABASE_URL.replace(/^["']|["']$/g, '');
        const db = await mysql.createConnection(cleanUrl + '?ssl={"rejectUnauthorized":false}');
        
        console.log("=== TABLES IN YOUR DATABASE ===");
        const [tables] = await db.query('SHOW TABLES');
        const dbName = Object.values(tables[0] || {})[0];
        console.table(tables.map(t => Object.values(t)[0]));

        console.log("\n=== LAST 5 ORDERS ===");
        const [orders] = await db.query('SELECT id, customer_name, total, payment_method, status FROM orders ORDER BY id DESC LIMIT 5');
        console.table(orders);

        console.log("\n=== LAST 5 RIDERS ===");
        const [riders] = await db.query('SELECT id, name, phone, zone, status FROM riders ORDER BY id DESC LIMIT 5');
        console.table(riders);

        process.exit(0);
    } catch (e) {
        console.error(e);
        process.exit(1);
    }
}
showDb();
