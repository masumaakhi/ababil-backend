const express = require('express');
const router = express.Router();
const { verifyAdmin } = require('../middleware/auth');

module.exports = (db) => {
  // All routes below require admin auth
  router.use(verifyAdmin);

  // Require super_admin permission (or just the Super Admin role)
  const requireSuperAdmin = (req, res, next) => {
    if (req.admin.role_name !== 'Super Admin') {
      return res.status(403).json({ message: 'Permission denied. Requires Super Admin.' });
    }
    next();
  };

  // ─────────────────────────────────────────────────────────────────────────
  // GET /api/admin/activity
  // Fetch all activity logs (Super Admin only)
  // ─────────────────────────────────────────────────────────────────────────
  router.get('/', requireSuperAdmin, async (req, res) => {
    try {
      const [logs] = await db.query(`
        SELECT l.id, l.action, l.entity, l.details, l.created_at, u.name as admin_name, u.email as admin_email
        FROM admin_activity_logs l
        JOIN admin_users u ON l.admin_id = u.id
        ORDER BY l.created_at DESC
        LIMIT 200
      `);
      res.json(logs);
    } catch (err) {
      console.error('Fetch activity logs error:', err);
      res.status(500).json({ message: 'Server error fetching activity logs' });
    }
  });

  return router;
};
