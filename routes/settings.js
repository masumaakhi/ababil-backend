const express = require('express');
const router = express.Router();

module.exports = (db) => {
  // GET /api/settings - Get public store settings
  router.get('/', async (req, res) => {
    try {
      const publicKeys = [
        'store_name', 'support_email', 'support_phone', 'store_address',
        'shipping_target_city', 'shipping_inside_label', 'shipping_outside_label',
        'shipping_inside_dhaka', 'shipping_outside_dhaka'
      ];
      
      const placeholders = publicKeys.map(() => '?').join(',');
      const [rows] = await db.query(`SELECT setting_key, setting_value FROM store_settings WHERE setting_key IN (${placeholders})`, publicKeys);
      
      const settingsObj = {};
      rows.forEach(row => {
        settingsObj[row.setting_key] = row.setting_value;
      });

      res.json(settingsObj);
    } catch (err) {
      console.error('Fetch public settings error:', err);
      res.status(500).json({ message: 'Server error' });
    }
  });

  return router;
};
