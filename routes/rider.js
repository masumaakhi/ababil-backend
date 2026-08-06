const express = require('express');
const jwt = require('jsonwebtoken');
const bcrypt = require('bcrypt');

module.exports = (db) => {
    const router = express.Router();

    const getJwtSecret = () => {
        if (!process.env.JWT_SECRET) {
            throw new Error('JWT_SECRET is required');
        }
        return process.env.JWT_SECRET;
    };

    // 1. Rider Login
    router.post('/login', async (req, res) => {
        const { phone, password } = req.body;
        try {
            const [riders] = await db.query('SELECT * FROM riders WHERE phone = ?', [phone]);
            if (riders.length === 0) {
                return res.status(401).json({ message: 'Invalid phone or password' });
            }

            const rider = riders[0];
            const storedPassword = rider.password || '';
            const isHashedPassword = storedPassword.startsWith('$2a$') || storedPassword.startsWith('$2b$') || storedPassword.startsWith('$2y$');
            const isPasswordValid = isHashedPassword
                ? await bcrypt.compare(password, storedPassword)
                : storedPassword === password;

            if (!isPasswordValid) {
                return res.status(401).json({ message: 'Invalid phone or password' });
            }

            if (!isHashedPassword) {
                const hashedPassword = await bcrypt.hash(password, 10);
                await db.query('UPDATE riders SET password = ? WHERE id = ?', [hashedPassword, rider.id]);
            }

            if (rider.status !== 'active') {
                return res.status(403).json({ message: 'Account is inactive' });
            }

            // Generate JWT
            const token = jwt.sign(
                { id: rider.id, phone: rider.phone, name: rider.name },
                getJwtSecret(),
                { expiresIn: '7d' }
            );

            res.json({
                success: true,
                token,
                rider: {
                    id: rider.id,
                    name: rider.name,
                    phone: rider.phone,
                    zone: rider.zone,
                    payment_model: rider.payment_model,
                    cash_in_hand: rider.cash_in_hand,
                    wallet_balance: rider.wallet_balance
                }
            });
        } catch (error) {
            console.error(error);
            res.status(500).json({ message: 'Login failed' });
        }
    });

    // Middleware to verify rider JWT
    const verifyRider = (req, res, next) => {
        const token = req.headers.authorization?.split(' ')[1];
        if (!token) return res.status(401).json({ message: 'Unauthorized' });

        try {
            const decoded = jwt.verify(token, getJwtSecret());
            req.rider = decoded;
            next();
        } catch (error) {
            return res.status(401).json({ message: 'Invalid token' });
        }
    };

    // 2. Get Assigned Orders
    router.get('/orders', verifyRider, async (req, res) => {
        try {
            const [orders] = await db.query(
                `SELECT o.order_id, o.created_at, o.customer_name, o.phone, o.address, o.city, o.total, o.payment_method, o.status, o.items
                 FROM orders o
                 WHERE o.rider_id = ? AND o.delivery_type = 'manual'
                 ORDER BY o.created_at DESC`,
                [req.rider.id]
            );
            res.json(orders);
        } catch (error) {
            console.error(error);
            res.status(500).json({ message: 'Failed to fetch orders' });
        }
    });

    // 3. Update Order Status (Delivered / Returned)
    router.put('/orders/:id/status', verifyRider, async (req, res) => {
        const { id } = req.params;
        const { status } = req.body;
        
        if (!['out_for_delivery', 'delivered', 'returned'].includes(status)) {
            return res.status(400).json({ message: 'Invalid status' });
        }

        const connection = await db.getConnection();
        try {
            await connection.beginTransaction();

            // Get order details to calculate financials
            const [orders] = await connection.query('SELECT * FROM orders WHERE order_id = ? AND rider_id = ? FOR UPDATE', [id, req.rider.id]);
            if (orders.length === 0) {
                await connection.rollback();
                return res.status(404).json({ message: 'Order not found or not assigned to you' });
            }

            const order = orders[0];
            if (order.status === 'delivered' || order.status === 'returned') {
                await connection.rollback();
                return res.status(400).json({ message: 'Order is already processed' });
            }

            // Update order status
            await connection.query('UPDATE orders SET status = ? WHERE order_id = ?', [status, id]);

            // Get rider details
            const [riders] = await connection.query('SELECT * FROM riders WHERE id = ? FOR UPDATE', [req.rider.id]);
            const rider = riders[0];

            if (status === 'delivered') {
                let cashUpdate = 0;
                let walletUpdate = 0;

                // Cash in hand only increases if it was Cash on Delivery
                if (order.payment_method?.toLowerCase() === 'cod') {
                    cashUpdate = parseFloat(order.total);
                }

                // Wallet balance increases if payment model is commission
                if (rider.payment_model === 'commission') {
                    walletUpdate = parseFloat(rider.per_parcel_rate);
                } else if (rider.payment_model === 'delivery_charge') {
                    walletUpdate = parseFloat(order.delivery_charge || 0);
                }

                if (cashUpdate > 0 || walletUpdate > 0) {
                    await connection.query(
                        'UPDATE riders SET cash_in_hand = cash_in_hand + ?, wallet_balance = wallet_balance + ?, total_earned = total_earned + ?, total_cod_collected = total_cod_collected + ? WHERE id = ?',
                        [cashUpdate, walletUpdate, walletUpdate, cashUpdate, rider.id]
                    );
                }
            }

            await connection.commit();
            res.json({ success: true, message: `Order marked as ${status}` });
        } catch (error) {
            await connection.rollback();
            console.error(error);
            res.status(500).json({ message: 'Failed to update order status' });
        } finally {
            connection.release();
        }
    });

    // 4. Get Rider Profile / Stats
    router.get('/profile', verifyRider, async (req, res) => {
        try {
            const [riders] = await db.query('SELECT id, name, phone, zone, payment_model, base_salary, cash_in_hand, wallet_balance, status, total_earned, total_paid, total_cod_collected, total_bonuses, total_fines FROM riders WHERE id = ?', [req.rider.id]);
            
            // Get stats
            const [stats] = await db.query(`
                SELECT 
                    SUM(CASE WHEN status = 'delivered' THEN 1 ELSE 0 END) as delivered,
                    SUM(CASE WHEN status = 'assigned_to_rider' OR status = 'out_for_delivery' THEN 1 ELSE 0 END) as pending,
                    SUM(CASE WHEN status = 'returned' THEN 1 ELSE 0 END) as returned
                FROM orders 
                WHERE rider_id = ?
            `, [req.rider.id]);

            res.json({
                rider: riders[0],
                stats: stats[0]
            });
        } catch (error) {
            console.error(error);
            res.status(500).json({ message: 'Failed to fetch profile' });
        }
    });

    return router;
};
