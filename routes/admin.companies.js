const express = require('express');
const router = express.Router();
const { verifyAdmin } = require('../middleware/auth');

module.exports = (db) => {
  router.use(verifyAdmin);

  // GET /api/admin/companies
  router.get('/', async (req, res) => {
    try {
      // Get companies with their brand count
      const [rows] = await db.query(`
        SELECT c.*, 
               (SELECT COUNT(id) FROM brands b WHERE b.company_id = c.id) as brands_count
        FROM companies c
        ORDER BY c.name ASC
      `);
      res.json(rows);
    } catch (err) {
      console.error(err);
      res.status(500).json({ message: 'Server error' });
    }
  });

  return router;
};
