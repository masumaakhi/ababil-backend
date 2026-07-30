const mysql = require('mysql2/promise');
require('dotenv').config();

async function updateTable() {
    const db = await mysql.createConnection(process.env.DATABASE_URL + '?ssl={"rejectUnauthorized":false}&timezone=Z');
    try {
        await db.query("ALTER TABLE riders ADD COLUMN total_earned DECIMAL(10,2) DEFAULT 0");
        console.log("Added total_earned");
    } catch(e) { if(e.code !== 'ER_DUP_FIELDNAME') console.error(e); else console.log("total_earned exists"); }

    try {
        await db.query("ALTER TABLE riders ADD COLUMN total_paid DECIMAL(10,2) DEFAULT 0");
        console.log("Added total_paid");
    } catch(e) { if(e.code !== 'ER_DUP_FIELDNAME') console.error(e); else console.log("total_paid exists"); }

    try {
        await db.query("ALTER TABLE riders ADD COLUMN total_cod_collected DECIMAL(10,2) DEFAULT 0");
        console.log("Added total_cod_collected");
    } catch(e) { if(e.code !== 'ER_DUP_FIELDNAME') console.error(e); else console.log("total_cod_collected exists"); }

    try {
        await db.query("ALTER TABLE riders ADD COLUMN total_bonuses DECIMAL(10,2) DEFAULT 0");
        console.log("Added total_bonuses");
    } catch(e) { if(e.code !== 'ER_DUP_FIELDNAME') console.error(e); else console.log("total_bonuses exists"); }

    try {
        await db.query("ALTER TABLE riders ADD COLUMN total_fines DECIMAL(10,2) DEFAULT 0");
        console.log("Added total_fines");
    } catch(e) { if(e.code !== 'ER_DUP_FIELDNAME') console.error(e); else console.log("total_fines exists"); }

    db.end();
}

updateTable();
