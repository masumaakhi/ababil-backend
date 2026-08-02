const mysql = require('mysql2/promise');
const bcrypt = require('bcrypt');
require('dotenv').config();

async function getAdmin() {
    try {
        const cleanUrl = process.env.DATABASE_URL.replace(/^["']|["']$/g, '');
        const db = await mysql.createConnection(cleanUrl + '?ssl={"rejectUnauthorized":false}');
        
        const [users] = await db.query('SELECT * FROM admin_users');
        if (users.length === 0) {
            console.log("No admin users found!");
        } else {
            const email = users[0].email;
            console.log("Found admin email:", email);
            
            // Let's reset the password to '12345678'
            const hashedPassword = await bcrypt.hash('12345678', 10);
            await db.query('UPDATE admin_users SET password = ? WHERE email = ?', [hashedPassword, email]);
            
            console.log("Password successfully reset to: 12345678");
        }
        process.exit(0);
    } catch (e) {
        console.error(e);
        process.exit(1);
    }
}
getAdmin();
