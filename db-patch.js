require('dotenv').config();
const mysql = require('mysql2/promise');

async function patch() {
  const db = mysql.createPool(process.env.DATABASE_URL + '?ssl={"rejectUnauthorized":false}');
  
  await db.query(`
    CREATE TABLE IF NOT EXISTS companies (
      id INT AUTO_INCREMENT PRIMARY KEY,
      name VARCHAR(150) NOT NULL,
      slug VARCHAR(150) UNIQUE NOT NULL,
      contact_person VARCHAR(100),
      email VARCHAR(150),
      phone VARCHAR(20),
      status ENUM('active','inactive') DEFAULT 'active',
      created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
    )
  `);
  console.log('Created companies table');

  try {
    await db.query(`
      ALTER TABLE brands 
      ADD COLUMN company_id INT DEFAULT NULL, 
      ADD COLUMN status ENUM('active','inactive') DEFAULT 'active', 
      ADD CONSTRAINT fk_company FOREIGN KEY (company_id) REFERENCES companies(id) ON DELETE SET NULL
    `);
    console.log('Patched brands table');
  } catch(e) {
    console.log('Brands table might already be patched:', e.message);
  }
  
  process.exit();
}

patch();
