const mysql = require('mysql2/promise');
require('dotenv').config({ path: '.env' });

async function fixBatches() {
  const db = mysql.createPool(process.env.DATABASE_URL + '?ssl={"rejectUnauthorized":false}');
  try {
    const [inventories] = await db.query('SELECT * FROM inventory');
    let inserted = 0;
    
    for (const inv of inventories) {
      // check if there is an opening batch
      const [batches] = await db.query('SELECT * FROM inventory_batches WHERE product_id = ? AND (variant_id = ? OR (variant_id IS NULL AND ? IS NULL))', [inv.product_id, inv.variant_id, inv.variant_id]);
      
      // If no batches exist for this inventory OR none of them have a quantity equal to the opening stock, and we have an opening stock > 0, we can insert one.
      // Since it's from the CSV import earlier today, there might be NO batches for the initial stock.
      // Let's check if the sum of batch quantities is less than the opening stock. If there are NO batches at all, it's definitely missing.
      // But wait! The screenshot showed a Batch #2 and Batch #3! So there ARE batches, but they are from "+ Entry" (Purchases)!
      // The initial batch (opening stock) is missing because when it was imported via CSV, the batch wasn't created.
      
      // Let's see if there is ANY batch with type 'opening'. Wait, inventory_batches doesn't have a 'type' column.
      // Let's check if there's any batch that was created at the exact same time as the inventory record.
      // Or simply, we can check inventory_ledger for the 'opening' entry to find the exact quantity.
      const [ledgers] = await db.query(`SELECT * FROM inventory_ledger WHERE product_id = ? AND (variant_id = ? OR (variant_id IS NULL AND ? IS NULL)) AND type = 'opening'`, [inv.product_id, inv.variant_id, inv.variant_id]);
      
      if (ledgers.length > 0) {
        const openingQty = ledgers[0].quantity;
        
        // Is there a batch in inventory_batches with this exact quantity and created around the same time?
        const [existingBatch] = await db.query(`
          SELECT * FROM inventory_batches 
          WHERE product_id = ? AND (variant_id = ? OR (variant_id IS NULL AND ? IS NULL))
          AND quantity = ?
        `, [inv.product_id, inv.variant_id, inv.variant_id, openingQty]);
        
        if (existingBatch.length === 0 && openingQty > 0) {
           await db.query(`
             INSERT INTO inventory_batches (product_id, variant_id, quantity, mfg_date, expiry_date, created_at)
             VALUES (?, ?, ?, ?, ?, ?)
           `, [inv.product_id, inv.variant_id, openingQty, inv.mfg_date, inv.expiry_date, ledgers[0].created_at]);
           inserted++;
        } else if (existingBatch.length > 0) {
           // Batch exists, let's just make sure its dates match the inventory dates (in case they were updated via Edit)
           await db.query(`
             UPDATE inventory_batches SET mfg_date = ?, expiry_date = ? WHERE id = ?
           `, [inv.mfg_date, inv.expiry_date, existingBatch[0].id]);
        }
      }
    }
    
    console.log(`Inserted ${inserted} missing initial batches and updated existing ones.`);
    process.exit(0);
  } catch (err) {
    console.error(err);
    process.exit(1);
  }
}

fixBatches();
