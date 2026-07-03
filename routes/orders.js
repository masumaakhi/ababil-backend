const express = require('express');
const router  = express.Router();

module.exports = (db) => {

  // ─────────────────────────────────────────────────────────────────────────
  // POST /api/orders/guest
  // Guest order place করা + auto account creation
  // ─────────────────────────────────────────────────────────────────────────
  router.post('/guest', async (req, res) => {
    const {
      name, phone, email,
      address, city,
      items, total,
      paymentMethod, affiliateCode
    } = req.body;

    // Validation
    if (!name || !phone || !address || !items || !total) {
      return res.status(400).json({ message: 'Name, phone, address, items and total are required' });
    }

    const orderId = 'AB-' + Math.floor(100000 + Math.random() * 900000);
    let customerId  = null;
    let autoCreated = false;

    try {
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
        // Name আপডেট করো (guest ছিল)
        if (existingCustomer.account_type === 'guest') {
          await db.query('UPDATE customers SET name=? WHERE id=?', [name, customerId]);
        }
      } else {
        // নতুন guest account তৈরি
        const [result] = await db.query(
          'INSERT INTO customers (name, phone, email, account_type) VALUES (?, ?, ?, "guest")',
          [name, phone, email || null]
        );
        customerId  = result.insertId;
        autoCreated = true;
      }

      // ── Order save ──
      await db.query(
        `INSERT INTO orders
          (order_id, customer_id, customer_name, phone, email, address, city,
           items, total, payment_method, affiliate_code)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
        [
          orderId,
          customerId,
          name,
          phone,
          email || null,
          address,
          city || 'Dhaka',
          JSON.stringify(items),
          total,
          paymentMethod || 'cod',
          affiliateCode || null
        ]
      );

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

  return router;
};
