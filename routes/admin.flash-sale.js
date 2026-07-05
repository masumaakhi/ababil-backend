const express = require('express');
const router = express.Router();
const { verifyAdmin } = require('../middleware/auth');
const redisClient = require('../config/redis');

// Invalidate flash sale caches
async function invalidateFlashSaleCache() {
  try {
    const flashKeys = await redisClient.keys('flash-sale:*');
    if (flashKeys.length > 0) {
      await redisClient.del(flashKeys);
    }
    const keys = await redisClient.keys('products-list:*');
    if (keys.length > 0) {
      await redisClient.del(keys);
    }
    console.log("Flash sale cache cleared successfully!");
  } catch (err) {
    console.error("Failed to clear flash sale cache:", err);
  }
}

module.exports = (db) => {
  // All routes below require admin auth
  router.use(verifyAdmin);

  // GET /api/admin/flash-sale
  // Get current flash sale settings
  router.get('/', async (req, res) => {
    try {
      const [rows] = await db.query('SELECT * FROM flash_sale_settings LIMIT 1');
      if (rows.length === 0) {
        return res.status(404).json({ message: 'Settings not found' });
      }
      res.json(rows[0]);
    } catch (err) {
      console.error("Fetch admin flash sale settings error:", err);
      res.status(500).json({ message: 'Server error' });
    }
  });

  // PUT /api/admin/flash-sale
  // Update flash sale settings
  router.put('/', async (req, res) => {
    try {
      const {
        title_en,
        title_bn,
        desc_en,
        desc_bn,
        end_time,
        btn_text_en,
        btn_text_bn,
        status
      } = req.body;

      if (!title_en || !end_time) {
        return res.status(400).json({ message: 'Title (English) and End Time are required' });
      }

      await db.query(
        `UPDATE flash_sale_settings 
         SET title_en = ?, title_bn = ?, desc_en = ?, desc_bn = ?, 
             end_time = ?, btn_text_en = ?, btn_text_bn = ?, status = ? 
         WHERE id = 1`,
        [
          title_en,
          title_bn || null,
          desc_en || null,
          desc_bn || null,
          end_time,
          btn_text_en || 'View All Offers',
          btn_text_bn || 'সব অফার দেখুন',
          status || 'active'
        ]
      );

      await invalidateFlashSaleCache();
      res.json({ message: 'Flash sale settings updated successfully' });
    } catch (err) {
      console.error("Update admin flash sale settings error:", err);
      res.status(500).json({ message: 'Server error' });
    }
  });

  // GET /api/admin/flash-sale/products
  // Get list of products with flash sale indicators
  router.get('/products', async (req, res) => {
    try {
      const [rows] = await db.query(`
        SELECT id, name_en, name_bn, is_flash_sale, flash_sale_stock, base_price, old_price, images 
        FROM products 
        ORDER BY is_flash_sale DESC, id DESC
      `);
      
      const parsed = rows.map(p => ({
        ...p,
        images: typeof p.images === 'string' ? JSON.parse(p.images) : p.images
      }));
      
      res.json(parsed);
    } catch (err) {
      console.error("Fetch admin flash sale products error:", err);
      res.status(500).json({ message: 'Server error' });
    }
  });

  // PUT /api/admin/flash-sale/products/:id
  // Toggle flash sale status and update stock limit for a product
  router.put('/products/:id', async (req, res) => {
    try {
      const { id } = req.params;
      const { is_flash_sale, flash_sale_stock } = req.body;

      const stockVal = flash_sale_stock !== undefined ? parseInt(flash_sale_stock) : 10;
      const statusVal = is_flash_sale ? 1 : 0;

      const [result] = await db.query(
        'UPDATE products SET is_flash_sale = ?, flash_sale_stock = ? WHERE id = ?',
        [statusVal, stockVal, id]
      );

      if (result.affectedRows === 0) {
        return res.status(404).json({ message: 'Product not found' });
      }

      await invalidateFlashSaleCache();
      res.json({ message: 'Product flash sale status updated successfully' });
    } catch (err) {
      console.error("Update admin product flash sale status error:", err);
      res.status(500).json({ message: 'Server error' });
    }
  });

  return router;
};
