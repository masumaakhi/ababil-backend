const express = require('express');
const router = express.Router();

module.exports = (db) => {

  const refundOrderStock = async (itemsJson) => {
    let items = [];
    try {
      items = typeof itemsJson === 'string' ? JSON.parse(itemsJson) : itemsJson;
    } catch (e) {
      console.error('Failed to parse items for refund:', e);
      return;
    }
    if (!Array.isArray(items)) return;

    for (const item of items) {
      let pId = item.id;
      let vId = null;
      if (typeof item.id === 'string' && item.id.includes('-')) {
        const parts = item.id.split('-');
        pId = parts[0];
        vId = parts[1];
      }
      if (vId === 'base') vId = null;

      let invQuery = 'SELECT id, stock, returned_stock, sold_stock FROM inventory WHERE product_id = ?';
      let invParams = [pId];
      if (vId) {
        invQuery += ' AND variant_id = ?';
        invParams.push(vId);
      } else {
        invQuery += ' AND variant_id IS NULL';
      }
      
      let [invRows] = await db.query(invQuery, invParams);

      if (invRows.length === 0 && !vId) {
         [invRows] = await db.query('SELECT id, stock, returned_stock, sold_stock FROM inventory WHERE product_id = ? LIMIT 1', [pId]);
      }

      if (invRows.length > 0) {
        const invId = invRows[0].id;
        const currentStock = invRows[0].stock;
        const newBalance = currentStock + item.quantity;
        const currentReturned = invRows[0].returned_stock || 0;

        await db.query(
          'UPDATE inventory SET stock = ?, returned_stock = ? WHERE id = ?', 
          [newBalance, currentReturned + item.quantity, invId]
        );

        await db.query(
          `INSERT INTO inventory_ledger (product_id, variant_id, type, reference, quantity, balance)
           VALUES (?, ?, 'return', 'Order Cancelled/Deleted', ?, ?)`,
          [pId, vId || null, item.quantity, newBalance]
        );
      }
    }
  };

  const deductOrderStock = async (itemsJson) => {
    let items = [];
    try {
      items = typeof itemsJson === 'string' ? JSON.parse(itemsJson) : itemsJson;
    } catch (e) {
      console.error('Failed to parse items for deduction:', e);
      return;
    }
    if (!Array.isArray(items)) return;

    for (const item of items) {
      let pId = item.id;
      let vId = null;
      if (typeof item.id === 'string' && item.id.includes('-')) {
        const parts = item.id.split('-');
        pId = parts[0];
        vId = parts[1];
      }
      if (vId === 'base') vId = null;

      let invQuery = 'SELECT id, stock, sold_stock FROM inventory WHERE product_id = ?';
      let invParams = [pId];
      if (vId) {
        invQuery += ' AND variant_id = ?';
        invParams.push(vId);
      } else {
        invQuery += ' AND variant_id IS NULL';
      }
      
      let [invRows] = await db.query(invQuery, invParams);

      if (invRows.length === 0 && !vId) {
         [invRows] = await db.query('SELECT id, stock, sold_stock FROM inventory WHERE product_id = ? LIMIT 1', [pId]);
      }

      if (invRows.length > 0) {
        const invId = invRows[0].id;
        const currentStock = invRows[0].stock;
        const newBalance = Math.max(0, currentStock - item.quantity);
        const currentSold = invRows[0].sold_stock || 0;

        await db.query(
          'UPDATE inventory SET stock = ?, sold_stock = ? WHERE id = ?', 
          [newBalance, currentSold + item.quantity, invId]
        );

        await db.query(
          `INSERT INTO inventory_ledger (product_id, variant_id, type, reference, quantity, balance)
           VALUES (?, ?, 'sale', 'Order Re-activated', ?, ?)`,
          [pId, vId || null, -item.quantity, newBalance]
        );
      }
    }
  };

  // ─────────────────────────────────────────────────────────────────────────
  // GET /api/admin/orders
  // Fetch all orders with pagination and filtering
  // ─────────────────────────────────────────────────────────────────────────
  router.get('/', async (req, res) => {
    try {
      const page = parseInt(req.query.page) || 1;
      const limit = parseInt(req.query.limit) || 20;
      const offset = (page - 1) * limit;
      const status = req.query.status;
      const { startDate, endDate } = req.query;

      let whereClauses = [];
      let params = [];

      if (status) {
        whereClauses.push('status = ?');
        params.push(status);
      }

      if (startDate && endDate) {
        whereClauses.push('created_at BETWEEN ? AND ?');
        params.push(startDate, endDate);
      }

      let whereStr = whereClauses.length > 0 ? ' WHERE ' + whereClauses.join(' AND ') : '';

      let query = `SELECT * FROM orders${whereStr} ORDER BY created_at DESC LIMIT ? OFFSET ?`;
      let countQuery = `SELECT COUNT(*) as total FROM orders${whereStr}`;
      
      const queryParams = [...params, limit, offset];
      const [orders] = await db.query(query, queryParams);
      const [countResult] = await db.query(countQuery, params);
      const total = countResult[0].total;

      // Fetch status counts for the selected timeframe
      let countsWhere = '';
      let countsParams = [];
      if (startDate && endDate) {
        countsWhere = ' WHERE created_at BETWEEN ? AND ?';
        countsParams = [startDate, endDate];
      }
      
      const [statusCounts] = await db.query(`
        SELECT 
          COALESCE(SUM(CASE WHEN status = 'confirmed' THEN 1 ELSE 0 END), 0) as confirmed,
          COALESCE(SUM(CASE WHEN status = 'pending' THEN 1 ELSE 0 END), 0) as pending,
          COALESCE(SUM(CASE WHEN status = 'delivered' THEN 1 ELSE 0 END), 0) as delivered,
          COALESCE(SUM(CASE WHEN status = 'cancelled' THEN 1 ELSE 0 END), 0) as cancelled,
          COALESCE(SUM(CASE WHEN status = 'returned' THEN 1 ELSE 0 END), 0) as returned
        FROM orders
        ${countsWhere}
      `, countsParams);

      res.json({
        orders,
        pagination: {
          total,
          page,
          limit,
          totalPages: Math.ceil(total / limit)
        },
        stats: {
          confirmed: parseInt(statusCounts[0].confirmed),
          pending: parseInt(statusCounts[0].pending),
          delivered: parseInt(statusCounts[0].delivered),
          cancelled: parseInt(statusCounts[0].cancelled),
          returned: parseInt(statusCounts[0].returned)
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

      // Fetch current order status and items
      const [orderRows] = await db.query(`SELECT status, items FROM orders WHERE ${column} = ?`, [id]);
      if (orderRows.length === 0) {
        return res.status(404).json({ message: 'Order not found' });
      }
      const oldStatus = orderRows[0].status;
      const items = orderRows[0].items;

      const [result] = await db.query(
        `UPDATE orders SET status = ? WHERE ${column} = ?`,
        [status, id]
      );

      if (result.affectedRows === 0) {
        return res.status(404).json({ message: 'Order not found' });
      }

      // Handle stock refund/deduct based on transition
      if (status === 'cancelled' && oldStatus !== 'cancelled') {
        await refundOrderStock(items);
      } else if (status !== 'cancelled' && oldStatus === 'cancelled') {
        await deductOrderStock(items);
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

      // Fetch order details first to see if we need to refund stock
      const [orderRows] = await db.query(`SELECT status, items FROM orders WHERE ${column} = ?`, [id]);
      if (orderRows.length > 0) {
        const order = orderRows[0];
        // Refund stock if order was not cancelled
        if (order.status !== 'cancelled') {
          await refundOrderStock(order.items);
        }
      }

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

      // Fetch order details first to see if we need to refund stock
      const [orders] = await db.query(`SELECT status, items FROM orders WHERE ${column} IN (${placeholders})`, orderIds);
      for (const order of orders) {
        if (order.status !== 'cancelled') {
          await refundOrderStock(order.items);
        }
      }

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

      const isNumeric = !isNaN(orderIds[0]);
      const column = isNumeric ? 'id' : 'order_id';

      // Fetch current status and items to handle stock changes
      const [orders] = await db.query(`SELECT status, items FROM orders WHERE ${column} IN (${placeholders})`, orderIds);
      
      const [result] = await db.query(
        `UPDATE orders SET status = ? WHERE ${column} IN (${placeholders})`,
        params
      );

      // Handle stock refund/deduct based on transition for each order
      for (const order of orders) {
        if (status === 'cancelled' && order.status !== 'cancelled') {
          await refundOrderStock(order.items);
        } else if (status !== 'cancelled' && order.status === 'cancelled') {
          await deductOrderStock(order.items);
        }
      }

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
