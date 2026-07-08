const express = require('express');
const router = express.Router();
const { verifyAdmin } = require('../middleware/auth');

module.exports = (db) => {
  
  // All routes below require admin authentication
  router.use(verifyAdmin);

  // ─────────────────────────────────────────────────────────────────────────
  // GET /api/admin/customers
  // Fetch all customers along with their total orders and total spent
  // ─────────────────────────────────────────────────────────────────────────
  router.get('/', async (req, res) => {
    try {
      // Use LEFT JOIN to aggregate orders data for each customer
      const query = `
        SELECT 
          c.id, 
          c.name, 
          c.email, 
          c.phone, 
          c.account_type, 
          c.is_active, 
          c.created_at,
          COUNT(o.id) as total_orders,
          COALESCE(SUM(o.total), 0) as total_spent
        FROM customers c
        LEFT JOIN orders o ON c.id = o.customer_id
        GROUP BY c.id, c.name, c.email, c.phone, c.account_type, c.is_active, c.created_at
        ORDER BY c.created_at DESC
      `;
      
      const [rows] = await db.query(query);
      res.json(rows);
    } catch (err) {
      console.error('Error fetching customers:', err);
      res.status(500).json({ message: 'Server error fetching customers' });
    }
  });

  // ─────────────────────────────────────────────────────────────────────────
  // GET /api/admin/customers/:id
  // Fetch a single customer's details, order history, and address
  // ─────────────────────────────────────────────────────────────────────────
  router.get('/:id', async (req, res) => {
    const { id } = req.params;
    try {
      const query = `
        SELECT 
          c.id, 
          c.name, 
          c.email, 
          c.phone, 
          c.account_type, 
          c.is_active, 
          c.created_at,
          COUNT(o.id) as total_orders,
          COALESCE(SUM(o.total), 0) as total_spent
        FROM customers c
        LEFT JOIN orders o ON c.id = o.customer_id
        WHERE c.id = ?
        GROUP BY c.id
      `;
      const [customerRows] = await db.query(query, [id]);
      if (customerRows.length === 0) return res.status(404).json({ message: 'Customer not found' });
      const customer = customerRows[0];

      // Fetch Order History
      const [orderRows] = await db.query('SELECT order_id, created_at as date, total, status FROM orders WHERE customer_id = ? ORDER BY created_at DESC', [id]);
      customer.order_history = orderRows;

      // Determine default address from latest order
      const [addressRows] = await db.query('SELECT address, city FROM orders WHERE customer_id = ? AND address IS NOT NULL AND address != "" ORDER BY created_at DESC LIMIT 1', [id]);
      customer.default_address = addressRows.length > 0 ? addressRows[0] : null;

      res.json(customer);
    } catch (err) {
      console.error('Error fetching customer details:', err);
      res.status(500).json({ message: 'Server error fetching customer details' });
    }
  });

  // ─────────────────────────────────────────────────────────────────────────
  // PATCH /api/admin/customers/bulk-block
  // Block or unblock multiple customers
  // ─────────────────────────────────────────────────────────────────────────
  router.patch('/bulk-block', async (req, res) => {
    const { customerIds, is_active } = req.body;

    if (!Array.isArray(customerIds) || customerIds.length === 0) {
      return res.status(400).json({ message: 'Please provide an array of customer IDs' });
    }

    try {
      // Use parameterized placeholders
      const placeholders = customerIds.map(() => '?').join(',');
      const query = `UPDATE customers SET is_active = ? WHERE id IN (${placeholders})`;
      
      await db.query(query, [is_active ? 1 : 0, ...customerIds]);
      
      res.json({ message: `Successfully ${is_active ? 'unblocked' : 'blocked'} ${customerIds.length} customer(s)` });
    } catch (err) {
      console.error('Error bulk blocking customers:', err);
      res.status(500).json({ message: 'Server error processing bulk block' });
    }
  });

  // ─────────────────────────────────────────────────────────────────────────
  // PATCH /api/admin/customers/:id/block
  // Block or unblock a single customer
  // ─────────────────────────────────────────────────────────────────────────
  router.patch('/:id/block', async (req, res) => {
    const { id } = req.params;
    const { is_active } = req.body;

    try {
      const [result] = await db.query('UPDATE customers SET is_active = ? WHERE id = ?', [is_active ? 1 : 0, id]);
      
      if (result.affectedRows === 0) {
        return res.status(404).json({ message: 'Customer not found' });
      }

      res.json({ message: `Customer successfully ${is_active ? 'unblocked' : 'blocked'}` });
    } catch (err) {
      console.error('Error toggling customer block status:', err);
      res.status(500).json({ message: 'Server error toggling block status' });
    }
  });

  // ─────────────────────────────────────────────────────────────────────────
  // DELETE /api/admin/customers/:id
  // Delete a single customer
  // ─────────────────────────────────────────────────────────────────────────
  router.delete('/:id', async (req, res) => {
    const { id } = req.params;

    try {
      const [result] = await db.query('DELETE FROM customers WHERE id = ?', [id]);
      
      if (result.affectedRows === 0) {
        return res.status(404).json({ message: 'Customer not found' });
      }

      res.json({ message: 'Customer successfully deleted' });
    } catch (err) {
      console.error('Error deleting customer:', err);
      res.status(500).json({ message: 'Server error deleting customer' });
    }
  });

  return router;
};
