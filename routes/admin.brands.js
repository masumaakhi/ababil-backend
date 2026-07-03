const express = require('express');
const router = express.Router();
const { verifyAdmin } = require('../middleware/auth');

module.exports = (db) => {
  router.use(verifyAdmin);

  // GET /api/admin/brands
  router.get('/', async (req, res) => {
    try {
      // Get brands with company name and product count
      const [rows] = await db.query(`
        SELECT b.*, 
               c.name as company_name,
               (SELECT COUNT(id) FROM products p WHERE p.brand_id = b.id) as products_count
        FROM brands b
        LEFT JOIN companies c ON b.company_id = c.id
        ORDER BY b.name ASC
      `);
      res.json(rows);
    } catch (err) {
      console.error(err);
      res.status(500).json({ message: 'Server error' });
    }
  });

  return router;
};
