const mysql = require('mysql2/promise');
require('dotenv').config();

async function run(){ 
    try {
        const db = await mysql.createConnection(process.env.DATABASE_URL.replace(/["']/g, '') + '?ssl={"rejectUnauthorized":false}'); 
        const [rows] = await db.query('SELECT id, status, payment_method, rider_id, updated_at FROM orders WHERE rider_id IS NOT NULL'); 
        console.log(rows); 
        process.exit(); 
    } catch(e) {
        console.error(e);
        process.exit(1);
    }
} 
run();
