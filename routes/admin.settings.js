const express = require('express');
const router = express.Router();

module.exports = (db) => {
  // GET /api/admin/settings - Get all settings as a flat object
  router.get('/', async (req, res) => {
    try {
      const [rows] = await db.query('SELECT setting_key, setting_value FROM store_settings');
      
      const settingsObj = {};
      rows.forEach(row => {
        settingsObj[row.setting_key] = row.setting_value;
      });

      res.json(settingsObj);
    } catch (err) {
      console.error('Fetch settings error:', err);
      res.status(500).json({ message: 'Server error' });
    }
  });

  // POST /api/admin/settings - Update settings
  router.post('/', async (req, res) => {
    const settingsToUpdate = req.body;
    
    if (!settingsToUpdate || typeof settingsToUpdate !== 'object') {
      return res.status(400).json({ message: 'Invalid payload' });
    }

    try {
      // Loop through keys and upsert each one
      for (const [key, value] of Object.entries(settingsToUpdate)) {
        await db.query(
          'INSERT INTO store_settings (setting_key, setting_value) VALUES (?, ?) ON DUPLICATE KEY UPDATE setting_value = ?',
          [key, value !== undefined && value !== null ? String(value) : '', value !== undefined && value !== null ? String(value) : '']
        );
      }

      res.json({ message: 'Settings saved successfully' });
    } catch (err) {
      console.error('Save settings error:', err);
      res.status(500).json({ message: 'Server error' });
    }
  });

  return router;
};
