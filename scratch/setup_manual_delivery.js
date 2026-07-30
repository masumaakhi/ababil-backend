require('dotenv').config();
const mysql = require('mysql2/promise');

async function setup() {
    const connection = await mysql.createConnection(process.env.DATABASE_URL + '?ssl={"rejectUnauthorized":false}');
    
    try {
        console.log("Creating riders table...");
        await connection.query(`
            CREATE TABLE IF NOT EXISTS riders (
                id INT AUTO_INCREMENT PRIMARY KEY,
                name VARCHAR(255) NOT NULL,
                phone VARCHAR(20) NOT NULL UNIQUE,
                password VARCHAR(255) NOT NULL,
                zone VARCHAR(100),
                payment_model ENUM('salary', 'commission') DEFAULT 'commission',
                per_parcel_rate DECIMAL(10, 2) DEFAULT 0,
                cash_in_hand DECIMAL(10, 2) DEFAULT 0,
                wallet_balance DECIMAL(10, 2) DEFAULT 0,
                status ENUM('active', 'inactive') DEFAULT 'active',
                created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
            )
        `);
        console.log("Riders table created.");

        console.log("Creating rider_settlements table...");
        await connection.query(`
            CREATE TABLE IF NOT EXISTS rider_settlements (
                id INT AUTO_INCREMENT PRIMARY KEY,
                rider_id INT NOT NULL,
                collected_amount DECIMAL(10, 2) DEFAULT 0,
                rider_commission_deducted DECIMAL(10, 2) DEFAULT 0,
                net_deposited DECIMAL(10, 2) DEFAULT 0,
                admin_id INT,
                date TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
                FOREIGN KEY (rider_id) REFERENCES riders(id) ON DELETE CASCADE
            )
        `);
        console.log("Rider settlements table created.");

        console.log("Adding columns to orders table...");
        try {
            await connection.query(`ALTER TABLE orders ADD COLUMN rider_id INT NULL`);
            console.log("Added rider_id column.");
        } catch(e) {
            if(e.code === 'ER_DUP_FIELDNAME') console.log("rider_id already exists.");
            else throw e;
        }

        try {
            await connection.query(`ALTER TABLE orders ADD COLUMN delivery_type ENUM('courier', 'manual') NULL DEFAULT 'courier'`);
            console.log("Added delivery_type column.");
        } catch(e) {
            if(e.code === 'ER_DUP_FIELDNAME') console.log("delivery_type already exists.");
            else throw e;
        }
        
        try {
            await connection.query(`ALTER TABLE orders ADD FOREIGN KEY (rider_id) REFERENCES riders(id) ON DELETE SET NULL`);
            console.log("Added foreign key for rider_id.");
        } catch(e) {
            if(e.code === 'ER_DUP_KEYNAME') console.log("Foreign key for rider_id already exists.");
            // ignore
        }

        console.log("Database setup complete.");
    } catch(err) {
        console.error("Error setting up database:", err);
    } finally {
        await connection.end();
    }
}

setup();
