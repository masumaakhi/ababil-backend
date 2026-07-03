const express = require('express');
const router = express.Router();
const bcrypt = require('bcrypt');
const { verifyAdmin } = require('../middleware/auth');

module.exports = (db) => {
  // All routes below require admin auth
  router.use(verifyAdmin);

  // Require manage_admins permission
  const requireManageAdmins = (req, res, next) => {
    const perms = req.admin.permissions || [];
    if (!perms.includes('manage_admins') && req.admin.role_name !== 'Super Admin') {
      return res.status(403).json({ message: 'Permission denied. Requires manage_admins.' });
    }
    next();
  };

  // ─────────────────────────────────────────────────────────────────────────
  // GET /api/admin/management
  // Fetch all admins with their roles
  // ─────────────────────────────────────────────────────────────────────────
  router.get('/', requireManageAdmins, async (req, res) => {
    try {
      const [admins] = await db.query(`
        SELECT u.id, u.name, u.email, u.is_active, u.created_at, u.role_id, r.name as role_name
        FROM admin_users u
        LEFT JOIN admin_roles r ON u.role_id = r.id
        ORDER BY u.created_at DESC
      `);
      res.json(admins);
    } catch (err) {
      console.error('Fetch admins error:', err);
      res.status(500).json({ message: 'Server error fetching admins' });
    }
  });

  // ─────────────────────────────────────────────────────────────────────────
  // POST /api/admin/management
  // Create a new admin
  // ─────────────────────────────────────────────────────────────────────────
  router.post('/', requireManageAdmins, async (req, res) => {
    const { name, email, password, role_id } = req.body;
    
    if (!name || !email || !password || !role_id) {
      return res.status(400).json({ message: 'All fields are required' });
    }

    try {
      const [existing] = await db.query('SELECT id FROM admin_users WHERE email = ?', [email]);
      if (existing.length > 0) {
        return res.status(409).json({ message: 'Admin with this email already exists' });
      }

      const hashedPassword = await bcrypt.hash(password, 10);
      
      const [result] = await db.query(
        'INSERT INTO admin_users (name, email, password, role_id) VALUES (?, ?, ?, ?)',
        [name, email, hashedPassword, role_id]
      );
      
      res.status(201).json({ message: 'Admin created successfully', id: result.insertId });
    } catch (err) {
      console.error('Create admin error:', err);
      res.status(500).json({ message: 'Server error creating admin' });
    }
  });

  // ─────────────────────────────────────────────────────────────────────────
  // PUT /api/admin/management/:id
  // Update an admin
  // ─────────────────────────────────────────────────────────────────────────
  router.put('/:id', requireManageAdmins, async (req, res) => {
    const { id } = req.params;
    const { name, email, password, role_id, is_active } = req.body;

    if (!name || !email || !role_id) {
      return res.status(400).json({ message: 'Name, email, and role_id are required' });
    }

    try {
      // Check if email belongs to someone else
      const [existing] = await db.query('SELECT id FROM admin_users WHERE email = ? AND id != ?', [email, id]);
      if (existing.length > 0) {
        return res.status(409).json({ message: 'Email already in use by another admin' });
      }

      let query = 'UPDATE admin_users SET name = ?, email = ?, role_id = ?, is_active = ?';
      let params = [name, email, role_id, is_active !== undefined ? is_active : 1];

      if (password && password.trim() !== '') {
        const hashedPassword = await bcrypt.hash(password, 10);
        query += ', password = ?';
        params.push(hashedPassword);
      }

      query += ' WHERE id = ?';
      params.push(id);

      const [result] = await db.query(query, params);

      if (result.affectedRows === 0) {
        return res.status(404).json({ message: 'Admin not found' });
      }

      res.json({ message: 'Admin updated successfully' });
    } catch (err) {
      console.error('Update admin error:', err);
      res.status(500).json({ message: 'Server error updating admin' });
    }
  });

  // ─────────────────────────────────────────────────────────────────────────
  // DELETE /api/admin/management/:id
  // Delete an admin
  // ─────────────────────────────────────────────────────────────────────────
  router.delete('/:id', requireManageAdmins, async (req, res) => {
    const { id } = req.params;

    try {
      const [target] = await db.query('SELECT u.id, r.name as role_name FROM admin_users u LEFT JOIN admin_roles r ON u.role_id = r.id WHERE u.id = ?', [id]);
      if (target.length === 0) {
        return res.status(404).json({ message: 'Admin not found' });
      }

      if (target[0].role_name === 'Super Admin') {
        const [superAdmins] = await db.query('SELECT COUNT(u.id) as count FROM admin_users u JOIN admin_roles r ON u.role_id = r.id WHERE r.name = "Super Admin"');
        if (superAdmins[0].count <= 1) {
          return res.status(400).json({ message: 'Cannot delete the last Super Admin' });
        }
      }

      await db.query('DELETE FROM admin_users WHERE id = ?', [id]);
      res.json({ message: 'Admin deleted successfully' });
    } catch (err) {
      console.error('Delete admin error:', err);
      res.status(500).json({ message: 'Server error deleting admin' });
    }
  });

  return router;
};
