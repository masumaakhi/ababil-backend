const mysql = require('mysql2/promise');
require('dotenv').config();

async function run() {
  const connection = await mysql.createConnection(process.env.DATABASE_URL + '?ssl={"rejectUnauthorized":false}');
  const [rows] = await connection.query('SHOW PROCESSLIST');
  console.table(rows);
  
  // Optionally kill sleeping connections
  for (const row of rows) {
    if (row.Command === 'Sleep' && row.Time > 10) {
      console.log(`Killing process ${row.Id}`);
      await connection.query(`KILL ${row.Id}`);
    }
  }
  await connection.end();
}
run();
