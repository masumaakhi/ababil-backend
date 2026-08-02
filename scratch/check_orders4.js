const mysql = require('mysql2/promise');
require('dotenv').config();

async function run(){ 
    try {
        const db = await mysql.createConnection(process.env.DATABASE_URL.replace(/["']/g, '') + '?ssl={"rejectUnauthorized":false}'); 
        const [rows] = await db.query('SELECT updated_at, DATE_ADD(updated_at, INTERVAL 6 HOUR) as modified_date FROM orders WHERE status="delivered"'); 
        console.log(rows); 
        process.exit(); 
    } catch(e) {
        console.error(e);
        process.exit(1);
    }
} 
run();
