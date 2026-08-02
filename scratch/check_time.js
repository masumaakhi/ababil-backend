const mysql = require('mysql2/promise');
require('dotenv').config();

async function run(){ 
    try {
        const db = await mysql.createConnection(process.env.DATABASE_URL.replace(/["']/g, '') + '?ssl={"rejectUnauthorized":false}'); 
        const [rows] = await db.query("SELECT NOW() as db_time"); 
        console.table(rows);
        process.exit(0); 
    } catch(e) {
        console.error(e);
        process.exit(1);
    }
} 
run();
