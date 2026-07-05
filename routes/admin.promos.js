const express = require('express');
const router = express.Router();
const { verifyAdmin } = require('../middleware/auth');

module.exports = (db) => {
  router.use(verifyAdmin);

  // GET /api/admin/promos — list all promo codes
  router.get('/', async (req, res) => {
    try {
      const [promos] = await db.query(
        'SELECT * FROM promo_codes ORDER BY created_at DESC'
      );
      res.json(promos);
    } catch (err) {
      console.error('Fetch promos error:', err);
      res.status(500).json({ message: 'Server error' });
    }
  });

  // POST /api/admin/promos — create promo code
  router.post('/', async (req, res) => {
    const { code, discount_type, discount_value, min_order, usage_limit, start_date, end_date, status } = req.body;

    if (!code || !discount_value) {
      return res.status(400).json({ message: 'Code and discount value are required.' });
    }

    try {
      const [existing] = await db.query('SELECT id FROM promo_codes WHERE code = ?', [code.toUpperCase()]);
      if (existing.length > 0) {
        return res.status(409).json({ message: 'Promo code already exists.' });
      }

      const [result] = await db.query(
        `INSERT INTO promo_codes (code, discount_type, discount_value, min_order, usage_limit, start_date, end_date, status)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?)`,
        [
          code.toUpperCase(),
          discount_type || 'percentage',
          parseFloat(discount_value),
          min_order ? parseFloat(min_order) : null,
          usage_limit ? parseInt(usage_limit) : null,
          start_date || null,
          end_date || null,
          status || 'active'
        ]
      );
      res.status(201).json({ message: 'Promo code created', id: result.insertId });
    } catch (err) {
      console.error('Create promo error:', err);
      res.status(500).json({ message: 'Server error' });
    }
  });

  // GET /api/admin/promos/:id — get single promo
  router.get('/:id', async (req, res) => {
    try {
      const [rows] = await db.query('SELECT * FROM promo_codes WHERE id = ?', [req.params.id]);
      if (rows.length === 0) return res.status(404).json({ message: 'Not found' });
      res.json(rows[0]);
    } catch (err) {
      res.status(500).json({ message: 'Server error' });
    }
  });

  // PUT /api/admin/promos/:id — update promo
  router.put('/:id', async (req, res) => {
    const { code, discount_type, discount_value, min_order, usage_limit, start_date, end_date, status } = req.body;
    const { id } = req.params;

    if (!code || !discount_value) {
      return res.status(400).json({ message: 'Code and discount value are required.' });
    }

    try {
      // Check duplicate code (excluding self)
      const [existing] = await db.query('SELECT id FROM promo_codes WHERE code = ? AND id != ?', [code.toUpperCase(), id]);
      if (existing.length > 0) {
        return res.status(409).json({ message: 'Promo code already exists.' });
      }

      const [result] = await db.query(
        `UPDATE promo_codes SET code=?, discount_type=?, discount_value=?, min_order=?, usage_limit=?, start_date=?, end_date=?, status=? WHERE id=?`,
        [
          code.toUpperCase(),
          discount_type || 'percentage',
          parseFloat(discount_value),
          min_order ? parseFloat(min_order) : null,
          usage_limit ? parseInt(usage_limit) : null,
          start_date || null,
          end_date || null,
          status || 'active',
          id
        ]
      );

      if (result.affectedRows === 0) return res.status(404).json({ message: 'Not found' });
      res.json({ message: 'Promo code updated' });
    } catch (err) {
      console.error('Update promo error:', err);
      res.status(500).json({ message: 'Server error' });
    }
  });

  // DELETE /api/admin/promos/:id — delete promo
  router.delete('/:id', async (req, res) => {
    try {
      const [result] = await db.query('DELETE FROM promo_codes WHERE id = ?', [req.params.id]);
      if (result.affectedRows === 0) return res.status(404).json({ message: 'Not found' });
      res.json({ message: 'Promo code deleted' });
    } catch (err) {
      console.error('Delete promo error:', err);
      res.status(500).json({ message: 'Server error' });
    }
  });

  return router;
};
