require('dotenv').config();
const mysql = require('mysql2/promise');

async function run() {
  const dbUrl = process.env.DATABASE_URL;
  let db;
  if (dbUrl) {
    db = await mysql.createConnection(dbUrl);
  } else {
    db = await mysql.createConnection({
      host: process.env.DB_HOST || 'localhost',
      user: process.env.DB_USER || 'root',
      password: process.env.DB_PASS || '',
      database: process.env.DB_NAME || 'ababil-shop',
    });
  }


  console.log('✅ Connected to database.');

  // 1. Add show_on_home column to categories
  try {
    await db.execute('ALTER TABLE categories ADD COLUMN show_on_home TINYINT(1) NOT NULL DEFAULT 1');
    console.log('✔ Added show_on_home column to categories');
  } catch (e) {
    console.log('ℹ show_on_home might already exist:', e.message);
  }

  // 2. Create home_section_products table
  await db.execute(`
    CREATE TABLE IF NOT EXISTS home_section_products (
      id          INT AUTO_INCREMENT PRIMARY KEY,
      category_id INT NOT NULL,
      product_id  INT NOT NULL,
      sort_order  INT NOT NULL DEFAULT 0,
      UNIQUE KEY uq_cat_prod (category_id, product_id),
      FOREIGN KEY (category_id) REFERENCES categories(id) ON DELETE CASCADE,
      FOREIGN KEY (product_id)  REFERENCES products(id)   ON DELETE CASCADE
    ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
  `);
  console.log('✔ Table: home_section_products');

  await db.end();
  console.log('🎉 Migration complete!');
}

run().catch(console.error);
