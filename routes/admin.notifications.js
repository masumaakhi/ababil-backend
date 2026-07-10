const express = require('express');
const router = express.Router();
const { verifyAdmin } = require('../middleware/auth'); // Admin Auth Middleware

module.exports = (db) => {
  // Apply auth middleware
  router.use(verifyAdmin);

  // GET all notifications
  router.get('/', async (req, res) => {
    try {
      const limit = parseInt(req.query.limit) || 20;
      const [rows] = await db.query(
        'SELECT * FROM admin_notifications ORDER BY created_at DESC LIMIT ?',
        [limit]
      );
      res.json(rows);
    } catch (error) {
      console.error(error);
      res.status(500).json({ message: 'Internal server error' });
    }
  });

  // GET unread count
  router.get('/unread-count', async (req, res) => {
    try {
      const [rows] = await db.query(
        'SELECT COUNT(*) as count FROM admin_notifications WHERE is_read = 0'
      );
      res.json({ count: rows[0].count });
    } catch (error) {
      console.error(error);
      res.status(500).json({ message: 'Internal server error' });
    }
  });

  // PUT mark all as read
  router.put('/read-all', async (req, res) => {
    try {
      await db.execute('UPDATE admin_notifications SET is_read = 1 WHERE is_read = 0');
      res.json({ message: 'All notifications marked as read' });
    } catch (error) {
      console.error(error);
      res.status(500).json({ message: 'Internal server error' });
    }
  });

  // PUT mark specific as read
  router.put('/:id/read', async (req, res) => {
    try {
      await db.execute(
        'UPDATE admin_notifications SET is_read = 1 WHERE id = ?',
        [req.params.id]
      );
      res.json({ message: 'Notification marked as read' });
    } catch (error) {
      console.error(error);
      res.status(500).json({ message: 'Internal server error' });
    }
  });

  return router;
};
