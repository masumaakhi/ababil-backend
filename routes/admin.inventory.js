const express = require('express');
const router = express.Router();
const multer = require('multer');
const csv = require('csv-parser');
const streamifier = require('streamifier');
const { verifyAdmin } = require('../middleware/auth');

const upload = multer({ storage: multer.memoryStorage() });

module.exports = (db) => {
  // All routes below require admin auth
  router.use(verifyAdmin);

  // ─────────────────────────────────────────────────────────────────────────
  // GET /api/admin/inventory/stats
  // Fetch time-filtered aggregated stats from inventory ledger
  // ─────────────────────────────────────────────────────────────────────────
  router.get('/stats', async (req, res) => {
    try {
      const { startDate, endDate } = req.query;
      let ledgerWhere = '';
      let ledgerParams = [];
      
      if (startDate && endDate) {
        ledgerWhere = 'WHERE l.created_at BETWEEN ? AND ?';
        ledgerParams = [startDate, endDate];
      } else if (startDate) {
        ledgerWhere = 'WHERE l.created_at >= ?';
        ledgerParams = [startDate];
      } else if (endDate) {
        ledgerWhere = 'WHERE l.created_at <= ?';
        ledgerParams = [endDate];
      }

      const [ledgerStats] = await db.query(`
        SELECT 
          SUM(CASE WHEN l.type = 'purchase' THEN l.quantity ELSE 0 END) as total_stock_in,
          SUM(CASE WHEN l.type = 'sale' THEN ABS(l.quantity) ELSE 0 END) as total_stock_out,
          SUM(CASE WHEN l.type = 'sale' THEN ABS(l.quantity) * (COALESCE(v.price, p.base_price) - COALESCE(v.purchase_price, p.purchase_price)) ELSE 0 END) as profit
        FROM inventory_ledger l
        LEFT JOIN products p ON l.product_id = p.id
        LEFT JOIN product_variants v ON l.variant_id = v.id
        ${ledgerWhere}
      `, ledgerParams);

      res.json({
        total_stock_in: ledgerStats[0].total_stock_in || 0,
        total_stock_out: ledgerStats[0].total_stock_out || 0,
        profit: ledgerStats[0].profit || 0
      });
    } catch (err) {
      console.error('Error fetching inventory stats:', err);
      res.status(500).json({ message: 'Server error' });
    }
  });

  // ─────────────────────────────────────────────────────────────────────────
  // GET /api/admin/inventory
  // Fetch all products with aggregated stock summaries
  // ─────────────────────────────────────────────────────────────────────────
  router.get('/', async (req, res) => {
    try {
      const { search, category, brand, stock_status, startDate, endDate } = req.query;

      let whereClauses = [];
      let params = [];

      if (search) {
        whereClauses.push('(p.name_en LIKE ? OR p.slug LIKE ?)');
        params.push(`%${search}%`, `%${search}%`);
      }
      if (category) {
        whereClauses.push('p.category_id = ?');
        params.push(category);
      }
      if (brand && brand !== 'all') {
        whereClauses.push('p.brand_id = ?');
        params.push(brand);
      }
      
      let whereStr = whereClauses.length > 0 ? 'WHERE ' + whereClauses.join(' AND ') : '';

      // We aggregate product inventory and variant inventory.
      // A product has multiple variants in `product_variants`.
      // Each base and variant has a row in `inventory`.
      const [products] = await db.query(`
        SELECT 
          p.id, p.name_en, p.base_price, p.purchase_price, p.images, p.status, p.category_id, p.brand_id, p.created_at,
          c.name_en AS category_name,
          (SELECT COUNT(id) FROM product_variants WHERE product_id = p.id) AS variant_count,
          SUM(i.opening_stock) AS total_opening_stock,
          SUM(i.purchased_stock) AS total_purchased_stock,
          SUM(i.sold_stock) AS total_sold_stock,
          SUM(i.returned_stock) AS total_returned_stock,
          SUM(i.adjusted_stock) AS total_adjusted_stock,
          SUM(i.stock) AS total_current_stock
        FROM products p
        LEFT JOIN categories c ON p.category_id = c.id
        LEFT JOIN inventory i ON i.product_id = p.id
        ${whereStr}
        GROUP BY p.id
        ORDER BY p.id DESC
      `, params);

      // Fetch variants and their inventory for all matched products
      if (products.length > 0) {
        const productIds = products.map(p => p.id);
        const placeholders = productIds.map(() => '?').join(',');
        
        // Fetch inventory details for base products (variant_id IS NULL)
        const [baseInventories] = await db.query(`
          SELECT * FROM inventory 
          WHERE product_id IN (${placeholders}) AND variant_id IS NULL
        `, productIds);

        // Fetch variants and their inventory
        const [variants] = await db.query(`
          SELECT pv.*, 
                 i.id as inventory_id, i.stock, i.opening_stock, i.purchased_stock, 
                 i.sold_stock, i.returned_stock, i.adjusted_stock,
                 i.reorder_level, i.warehouse, i.rack_location, i.batch_number, i.expiry_date
          FROM product_variants pv
          LEFT JOIN inventory i ON i.variant_id = pv.id
          WHERE pv.product_id IN (${placeholders})
        `, productIds);

        products.forEach(p => {
          // Attach base inventory details
          const bInv = baseInventories.find(inv => inv.product_id === p.id);
          p.inventory = bInv || null;

          // Attach variants
          p.variants = variants.filter(v => v.product_id === p.id);
        });
      }

      // Add period stock in/out if dates are provided
      if (startDate || endDate) {
        let ledgerWhere = '';
        let ledgerParams = [];
        if (startDate && endDate) {
          ledgerWhere = 'WHERE created_at BETWEEN ? AND ?';
          ledgerParams = [startDate, endDate];
        } else if (startDate) {
          ledgerWhere = 'WHERE created_at >= ?';
          ledgerParams = [startDate];
        } else if (endDate) {
          ledgerWhere = 'WHERE created_at <= ?';
          ledgerParams = [endDate];
        }

        const [ledgerStats] = await db.query(`
          SELECT product_id,
            SUM(CASE WHEN type = 'purchase' THEN quantity ELSE 0 END) as period_stock_in,
            SUM(CASE WHEN type = 'sale' THEN ABS(quantity) ELSE 0 END) as period_stock_out
          FROM inventory_ledger
          ${ledgerWhere}
          GROUP BY product_id
        `, ledgerParams);

        products.forEach(p => {
          const stat = ledgerStats.find(s => s.product_id === p.id);
          p.period_stock_in = stat ? stat.period_stock_in : 0;
          p.period_stock_out = stat ? stat.period_stock_out : 0;
        });
      }

      // Filter by stock status if requested
      let filteredProducts = products;
      if (stock_status && stock_status !== 'Stock Status') {
        filteredProducts = filteredProducts.filter(p => {
          const currentStock = p.total_current_stock || 0;
          if (stock_status === 'out_of_stock') return currentStock <= 0;
          if (stock_status === 'low_stock') {
             return currentStock > 0 && currentStock <= 5; 
          }
          if (stock_status === 'in_stock') return currentStock > 5;
          if (stock_status === 'stock_in') return p.period_stock_in > 0;
          if (stock_status === 'stock_out') return p.period_stock_out > 0;
          return true;
        });
      }

      res.json(filteredProducts);
    } catch (err) {
      console.error(err);
      res.status(500).json({ message: 'Server error fetching inventory' });
    }
  });

  // ─────────────────────────────────────────────────────────────────────────
  // GET /api/admin/inventory/ledger/:productId
  // Query param: ?variantId=123 (or 'base')
  // ─────────────────────────────────────────────────────────────────────────
  router.get('/ledger/:productId', async (req, res) => {
    try {
      const { productId } = req.params;
      const { variantId } = req.query;

      let query = 'SELECT * FROM inventory_ledger WHERE product_id = ?';
      let params = [productId];

      if (variantId === 'base') {
        query += ' AND variant_id IS NULL';
      } else if (variantId) {
        query += ' AND variant_id = ?';
        params.push(variantId);
      }

      query += ' ORDER BY created_at ASC, id ASC';

      const [ledger] = await db.query(query, params);
      res.json(ledger);
    } catch (err) {
      console.error(err);
      res.status(500).json({ message: 'Server error fetching ledger' });
    }
  });

  // ─────────────────────────────────────────────────────────────────────────
  // POST /api/admin/inventory/entry
  // Handle stock entry transaction
  // ─────────────────────────────────────────────────────────────────────────
  router.post('/entry', async (req, res) => {
    const connection = await db.getConnection();
    try {
      await connection.beginTransaction();

      const { product_id, variant_id, type, quantity, reference } = req.body;
      const qty = parseInt(quantity);

      if (!product_id || !type || isNaN(qty)) {
        await connection.rollback();
        return res.status(400).json({ message: 'Missing required fields' });
      }

      const vId = variant_id === 'base' ? null : variant_id;

      // Get current inventory record
      let invQuery = 'SELECT * FROM inventory WHERE product_id = ? AND variant_id ';
      let invParams = [product_id];
      if (vId) {
        invQuery += '= ?';
        invParams.push(vId);
      } else {
        invQuery += 'IS NULL';
      }
      const [invRows] = await connection.query(invQuery, invParams);

      let inventory;
      if (invRows.length === 0) {
        const [insertRes] = await connection.query(`
          INSERT INTO inventory (product_id, variant_id, stock, opening_stock, purchased_stock, sold_stock, returned_stock, adjusted_stock)
          VALUES (?, ?, 0, 0, 0, 0, 0, 0)
        `, [product_id, vId]);
        inventory = {
          id: insertRes.insertId,
          product_id,
          variant_id: vId,
          stock: 0,
          opening_stock: 0,
          purchased_stock: 0,
          sold_stock: 0,
          returned_stock: 0,
          adjusted_stock: 0
        };
      } else {
        inventory = invRows[0];
      }
      let currentStock = inventory.stock;
      let newBalance = currentStock;

      // Update fields based on type
      let updateFields = {};
      
      switch (type) {
        case 'opening':
          updateFields.opening_stock = inventory.opening_stock + qty;
          newBalance += qty;
          break;
        case 'purchase':
          updateFields.purchased_stock = inventory.purchased_stock + qty;
          newBalance += qty;
          break;
        case 'return':
          updateFields.returned_stock = inventory.returned_stock + qty;
          newBalance += qty;
          break;
        case 'sale':
        case 'damage':
        case 'lost':
          if (type === 'sale') updateFields.sold_stock = inventory.sold_stock + qty;
          if (type === 'damage' || type === 'lost') updateFields.adjusted_stock = inventory.adjusted_stock - qty;
          // quantity is usually positive in request, but reduces stock
          newBalance -= qty;
          break;
        case 'adjustment':
        case 'correction':
          updateFields.adjusted_stock = inventory.adjusted_stock + qty;
          newBalance += qty;
          break;
        default:
          await connection.rollback();
          return res.status(400).json({ message: 'Invalid transaction type' });
      }

      updateFields.stock = newBalance;

      // 1. Update Inventory Table
      const setParts = Object.keys(updateFields).map(key => `${key} = ?`).join(', ');
      const setValues = Object.values(updateFields);
      
      await connection.query(
        `UPDATE inventory SET ${setParts} WHERE id = ?`,
        [...setValues, inventory.id]
      );

      // 2. Insert into Ledger
      // If sale/damage/lost, qty in ledger might be stored as negative for clarity, 
      // but let's store literal quantity used in calculation and determine effect via type.
      // Wait, balance tracks the absolute after-effect. We will store signed qty.
      let signedQty = qty;
      if (['sale', 'damage', 'lost'].includes(type)) {
        signedQty = -qty;
      }

      await connection.query(
        `INSERT INTO inventory_ledger (product_id, variant_id, type, reference, quantity, balance)
         VALUES (?, ?, ?, ?, ?, ?)`,
        [product_id, vId, type, reference || null, signedQty, newBalance]
      );

      await connection.commit();
      res.json({ message: 'Stock entry processed successfully', newBalance });
    } catch (err) {
      await connection.rollback();
      console.error(err);
      res.status(500).json({ message: 'Server error processing stock entry' });
    } finally {
      connection.release();
    }
  });

  // ─────────────────────────────────────────────────────────────────────────
  // PUT /api/admin/inventory/edit/:id
  // Update inventory metadata (reorder_level, warehouse, etc)
  // ─────────────────────────────────────────────────────────────────────────
  router.put('/edit/:id', async (req, res) => {
    try {
      const { id } = req.params;
      const { reorder_level, min_stock, warehouse, rack_location, batch_number, expiry_date, notes } = req.body;

      await db.query(
        `UPDATE inventory SET 
          reorder_level = ?, min_stock = ?, warehouse = ?, rack_location = ?, 
          batch_number = ?, expiry_date = ?, notes = ? 
         WHERE id = ?`,
        [
          reorder_level || 10, min_stock || 0, warehouse || 'Main', 
          rack_location || null, batch_number || null, expiry_date || null, notes || null, 
          id
        ]
      );

      res.json({ message: 'Inventory metadata updated successfully' });
    } catch (err) {
      console.error(err);
      res.status(500).json({ message: 'Server error updating inventory metadata' });
    }
  });

  // ─────────────────────────────────────────────────────────────────────────
  // POST /api/admin/inventory/bulk-update
  // Bulk Inventory Update (CSV)
  // ─────────────────────────────────────────────────────────────────────────
  router.post('/bulk-update', upload.single('file'), async (req, res) => {
    if (!req.file) return res.status(400).json({ message: 'CSV file is required' });

    const results = [];
    const errors = [];

    // Parse CSV
    try {
      await new Promise((resolve, reject) => {
        streamifier.createReadStream(req.file.buffer)
          .pipe(csv({ mapHeaders: ({ header }) => header.trim().replace(/^[\uFEFF\u200B]+/, '') }))
          .on('data', (data) => results.push(data))
          .on('end', resolve)
          .on('error', reject);
      });
    } catch (err) {
      return res.status(400).json({ message: 'Error parsing CSV file' });
    }

    if (results.length === 0) return res.status(400).json({ message: 'CSV file is empty' });

    const connection = await db.getConnection();
    try {
      await connection.beginTransaction();

      let successCount = 0;

      for (const row of results) {
        try {
          const sku = row['SKU'] || row.sku;
          const variantSku = row['Variant SKU'] || row.variant_sku;
          const type = (row['Type'] || row.type || 'adjustment').toLowerCase();
          
          let qty = parseInt(row['Quantity'] || row.quantity || 0);
          
          if (!sku) throw new Error("SKU is required to find product");

          // Find product ID from SKU (Assuming SKU is in product_variants or products don't have SKU directly yet)
          // Wait, products table doesn't have a direct SKU in our schema, only variants have SKU. 
          // If variantSku is provided, match variant. If not, maybe match product by name?
          // Since it's Inventory Edit, let's assume they provide product_id and variant_id or sku.
          // Let's check products by name_en or ID. To make it generic:
          const product_id = row['Product ID'] || row.product_id;
          const variant_id = row['Variant ID'] || row.variant_id;
          
          let pId = product_id;
          let vId = variant_id ? (variant_id === 'base' ? null : variant_id) : null;

          if (!pId && sku) {
            // Find variant by SKU
            const [vRows] = await connection.query('SELECT product_id, id FROM product_variants WHERE sku = ? LIMIT 1', [sku]);
            if (vRows.length > 0) {
              pId = vRows[0].product_id;
              vId = vRows[0].id;
            } else {
              throw new Error(`SKU ${sku} not found`);
            }
          }

          if (!pId) throw new Error("Product ID or Valid SKU is required");

          // Fetch inventory
          let invQuery = 'SELECT * FROM inventory WHERE product_id = ? AND variant_id ';
          let invParams = [pId];
          if (vId) {
            invQuery += '= ?';
            invParams.push(vId);
          } else {
            invQuery += 'IS NULL';
          }
          const [invRows] = await connection.query(invQuery, invParams);

          if (invRows.length === 0) throw new Error("Inventory record not found");

          const inventory = invRows[0];
          let currentStock = inventory.stock;
          let newBalance = currentStock;

          let updateFields = {};
          
          switch (type) {
            case 'opening':
              updateFields.opening_stock = inventory.opening_stock + qty;
              newBalance += qty;
              break;
            case 'purchase':
              updateFields.purchased_stock = inventory.purchased_stock + qty;
              newBalance += qty;
              break;
            case 'return':
              updateFields.returned_stock = inventory.returned_stock + qty;
              newBalance += qty;
              break;
            case 'sale':
            case 'damage':
            case 'lost':
              if (type === 'sale') updateFields.sold_stock = inventory.sold_stock + qty;
              if (type === 'damage' || type === 'lost') updateFields.adjusted_stock = inventory.adjusted_stock - qty;
              newBalance -= qty;
              break;
            case 'adjustment':
            case 'correction':
              updateFields.adjusted_stock = inventory.adjusted_stock + qty;
              newBalance += qty;
              break;
            default:
               // If type is missing but they want to update metadata:
               break;
          }

          // Metadata updates
          if (row['Warehouse'] || row.warehouse) updateFields.warehouse = row['Warehouse'] || row.warehouse;
          if (row['Rack Location'] || row.rack_location) updateFields.rack_location = row['Rack Location'] || row.rack_location;
          if (row['Batch No'] || row.batch_number) updateFields.batch_number = row['Batch No'] || row.batch_number;
          if (row['Expiry Date'] || row.expiry_date) updateFields.expiry_date = row['Expiry Date'] || row.expiry_date;
          if (row['Reorder Level'] || row.reorder_level) updateFields.reorder_level = parseInt(row['Reorder Level'] || row.reorder_level);
          if (row['Notes'] || row.notes) updateFields.notes = row['Notes'] || row.notes;

          if (Object.keys(updateFields).length > 0) {
            updateFields.stock = newBalance;
            const setParts = Object.keys(updateFields).map(key => `${key} = ?`).join(', ');
            const setValues = Object.values(updateFields);
            
            await connection.query(
              `UPDATE inventory SET ${setParts} WHERE id = ?`,
              [...setValues, inventory.id]
            );
          }

          // Ledger entry if stock changed
          if (['opening','purchase','return','sale','damage','lost','adjustment','correction'].includes(type) && qty !== 0) {
            let signedQty = qty;
            if (['sale', 'damage', 'lost'].includes(type)) signedQty = -qty;

            await connection.query(
              `INSERT INTO inventory_ledger (product_id, variant_id, type, reference, quantity, balance)
               VALUES (?, ?, ?, ?, ?, ?)`,
              [pId, vId, type, row['Reference'] || row.reference || 'CSV Bulk Update', signedQty, newBalance]
            );
          }

          successCount++;
        } catch (rowErr) {
          errors.push({ row, error: rowErr.message });
        }
      }

      await connection.commit();
      res.json({ 
        message: 'Bulk inventory update complete', 
        summary: { total: results.length, success: successCount, failed: errors.length },
        errors 
      });
    } catch (err) {
      await connection.rollback();
      console.error(err);
      res.status(500).json({ message: 'Server error processing bulk update' });
    } finally {
      connection.release();
    }
  });

  return router;
};
