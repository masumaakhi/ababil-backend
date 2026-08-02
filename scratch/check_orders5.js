const mysql = require('mysql2/promise');
require('dotenv').config();

async function run(){ 
    try {
        const db = await mysql.createConnection(process.env.DATABASE_URL.replace(/["']/g, '') + '?ssl={"rejectUnauthorized":false}'); 
        const startDate = '2026-08-01T18:00:00.000Z';
        const endDate = '2026-08-02T17:59:59.999Z';
        let params = [startDate, endDate];
        
        const [settlements] = await db.query(
            `SELECT SUM(collected_amount) as submitted_cod, SUM(rider_commission_deducted) as paid_wallet 
             FROM rider_settlements 
             WHERE rider_id = ? AND date BETWEEN ? AND ?`,
            [1, ...params]
        );
        console.log("Settlements:", settlements);
        
        process.exit(); 
    } catch(e) {
        console.error(e);
        process.exit(1);
    }
} 
run();
