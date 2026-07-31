const mysql = require('mysql2/promise');
require('dotenv').config({path: './.env'});
async function run() {
    try {
        const db = await mysql.createConnection('mysql://mysql:WOwUMqFHoHLpf2qVMHnOBrTBITlDq8UhhHk0J2FhDSUTmqhgafL4eeemJLVe7LNO@187.127.214.41:5432/default');
        await db.query("ALTER TABLE riders MODIFY COLUMN payment_model ENUM('salary', 'commission', 'delivery_charge') DEFAULT 'commission'");
        console.log('Success altering riders table');
        db.end();
    } catch(e) {
        console.error(e);
    }
}
run();
