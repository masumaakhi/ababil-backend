const mysql = require('mysql2/promise');
require('dotenv').config();

async function updateTable() {
    const db = await mysql.createConnection(process.env.DATABASE_URL + '?ssl={"rejectUnauthorized":false}&timezone=Z');
    try {
        await db.query("ALTER TABLE riders ADD COLUMN base_salary DECIMAL(10,2) DEFAULT 0");
        console.log("Added base_salary");
    } catch(e) { if(e.code !== 'ER_DUP_FIELDNAME') console.error(e); else console.log("base_salary exists"); }

    db.end();
}

updateTable();
