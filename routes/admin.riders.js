const express = require('express');

module.exports = (db) => {
    const router = express.Router();
    // GET riders stats
    router.get('/stats', async (req, res) => {
        try {
            const { startDate, endDate } = req.query;
            let dateFilter = '';
            let params = [];

            if (startDate && endDate) {
                dateFilter = ' AND created_at BETWEEN ? AND ?';
                params.push(startDate, endDate);
            }

            const [riders] = await db.query('SELECT SUM(cash_in_hand) as total_cash_on_hand, COUNT(id) as total_rider FROM riders');
            
            // Total delivery charge, success on delivery, return product
            // Assuming we look at `orders` table where status='delivered' or 'returned' and rider_id IS NOT NULL
            let orderQuery = 'SELECT status, SUM(delivery_charge) as total_delivery_charge, COUNT(id) as total_count FROM orders WHERE rider_id IS NOT NULL';
            if (dateFilter) {
                orderQuery += dateFilter;
            }
            orderQuery += ' GROUP BY status';

            const [orderStats] = await db.query(orderQuery, params);

            let successOnDelivery = 0;
            let returnProduct = 0;
            let totalDeliveryCharge = 0;

            orderStats.forEach(stat => {
                if (stat.status === 'delivered') {
                    successOnDelivery += stat.total_count;
                    totalDeliveryCharge += parseFloat(stat.total_delivery_charge) || 0;
                } else if (stat.status === 'returned' || stat.status === 'returned_to_seller') {
                    returnProduct += stat.total_count;
                    // Delivery charge might be counted or not for returns, usually only delivered.
                    // But if it's there we can add it, or assume only delivered gives delivery charge.
                    // Let's add it to total delivery charge if we want to show all delivery charges collected or incurred.
                    // Actually, delivery charge is usually collected on success. Let's stick to what's collected on delivered.
                }
            });

            res.json({
                totalCashOnHand: parseFloat(riders[0].total_cash_on_hand) || 0,
                totalRider: riders[0].total_rider || 0,
                totalDeliveryCharge: totalDeliveryCharge,
                successOnDelivery: successOnDelivery,
                returnProduct: returnProduct
            });
        } catch (error) {
            console.error(error);
            res.status(500).json({ message: 'Failed to fetch rider stats' });
        }
    });

    // GET all riders
    router.get('/', async (req, res) => {
        try {
            const [riders] = await db.query('SELECT id, name, phone, zone, payment_model, per_parcel_rate, base_salary, cash_in_hand, wallet_balance, status, created_at FROM riders ORDER BY id DESC');
            res.json(riders);
        } catch (error) {
            console.error(error);
            res.status(500).json({ message: 'Failed to fetch riders' });
        }
    });

    // POST new rider
    router.post('/', async (req, res) => {
        const { name, phone, password, zone, payment_model, per_parcel_rate, base_salary, status } = req.body;
        try {
            const [result] = await db.query(
                'INSERT INTO riders (name, phone, password, zone, payment_model, per_parcel_rate, base_salary, status) VALUES (?, ?, ?, ?, ?, ?, ?, ?)',
                [name, phone, password, zone, payment_model, per_parcel_rate, base_salary || 0, status || 'active']
            );
            res.json({ success: true, id: result.insertId });
        } catch (error) {
            console.error(error);
            if (error.code === 'ER_DUP_ENTRY') {
                res.status(400).json({ message: 'Phone number already exists' });
            } else {
                res.status(500).json({ message: 'Failed to create rider' });
            }
        }
    });

    // PUT update rider
    router.put('/:id', async (req, res) => {
        const { id } = req.params;
        const { name, phone, password, zone, payment_model, per_parcel_rate, base_salary, status } = req.body;
        try {
            let query = 'UPDATE riders SET name=?, phone=?, zone=?, payment_model=?, per_parcel_rate=?, base_salary=?, status=?';
            let params = [name, phone, zone, payment_model, per_parcel_rate, base_salary || 0, status];
            
            if (password) {
                query += ', password=?';
                params.push(password);
            }
            
            query += ' WHERE id=?';
            params.push(id);

            await db.query(query, params);
            res.json({ success: true });
        } catch (error) {
            console.error(error);
            if (error.code === 'ER_DUP_ENTRY') {
                res.status(400).json({ message: 'Phone number already exists' });
            } else {
                res.status(500).json({ message: 'Failed to update rider' });
            }
        }
    });

    // DELETE rider
    router.delete('/:id', async (req, res) => {
        const { id } = req.params;
        try {
            await db.query('DELETE FROM riders WHERE id=?', [id]);
            res.json({ success: true });
        } catch (error) {
            console.error(error);
            if (error.code === 'ER_ROW_IS_REFERENCED_2') {
                res.status(400).json({ message: 'Cannot delete rider because they have associated orders or settlements.' });
            } else {
                res.status(500).json({ message: 'Failed to delete rider' });
            }
        }
    });
    // Fetch Settlement History
    router.get('/:id/settlements', async (req, res) => {
        const { id } = req.params;
        try {
            const [settlements] = await db.query(
                'SELECT * FROM rider_settlements WHERE rider_id = ? ORDER BY date DESC',
                [id]
            );
            res.json(settlements);
        } catch (error) {
            console.error(error);
            res.status(500).json({ message: 'Failed to fetch settlements' });
        }
    });

    // Create a new Settlement (Admin receives cash from Rider)
    router.post('/:id/settle', async (req, res) => {
        const { id } = req.params;
        const { collected_amount, rider_commission_deducted, net_deposited } = req.body;
        
        if (!collected_amount || collected_amount <= 0) {
            return res.status(400).json({ message: 'Invalid collected amount' });
        }

        const connection = await db.getConnection();
        try {
            await connection.beginTransaction();

            // Verify rider has enough cash
            const [riders] = await connection.query('SELECT cash_in_hand FROM riders WHERE id = ? FOR UPDATE', [id]);
            if (riders.length === 0) {
                await connection.rollback();
                return res.status(404).json({ message: 'Rider not found' });
            }

            const currentCash = parseFloat(riders[0].cash_in_hand);
            if (parseFloat(collected_amount) > currentCash) {
                await connection.rollback();
                return res.status(400).json({ message: 'Collected amount cannot exceed rider cash in hand' });
            }

            // Insert settlement record
            await connection.query(
                'INSERT INTO rider_settlements (rider_id, collected_amount, rider_commission_deducted, net_deposited, admin_id) VALUES (?, ?, ?, ?, ?)',
                [id, collected_amount, rider_commission_deducted || 0, net_deposited || collected_amount, req.admin?.id || null]
            );

            // Deduct cash from rider (and optionally deduct commission from wallet if they chose to settle from wallet)
            const walletDeduction = parseFloat(rider_commission_deducted || 0);
            
            await connection.query(
                'UPDATE riders SET cash_in_hand = cash_in_hand - ?, wallet_balance = wallet_balance - ?, total_paid = total_paid + ? WHERE id = ?',
                [collected_amount, walletDeduction, walletDeduction, id]
            );

            await connection.commit();
            res.json({ success: true, message: 'Settlement processed successfully' });
        } catch (error) {
            await connection.rollback();
            console.error(error);
            res.status(500).json({ message: 'Failed to process settlement' });
        } finally {
            connection.release();
        }
    });

    // Adjust rider balance (Bonus or Fine)
    router.post('/:id/adjust', async (req, res) => {
        const { id } = req.params;
        const { type, amount, reason } = req.body;
        
        if (!['bonus', 'fine'].includes(type) || !amount || amount <= 0) {
            return res.status(400).json({ message: 'Invalid adjustment data' });
        }

        try {
            if (type === 'bonus') {
                await db.query(
                    'UPDATE riders SET wallet_balance = wallet_balance + ?, total_earned = total_earned + ?, total_bonuses = total_bonuses + ? WHERE id = ?',
                    [amount, amount, amount, id]
                );
            } else if (type === 'fine') {
                await db.query(
                    'UPDATE riders SET wallet_balance = wallet_balance - ?, total_fines = total_fines + ? WHERE id = ?',
                    [amount, amount, id]
                );
            }
            res.json({ success: true, message: `Rider ${type} applied successfully` });
        } catch (error) {
            console.error(error);
            res.status(500).json({ message: 'Failed to process adjustment' });
        }
    });

    return router;
};
