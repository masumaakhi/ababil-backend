const express = require('express');
const router = express.Router();

module.exports = (db) => {
  // ─────────────────────────────────────────────────────────────────────────
  // GET /api/admin/orders
  // Fetch all orders with pagination and filtering
  // ─────────────────────────────────────────────────────────────────────────
  router.get('/', async (req, res) => {
    try {
      const page = parseInt(req.query.page) || 1;
      const limit = parseInt(req.query.limit) || 20;
      const offset = (page - 1) * limit;
      const status = req.query.status; // optional filter

      let query = 'SELECT * FROM orders';
      let countQuery = 'SELECT COUNT(*) as total FROM orders';
      const params = [];

      if (status) {
        query += ' WHERE status = ?';
        countQuery += ' WHERE status = ?';
        params.push(status);
      }

      query += ' ORDER BY created_at DESC LIMIT ? OFFSET ?';
      params.push(limit, offset);

      const [orders] = await db.query(query, params);
      const [countResult] = await db.query(countQuery, status ? [status] : []);
      const total = countResult[0].total;

      res.json({
        orders,
        pagination: {
          total,
          page,
          limit,
          totalPages: Math.ceil(total / limit)
        }
      });
    } catch (err) {
      console.error('Fetch orders error:', err);
      res.status(500).json({ message: 'Server error fetching orders' });
    }
  });

  // ─────────────────────────────────────────────────────────────────────────
  // GET /api/admin/orders/:id
  // Fetch single order details by internal DB ID or order_id
  // ─────────────────────────────────────────────────────────────────────────
  router.get('/:id', async (req, res) => {
    const { id } = req.params;
    try {
      // Check if id is numeric (internal id) or string (AB-123456)
      const isNumeric = !isNaN(id);
      const column = isNumeric ? 'id' : 'order_id';

      const [rows] = await db.query(
        `SELECT * FROM orders WHERE ${column} = ?`,
        [id]
      );

      if (!rows[0]) {
        return res.status(404).json({ message: 'Order not found' });
      }

      res.json(rows[0]);
    } catch (err) {
      console.error('Fetch order detail error:', err);
      res.status(500).json({ message: 'Server error fetching order' });
    }
  });

  // ─────────────────────────────────────────────────────────────────────────
  // PUT /api/admin/orders/:id/status
  // Update order status
  // ─────────────────────────────────────────────────────────────────────────
  router.put('/:id/status', async (req, res) => {
    const { id } = req.params;
    const { status } = req.body;

    const validStatuses = ['pending', 'confirmed', 'processing', 'shipped', 'delivered', 'cancelled'];
    if (!validStatuses.includes(status)) {
      return res.status(400).json({ message: 'Invalid status' });
    }

    try {
      const isNumeric = !isNaN(id);
      const column = isNumeric ? 'id' : 'order_id';

      const [result] = await db.query(
        `UPDATE orders SET status = ? WHERE ${column} = ?`,
        [status, id]
      );

      if (result.affectedRows === 0) {
        return res.status(404).json({ message: 'Order not found' });
      }

      res.json({ message: 'Order status updated successfully', status });
    } catch (err) {
      console.error('Update order status error:', err);
      res.status(500).json({ message: 'Server error updating status' });
    }
  });

  // ─────────────────────────────────────────────────────────────────────────
  // DELETE /api/admin/orders/:id
  // Delete an order
  // ─────────────────────────────────────────────────────────────────────────
  router.delete('/:id', async (req, res) => {
    const { id } = req.params;
    try {
      const isNumeric = !isNaN(id);
      const column = isNumeric ? 'id' : 'order_id';

      const [result] = await db.query(
        `DELETE FROM orders WHERE ${column} = ?`,
        [id]
      );

      if (result.affectedRows === 0) {
        return res.status(404).json({ message: 'Order not found' });
      }

      res.json({ message: 'Order deleted successfully' });
    } catch (err) {
      console.error('Delete order error:', err);
      res.status(500).json({ message: 'Server error deleting order' });
    }
  });

  // ─────────────────────────────────────────────────────────────────────────
  // POST /api/admin/orders/bulk-delete
  // Bulk delete orders
  // ─────────────────────────────────────────────────────────────────────────
  router.post('/bulk-delete', async (req, res) => {
    const { orderIds } = req.body;
    
    if (!orderIds || !Array.isArray(orderIds) || orderIds.length === 0) {
      return res.status(400).json({ message: 'No orders selected' });
    }

    try {
      const isNumeric = !isNaN(orderIds[0]);
      const column = isNumeric ? 'id' : 'order_id';
      const placeholders = orderIds.map(() => '?').join(',');

      const [result] = await db.query(
        `DELETE FROM orders WHERE ${column} IN (${placeholders})`,
        orderIds
      );

      res.json({ message: `${result.affectedRows} orders deleted successfully` });
    } catch (err) {
      console.error('Bulk delete order error:', err);
      res.status(500).json({ message: 'Server error during bulk delete' });
    }
  });

  // ─────────────────────────────────────────────────────────────────────────
  // PUT /api/admin/orders/bulk-status
  // Bulk update order statuses
  // ─────────────────────────────────────────────────────────────────────────
  router.put('/bulk-status', async (req, res) => {
    const { orderIds, status } = req.body;
    
    if (!orderIds || !Array.isArray(orderIds) || orderIds.length === 0) {
      return res.status(400).json({ message: 'No orders selected' });
    }

    const validStatuses = ['pending', 'confirmed', 'processing', 'shipped', 'delivered', 'cancelled'];
    if (!validStatuses.includes(status)) {
      return res.status(400).json({ message: 'Invalid status' });
    }

    try {
      const placeholders = orderIds.map(() => '?').join(',');
      const params = [status, ...orderIds];

      // Assuming we're filtering on internal ID, but some might pass order_id string. Let's use order_id since frontend has that readily available.
      // Wait, frontend order.id is internal ID? Wait, order.order_id is string like AB-123.
      // We can just check if the first element is numeric to decide column.
      const isNumeric = !isNaN(orderIds[0]);
      const column = isNumeric ? 'id' : 'order_id';

      const [result] = await db.query(
        `UPDATE orders SET status = ? WHERE ${column} IN (${placeholders})`,
        params
      );

      res.json({ message: `${result.affectedRows} orders updated successfully`, status });
    } catch (err) {
      console.error('Bulk update order status error:', err);
      res.status(500).json({ message: 'Server error during bulk update' });
    }
  });

  // ─────────────────────────────────────────────────────────────────────────
  // POST /api/admin/orders/send-courier
  // Mock sending orders to Steadfast/Courier
  // ─────────────────────────────────────────────────────────────────────────
  router.post('/send-courier', async (req, res) => {
    const { orderIds } = req.body;
    
    if (!orderIds || !Array.isArray(orderIds) || orderIds.length === 0) {
      return res.status(400).json({ message: 'No orders selected' });
    }

    try {
      const isNumeric = !isNaN(orderIds[0]);
      const column = isNumeric ? 'id' : 'order_id';

      // Loop through each to generate unique tracking info
      for (const id of orderIds) {
        const consignmentId = 'ST-' + Math.floor(100000 + Math.random() * 900000);
        const trackingUrl = `https://steadfast.com.bd/t/${consignmentId}`;

        await db.query(
          `UPDATE orders SET status = 'shipped', consignment_id = ?, tracking_url = ? WHERE ${column} = ?`,
          [consignmentId, trackingUrl, id]
        );
      }

      res.json({ message: `${orderIds.length} orders successfully sent to Courier.` });
    } catch (err) {
      console.error('Send courier error:', err);
      res.status(500).json({ message: 'Server error sending to courier' });
    }
  });

  return router;
};
