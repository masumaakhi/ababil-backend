const express = require('express');
const { createNotification } = require('../utils/notification');
const router  = express.Router();

module.exports = (db) => {

  // ─────────────────────────────────────────────────────────────────────────
  // POST /api/orders/guest
  // Guest order place করা + auto account creation
  // ─────────────────────────────────────────────────────────────────────────
  router.post('/guest', async (req, res) => {
    const {
      name, phone, email,
      address, upazila, city,
      items, total,
      paymentMethod, transactionId, affiliateCode
    } = req.body;

    // Validation
    if (!name || !phone || !address || !items || !total) {
      return res.status(400).json({ message: 'Name, phone, address, items and total are required' });
    }

    if (paymentMethod === 'bkash' && !transactionId) {
      return res.status(400).json({ message: 'Transaction ID is required for online payment' });
    }

    const orderId = 'AB-' + Math.floor(100000 + Math.random() * 900000);
    let customerId  = null;
    let autoCreated = false;

    try {
      // Check for JWT token
      const token = req.headers.authorization?.split(' ')[1];
      if (token) {
        try {
          const decoded = require('jsonwebtoken').verify(token, process.env.JWT_SECRET);
          customerId = decoded.id;
        } catch (e) {
          // invalid token, fallback to guest logic
        }
      }

      if (customerId) {
        // Logged in user, update address and phone if null
        await db.query('UPDATE customers SET name=?, address=?, phone=COALESCE(phone, ?) WHERE id=?', [name, `${address}\n${upazila ? upazila + ', ' : ''}${city || 'Dhaka'}`, phone, customerId]);
      } else {
        let existingCustomer = null;

        // Email দিয়ে আগে চেক করা (কারণ email unique)
        if (email) {
          const [rows] = await db.query('SELECT id, account_type FROM customers WHERE email = ?', [email]);
          if (rows.length > 0) existingCustomer = rows[0];
        }

        // Email দিয়ে না পেলে Phone দিয়ে চেক করা
        if (!existingCustomer && phone) {
          const [rows] = await db.query('SELECT id, account_type FROM customers WHERE phone = ?', [phone]);
          if (rows.length > 0) existingCustomer = rows[0];
        }

        if (existingCustomer) {
          // আগে থেকে account আছে — link করো
          customerId = existingCustomer.id;
          // Name and address আপডেট করো
          await db.query('UPDATE customers SET name=?, address=?, phone=COALESCE(phone, ?) WHERE id=?', [name, `${address}\n${upazila ? upazila + ', ' : ''}${city || 'Dhaka'}`, phone, customerId]);
        } else {
          // নতুন guest account তৈরি
          const [result] = await db.query(
            'INSERT INTO customers (name, phone, email, address, account_type) VALUES (?, ?, ?, ?, "guest")',
            [name, phone, email || null, `${address}\n${upazila ? upazila + ', ' : ''}${city || 'Dhaka'}`]
          );
          customerId  = result.insertId;
          autoCreated = true;
        }
      }

      // ── Order save ──
      await db.query(
        `INSERT INTO orders
          (order_id, customer_id, customer_name, phone, email, address, upazila, city,
           items, total, payment_method, transaction_id, affiliate_code)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
        [
          orderId,
          customerId,
          name,
          phone,
          email || null,
          address,
          upazila || null,
          city || 'Dhaka',
          JSON.stringify(items),
          total,
          paymentMethod || 'cod',
          transactionId || null,
          affiliateCode || null
        ]
      );

      // ── Deduct Stock from Inventory ──
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
           // Fallback to first available variant
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
             VALUES (?, ?, 'sale', ?, ?, ?)`,
            [pId, vId || null, `Order ${orderId}`, -item.quantity, newBalance]
          );
        }
      }

      await createNotification(db, 'New Order Received', `Order #${orderId} was placed by ${name} for ৳${total}.`, 'order');

      res.json({
        orderId,
        autoCreated,
        message: autoCreated
          ? 'Order placed. Guest account created with your phone number.'
          : 'Order placed successfully.'
      });
    } catch (err) {
      console.error('Guest order error:', err);
      res.status(500).json({ message: 'Failed to place order. Please try again.' });
    }
  });

  // ─────────────────────────────────────────────────────────────────────────
  // POST /api/orders/validate-promo
  // Validate promo code and get discount info
  // ─────────────────────────────────────────────────────────────────────────
  router.post('/validate-promo', async (req, res) => {
    const { code, subtotal } = req.body;

    if (!code) {
      return res.status(400).json({ message: 'Promo code is required.' });
    }

    try {
      const [rows] = await db.query(
        'SELECT * FROM promo_codes WHERE code = ? AND status = "active"',
        [code.toUpperCase()]
      );

      if (rows.length === 0) {
        return res.status(404).json({ message: 'Invalid or inactive promo code.' });
      }

      const promo = rows[0];

      // Check dates if present
      const now = new Date();
      if (promo.start_date && new Date(promo.start_date) > now) {
        return res.status(400).json({ message: 'Promo code has not started yet.' });
      }
      if (promo.end_date && new Date(promo.end_date) < now) {
        return res.status(400).json({ message: 'Promo code has expired.' });
      }

      // Check minimum order value
      if (promo.min_order && subtotal < parseFloat(promo.min_order)) {
        return res.status(400).json({ 
          message: `Minimum order value to use this code is ৳${promo.min_order}.` 
        });
      }

      // Check usage limits if present
      if (promo.usage_limit && promo.usage_count >= promo.usage_limit) {
        return res.status(400).json({ message: 'Promo code usage limit reached.' });
      }

      // Calculate discount amount
      let discountAmount = 0;
      if (promo.discount_type === 'percentage') {
        discountAmount = (subtotal * parseFloat(promo.discount_value)) / 100;
      } else {
        discountAmount = parseFloat(promo.discount_value);
      }

      // Ensure discount is not greater than subtotal
      if (discountAmount > subtotal) {
        discountAmount = subtotal;
      }

      res.json({
        valid: true,
        code: promo.code,
        discountType: promo.discount_type,
        discountValue: promo.discount_value,
        discountAmount
      });
    } catch (err) {
      console.error('Validate promo error:', err);
      res.status(500).json({ message: 'Server error validating promo code.' });
    }
  });

  // ─────────────────────────────────────────────────────────────────────────
  // GET /api/orders/track/:orderId
  // Order tracking (public — যে কেউ order ID দিয়ে দেখতে পারবে)
  // ─────────────────────────────────────────────────────────────────────────
  router.get('/track/:orderId', async (req, res) => {
    const { orderId } = req.params;

    try {
      const [rows] = await db.query(
        'SELECT * FROM orders WHERE order_id = ?',
        [orderId]
      );

      if (!rows[0]) {
        return res.status(404).json({ message: 'Order not found' });
      }

      res.json({ order: rows[0] });
    } catch (err) {
      console.error('Order track error:', err);
      res.status(500).json({ message: 'Server error' });
    }
  });

  // ─────────────────────────────────────────────────────────────────────────
  // GET /api/orders/my-orders
  // Logged-in user এর order history দেখা
  // ─────────────────────────────────────────────────────────────────────────
  router.get('/my-orders', async (req, res) => {
    const token = req.headers.authorization?.split(' ')[1];
    if (!token) return res.status(401).json({ message: 'Token required' });

    try {
      const decoded = require('jsonwebtoken').verify(token, process.env.JWT_SECRET);
      
      const [rows] = await db.query(
        'SELECT * FROM orders WHERE customer_id = ? ORDER BY id DESC',
        [decoded.id]
      );
      
      res.json({ orders: rows });
    } catch (err) {
      console.error('My orders error:', err);
      res.status(401).json({ message: 'Invalid token or server error' });
    }
  });

  // ─────────────────────────────────────────────────────────────────────────
  // GET /api/orders/my-products
  // Logged-in user এর সফলভাবে ডেলিভারি হওয়া প্রোডাক্টগুলো দেখা
  // ─────────────────────────────────────────────────────────────────────────
  router.get('/my-products', async (req, res) => {
    const token = req.headers.authorization?.split(' ')[1];
    if (!token) return res.status(401).json({ message: 'Token required' });

    try {
      const decoded = require('jsonwebtoken').verify(token, process.env.JWT_SECRET);
      
      const [rows] = await db.query(
        'SELECT items FROM orders WHERE customer_id = ? AND status = "delivered" ORDER BY id DESC',
        [decoded.id]
      );
      
      let allProducts = [];
      const productIds = new Set();

      rows.forEach(row => {
        let items = [];
        try {
          items = typeof row.items === 'string' ? JSON.parse(row.items) : row.items;
        } catch(e) {}
        
        if (Array.isArray(items)) {
          items.forEach(item => {
            // Deduplicate by ID
            if (!productIds.has(item.id)) {
              productIds.add(item.id);
              allProducts.push(item);
            }
          });
        }
      });

      res.json({ products: allProducts });
    } catch (err) {
      console.error('My products error:', err);
      res.status(401).json({ message: 'Invalid token or server error' });
    }
  });

  // ─────────────────────────────────────────────────────────────────────────
  // POST /api/orders/my-orders/:orderId/cancel
  // Logged-in user এর order cancel করা
  // ─────────────────────────────────────────────────────────────────────────
  router.post('/my-orders/:orderId/cancel', async (req, res) => {
    const token = req.headers.authorization?.split(' ')[1];
    if (!token) return res.status(401).json({ message: 'Token required' });

    const { orderId } = req.params;

    try {
      const decoded = require('jsonwebtoken').verify(token, process.env.JWT_SECRET);
      const customerId = decoded.id;

      // Check if order exists, belongs to the customer, and status is pending or processing
      const [orderRows] = await db.query(
        'SELECT * FROM orders WHERE order_id = ? AND customer_id = ?',
        [orderId, customerId]
      );

      if (orderRows.length === 0) {
        return res.status(404).json({ message: 'Order not found or access denied' });
      }

      const order = orderRows[0];
      const currentStatus = order.status?.toLowerCase();

      if (currentStatus !== 'pending' && currentStatus !== 'processing') {
        return res.status(400).json({ message: `Cannot cancel order with status: ${order.status}` });
      }

      // Update status to cancelled
      await db.query(
        'UPDATE orders SET status = "cancelled" WHERE order_id = ?',
        [orderId]
      );

      // Refund stock
      const itemsJson = order.items;
      let items = [];
      try {
        items = typeof itemsJson === 'string' ? JSON.parse(itemsJson) : itemsJson;
      } catch (e) {
        console.error('Failed to parse items for cancellation refund:', e);
      }

      if (Array.isArray(items)) {
        for (const item of items) {
          let pId = item.id;
          let vId = null;
          if (typeof item.id === 'string' && item.id.includes('-')) {
            const parts = item.id.split('-');
            pId = parts[0];
            vId = parts[1];
          }
          if (vId === 'base') vId = null;

          let invQuery = 'SELECT id, stock, returned_stock FROM inventory WHERE product_id = ?';
          let invParams = [pId];
          if (vId) {
            invQuery += ' AND variant_id = ?';
            invParams.push(vId);
          } else {
            invQuery += ' AND variant_id IS NULL';
          }
          
          let [invRows] = await db.query(invQuery, invParams);

          if (invRows.length === 0 && !vId) {
             [invRows] = await db.query('SELECT id, stock, returned_stock FROM inventory WHERE product_id = ? LIMIT 1', [pId]);
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
               VALUES (?, ?, 'return', ?, ?, ?)`,
              [pId, vId || null, `Order Cancelled by User ${orderId}`, item.quantity, newBalance]
            );
          }
        }
      }

      res.json({ message: 'Order cancelled successfully and stock refunded.' });
    } catch (err) {
      console.error('Cancel order error:', err);
      res.status(500).json({ message: 'Server error or invalid token' });
    }
  });

  return router;
};
