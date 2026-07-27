const mysql = require('mysql2/promise');
require('dotenv').config();

async function run() {
  const db = mysql.createPool(process.env.DATABASE_URL + '?ssl={"rejectUnauthorized":false}');
  
  await db.query(`
    CREATE TABLE IF NOT EXISTS inventory_batches (
      id INT AUTO_INCREMENT PRIMARY KEY,
      product_id INT NOT NULL,
      variant_id INT DEFAULT NULL,
      quantity INT NOT NULL,
      mfg_date DATE DEFAULT NULL,
      expiry_date DATE DEFAULT NULL,
      created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
      FOREIGN KEY (product_id) REFERENCES products(id) ON DELETE CASCADE,
      FOREIGN KEY (variant_id) REFERENCES product_variants(id) ON DELETE CASCADE
    ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
  `);

  console.log('inventory_batches created successfully');
  
  // Seed the table with existing inventory dates
  const [inventories] = await db.query(`SELECT * FROM inventory WHERE mfg_date IS NOT NULL OR expiry_date IS NOT NULL`);
  for (const inv of inventories) {
    if (inv.stock > 0) {
      // Check if a batch already exists for this inventory
      const [existing] = await db.query(`SELECT id FROM inventory_batches WHERE product_id = ? AND (variant_id = ? OR (variant_id IS NULL AND ? IS NULL)) LIMIT 1`, [inv.product_id, inv.variant_id, inv.variant_id]);
      if (existing.length === 0) {
        await db.query(`
          INSERT INTO inventory_batches (product_id, variant_id, quantity, mfg_date, expiry_date)
          VALUES (?, ?, ?, ?, ?)
        `, [inv.product_id, inv.variant_id, inv.stock, inv.mfg_date, inv.expiry_date]);
      }
    }
  }
  
  console.log('Seeded initial batches');
  process.exit(0);
}

run().catch(console.error);
