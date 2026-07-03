const express = require('express');
const bcrypt  = require('bcrypt');
const jwt     = require('jsonwebtoken');
const router  = express.Router();

module.exports = (db) => {

  // ─────────────────────────────────────────────────────────────────────────
  // POST /api/admin/auth/login
  // Admin লগইন — email + password
  // ─────────────────────────────────────────────────────────────────────────
  router.post('/login', async (req, res) => {
    const { email, password } = req.body;

    if (!email || !password) {
      return res.status(400).json({ message: 'Email and password are required' });
    }

    try {
      const [rows] = await db.query(
        `SELECT u.*, r.name as role_name, r.permissions 
         FROM admin_users u 
         LEFT JOIN admin_roles r ON u.role_id = r.id 
         WHERE u.email = ? AND u.is_active = 1`,
        [email]
      );
      const admin = rows[0];

      if (!admin) {
        return res.status(401).json({ message: 'No admin account found with this email' });
      }

      const isMatch = await bcrypt.compare(password, admin.password);
      if (!isMatch) {
        return res.status(401).json({ message: 'Incorrect password' });
      }

      let permissions = [];
      try {
        if (admin.permissions) {
          permissions = typeof admin.permissions === 'string' ? JSON.parse(admin.permissions) : admin.permissions;
        }
      } catch (e) {}

      const token = jwt.sign(
        { 
          id: admin.id, 
          name: admin.name, 
          email: admin.email, 
          role_name: admin.role_name,
          permissions: permissions 
        },
        process.env.JWT_SECRET,
        { expiresIn: '8h' }
      );

      res.json({
        token,
        admin: { 
          id: admin.id, 
          name: admin.name, 
          email: admin.email, 
          role_name: admin.role_name,
          permissions: permissions 
        }
      });
    } catch (err) {
      console.error('Admin login error:', err);
      res.status(500).json({ message: 'Server error' });
    }
  });

  return router;
};
