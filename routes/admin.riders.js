const express = require('express');

module.exports = (db) => {
    const router = express.Router();

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
