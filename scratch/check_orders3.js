const mysql = require('mysql2/promise');
require('dotenv').config();

async function run(){ 
    try {
        const db = await mysql.createConnection(process.env.DATABASE_URL.replace(/["']/g, '') + '?ssl={"rejectUnauthorized":false}'); 
        const [rows] = await db.query("SELECT status, SUM(delivery_charge) as total_delivery_charge, COUNT(id) as total_count FROM orders WHERE rider_id IS NOT NULL AND DATE_ADD(updated_at, INTERVAL 6 HOUR) BETWEEN ? AND ? GROUP BY status", ['2026-08-02 00:00:00', '2026-08-02 23:59:59']); 
        console.log("Stats orderQuery results:", rows); 
        process.exit(); 
    } catch(e) {
        console.error(e);
        process.exit(1);
    }
} 
run();
