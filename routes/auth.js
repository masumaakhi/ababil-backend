const express = require('express');
const bcrypt  = require('bcrypt');
const jwt     = require('jsonwebtoken');
const { createNotification } = require('../utils/notification');
const router  = express.Router();

module.exports = (db) => {

  // ─────────────────────────────────────────────────────────────────────────
  // POST /api/auth/register
  // সাধারণ রেজিস্ট্রেশন — অথবা guest account কে full account এ upgrade
  // ─────────────────────────────────────────────────────────────────────────
  router.post('/register', async (req, res) => {
    const { name, phone, email, password } = req.body;

    if (!name || (!phone && !email) || !password) {
      return res.status(400).json({ message: 'Name, password, and either email or phone are required' });
    }
    if (password.length < 6) {
      return res.status(400).json({ message: 'Password must be at least 6 characters' });
    }

    try {
      const hashedPassword = await bcrypt.hash(password, 10);

      // 1. Phone check (if provided)
      if (phone) {
        const [existingPhone] = await db.query(
          'SELECT id, account_type FROM customers WHERE phone = ?',
          [phone]
        );
        if (existingPhone.length > 0) {
          const user = existingPhone[0];
          if (user.account_type === 'guest') {
            // Guest account → Full account upgrade
            await db.query(
              'UPDATE customers SET name=?, email=?, password=?, account_type="customer" WHERE phone=?',
              [name, email || null, hashedPassword, phone]
            );
            return res.status(200).json({ message: 'Account activated successfully' });
          } else {
            return res.status(409).json({ message: 'Phone number already registered' });
          }
        }
      }

      // 2. Email check (if provided)
      if (email) {
        const [existingEmail] = await db.query(
          'SELECT id FROM customers WHERE email = ?',
          [email]
        );
        if (existingEmail.length > 0) {
          return res.status(409).json({ message: 'Email already in use' });
        }
      }

      // 3. Create new user
      await db.query(
        'INSERT INTO customers (name, phone, email, password, account_type) VALUES (?, ?, ?, ?, "customer")',
        [name, phone || null, email || null, hashedPassword]
      );
      
      await createNotification(db, 'New User Registration', `${name} just created a new customer account.`, 'auth');

      res.status(201).json({ message: 'Registration successful' });
    } catch (err) {
      console.error('Register error:', err);
      res.status(500).json({ message: 'Server error' });
    }
  });

  // ─────────────────────────────────────────────────────────────────────────
  // POST /api/auth/login
  // Email বা Phone দিয়ে লগইন
  // ─────────────────────────────────────────────────────────────────────────
  router.post('/login', async (req, res) => {
    const { identifier, password } = req.body;

    if (!identifier || !password) {
      return res.status(400).json({ message: 'Identifier and password are required' });
    }

    const isEmail = identifier.includes('@');
    const field   = isEmail ? 'email' : 'phone';

    try {
      const [rows] = await db.query(
        `SELECT * FROM customers WHERE ${field} = ? AND is_active = 1`,
        [identifier]
      );
      const user = rows[0];

      if (!user) {
        return res.status(401).json({ message: 'No account found with this ' + field });
      }

      // Guest account — password নেই, reset করতে বলো
      if (!user.password) {
        return res.status(401).json({
          message: 'This account was created as a guest. Please set your password first.',
          isGuest: true
        });
      }

      const isMatch = await bcrypt.compare(password, user.password);
      if (!isMatch) {
        return res.status(401).json({ message: 'Incorrect password' });
      }

      const token = jwt.sign(
        { id: user.id, name: user.name, email: user.email, phone: user.phone, role: 'customer' },
        process.env.JWT_SECRET,
        { expiresIn: '7d' }
      );
      
      await createNotification(db, 'User Login', `${user.name} logged into their account.`, 'auth');

      res.json({
        token,
        user: { id: user.id, name: user.name, email: user.email, phone: user.phone }
      });
    } catch (err) {
      console.error('Login error:', err);
      res.status(500).json({ message: 'Server error' });
    }
  });

  // ─────────────────────────────────────────────────────────────────────────
  // POST /api/auth/reset-password
  // Guest account activate করা / password ভুলে গেলে reset
  // ─────────────────────────────────────────────────────────────────────────
  router.post('/reset-password', async (req, res) => {
    const { phone, newPassword } = req.body;

    if (!phone || !newPassword) {
      return res.status(400).json({ message: 'Phone and new password are required' });
    }
    if (newPassword.length < 6) {
      return res.status(400).json({ message: 'Password must be at least 6 characters' });
    }

    try {
      const [rows] = await db.query(
        'SELECT id, account_type FROM customers WHERE phone = ? AND is_active = 1',
        [phone]
      );

      if (!rows[0]) {
        return res.status(404).json({ message: 'No account found with this phone number' });
      }

      const hashed = await bcrypt.hash(newPassword, 10);
      await db.query(
        'UPDATE customers SET password=?, account_type="customer" WHERE phone=?',
        [hashed, phone]
      );
      
      await createNotification(db, 'Password Reset', `Password was reset for account with phone ${phone}.`, 'auth');

      res.json({ message: 'Password set successfully. You can now log in.' });
    } catch (err) {
      console.error('Reset password error:', err);
      res.status(500).json({ message: 'Server error' });
    }
  });

  // ─────────────────────────────────────────────────────────────────────────
  // POST /api/auth/google
  // Google Login from NextAuth
  // ─────────────────────────────────────────────────────────────────────────
  router.post('/google', async (req, res) => {
    const { name, email, googleId } = req.body;

    if (!email || !googleId) {
      return res.status(400).json({ message: 'Email and Google ID are required' });
    }

    try {
      // Check if user exists by google_id or email
      let [rows] = await db.query(
        'SELECT * FROM customers WHERE google_id = ? OR email = ?',
        [googleId, email]
      );
      
      let user = rows[0];

      if (!user) {
        // Create new user for google
        const [result] = await db.query(
          'INSERT INTO customers (name, email, google_id, account_type) VALUES (?, ?, ?, "google")',
          [name || 'Google User', email, googleId]
        );
        const [newUser] = await db.query('SELECT * FROM customers WHERE id = ?', [result.insertId]);
        user = newUser[0];
        await createNotification(db, 'New User Registration', `${user.name} signed up via Google.`, 'auth');
      } else {
        // If user exists but no google_id, link them
        if (!user.google_id) {
          await db.query('UPDATE customers SET google_id = ? WHERE id = ?', [googleId, user.id]);
        }
      }

      const token = jwt.sign(
        { id: user.id, name: user.name, email: user.email, phone: user.phone, role: 'customer' },
        process.env.JWT_SECRET,
        { expiresIn: '7d' }
      );

      res.json({
        token,
        user: { id: user.id, name: user.name, email: user.email, phone: user.phone }
      });
    } catch (err) {
      console.error('Google login error:', err);
      res.status(500).json({ message: 'Server error' });
    }
  });

  // ─────────────────────────────────────────────────────────────────────────
  // GET /api/auth/me
  // Logged-in user এর নিজের info দেখা (JWT token দিয়ে)
  // ─────────────────────────────────────────────────────────────────────────
  router.get('/me', async (req, res) => {
    const token = req.headers.authorization?.split(' ')[1];
    if (!token) return res.status(401).json({ message: 'Token required' });

    try {
      const decoded = require('jsonwebtoken').verify(token, process.env.JWT_SECRET);
      
      // Fetch user with total spent
      const query = `
        SELECT 
          c.id, c.name, c.email, c.phone, c.address, c.account_type, c.created_at,
          COALESCE(SUM(o.total), 0) as total_purchased
        FROM customers c
        LEFT JOIN orders o ON c.id = o.customer_id
        WHERE c.id = ?
        GROUP BY c.id, c.name, c.email, c.phone, c.address, c.account_type, c.created_at
      `;
      const [rows] = await db.query(query, [decoded.id]);
      
      if (!rows[0]) return res.status(404).json({ message: 'User not found' });
      res.json({ user: rows[0] });
    } catch {
      res.status(401).json({ message: 'Invalid token' });
    }
  });

  // ─────────────────────────────────────────────────────────────────────────
  // PUT /api/auth/me
  // Update logged-in user info (name, phone, address)
  // ─────────────────────────────────────────────────────────────────────────
  router.put('/me', async (req, res) => {
    const token = req.headers.authorization?.split(' ')[1];
    if (!token) return res.status(401).json({ message: 'Token required' });

    try {
      const decoded = require('jsonwebtoken').verify(token, process.env.JWT_SECRET);
      const { name, phone, address } = req.body;

      if (!name) {
        return res.status(400).json({ message: 'Name is required' });
      }

      await db.query(
        'UPDATE customers SET name = ?, phone = ?, address = ? WHERE id = ?',
        [name, phone || null, address || null, decoded.id]
      );
      
      res.json({ message: 'Profile updated successfully' });
    } catch (err) {
      if (err.code === 'ER_DUP_ENTRY') {
         return res.status(409).json({ message: 'Phone number already in use by another account' });
      }
      res.status(401).json({ message: 'Invalid token or update failed' });
    }
  });

  return router;
};
