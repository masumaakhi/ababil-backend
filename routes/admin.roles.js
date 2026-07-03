const express = require('express');
const router = express.Router();
const { verifyAdmin } = require('../middleware/auth');

module.exports = (db) => {
  // Protect all routes
  router.use(verifyAdmin);

  // Require super_admin permission
  const requireManageAdmins = (req, res, next) => {
    // If the token has permissions array, check for manage_admins
    const perms = req.admin.permissions || [];
    if (!perms.includes('manage_admins') && req.admin.role_name !== 'Super Admin') {
      return res.status(403).json({ message: 'Permission denied. Requires manage_admins permission.' });
    }
    next();
  };

  // ─────────────────────────────────────────────────────────────────────────
  // GET /api/admin/roles
  // Fetch all roles
  // ─────────────────────────────────────────────────────────────────────────
  router.get('/', requireManageAdmins, async (req, res) => {
    try {
      const [roles] = await db.query('SELECT id, name, description, permissions, created_at FROM admin_roles ORDER BY created_at DESC');
      res.json(roles);
    } catch (err) {
      console.error('Fetch roles error:', err);
      res.status(500).json({ message: 'Server error fetching roles' });
    }
  });

  // ─────────────────────────────────────────────────────────────────────────
  // POST /api/admin/roles
  // Create a new role
  // ─────────────────────────────────────────────────────────────────────────
  router.post('/', requireManageAdmins, async (req, res) => {
    const { name, description, permissions } = req.body;
    
    if (!name || !permissions || !Array.isArray(permissions)) {
      return res.status(400).json({ message: 'Name and a valid permissions array are required' });
    }

    try {
      const [existing] = await db.query('SELECT id FROM admin_roles WHERE name = ?', [name]);
      if (existing.length > 0) {
        return res.status(409).json({ message: 'Role with this name already exists' });
      }

      const [result] = await db.query(
        'INSERT INTO admin_roles (name, description, permissions) VALUES (?, ?, ?)',
        [name, description || null, JSON.stringify(permissions)]
      );
      
      res.status(201).json({ message: 'Role created successfully', id: result.insertId });
    } catch (err) {
      console.error('Create role error:', err);
      res.status(500).json({ message: 'Server error creating role' });
    }
  });

  // ─────────────────────────────────────────────────────────────────────────
  // PUT /api/admin/roles/:id
  // Update a role
  // ─────────────────────────────────────────────────────────────────────────
  router.put('/:id', requireManageAdmins, async (req, res) => {
    const { id } = req.params;
    const { name, description, permissions } = req.body;

    if (!name || !permissions || !Array.isArray(permissions)) {
      return res.status(400).json({ message: 'Name and a valid permissions array are required' });
    }

    try {
      // Don't allow modifying Super Admin base permissions if it's the core one (optional guard)
      // Usually Super Admin is ID 1
      if (id === '1' && !permissions.includes('manage_admins')) {
        return res.status(400).json({ message: 'Super Admin role must retain manage_admins permission' });
      }

      const [existing] = await db.query('SELECT id FROM admin_roles WHERE name = ? AND id != ?', [name, id]);
      if (existing.length > 0) {
        return res.status(409).json({ message: 'Role name already in use' });
      }

      const [result] = await db.query(
        'UPDATE admin_roles SET name = ?, description = ?, permissions = ? WHERE id = ?',
        [name, description || null, JSON.stringify(permissions), id]
      );

      if (result.affectedRows === 0) {
        return res.status(404).json({ message: 'Role not found' });
      }

      res.json({ message: 'Role updated successfully' });
    } catch (err) {
      console.error('Update role error:', err);
      res.status(500).json({ message: 'Server error updating role' });
    }
  });

  // ─────────────────────────────────────────────────────────────────────────
  // DELETE /api/admin/roles/:id
  // Delete a role
  // ─────────────────────────────────────────────────────────────────────────
  router.delete('/:id', requireManageAdmins, async (req, res) => {
    const { id } = req.params;

    try {
      // Prevent deleting the super admin role
      if (id === '1') {
         return res.status(400).json({ message: 'Cannot delete the Super Admin role' });
      }

      // Check if users exist with this role
      const [users] = await db.query('SELECT id FROM admin_users WHERE role_id = ? LIMIT 1', [id]);
      if (users.length > 0) {
        return res.status(400).json({ message: 'Cannot delete this role because users are assigned to it.' });
      }

      const [result] = await db.query('DELETE FROM admin_roles WHERE id = ?', [id]);
      
      if (result.affectedRows === 0) {
        return res.status(404).json({ message: 'Role not found' });
      }

      res.json({ message: 'Role deleted successfully' });
    } catch (err) {
      console.error('Delete role error:', err);
      res.status(500).json({ message: 'Server error deleting role' });
    }
  });

  return router;
};
