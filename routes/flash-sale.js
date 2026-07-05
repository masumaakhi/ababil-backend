const express = require('express');
const router = express.Router();
const cache = require('../middlewares/cache');

module.exports = (db) => {
  // GET /api/flash-sale
  // Fetch active flash sale details and products
  router.get('/', cache('flash-sale', 600), async (req, res) => {
    try {
      // 1. Fetch settings
      const [settingsRows] = await db.query('SELECT * FROM flash_sale_settings WHERE id = 1 LIMIT 1');
      if (settingsRows.length === 0) {
        return res.status(404).json({ message: 'Settings not found' });
      }
      
      const settings = settingsRows[0];

      // 2. Fetch products if active
      let products = [];
      if (settings.status === 'active') {
        const [productRows] = await db.query(`
          SELECT p.*, c.name_en as category_name, b.name as brand_name
          FROM products p
          LEFT JOIN categories c ON p.category_id = c.id
          LEFT JOIN brands b ON p.brand_id = b.id
          WHERE p.status = 'active' AND p.is_flash_sale = 1
          ORDER BY p.created_at DESC
        `);
        
        products = productRows.map(p => ({
          ...p,
          images: typeof p.images === 'string' ? JSON.parse(p.images) : p.images
        }));
      }

      res.json({ settings, products });
    } catch (err) {
      console.error("Fetch public flash sale error:", err);
      res.status(500).json({ message: 'Server error' });
    }
  });

  return router;
};
