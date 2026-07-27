require('dotenv').config();
const mysql = require('mysql2/promise');
const pool = mysql.createPool(process.env.DATABASE_URL + '?ssl={"rejectUnauthorized":false}');
pool.query('SELECT * FROM customers WHERE name LIKE \'%Masuma%\'').then(res => {
  console.dir(res[0]);
  process.exit(0);
});
