const express = require('express');
const bcrypt = require('bcrypt');
const { verifyAdmin } = require('../middleware/auth');

module.exports = (db) => {
    const router = express.Router();
    router.use(verifyAdmin);

    // GET riders stats
    router.get('/stats', async (req, res) => {
        try {
            const { startDate, endDate } = req.query;
            let params = [];
            let dateFilterRiders = '';
            let dateFilterOrders = '';
            let dateFilterSettlements = '';

            if (startDate && endDate) {
                dateFilterRiders = ' AND created_at BETWEEN ? AND ?';
                dateFilterOrders = ' AND updated_at BETWEEN ? AND ?';
                dateFilterSettlements = ' AND date BETWEEN ? AND ?';
                params.push(startDate, endDate);
            }

            let riderQuery = 'SELECT SUM(cash_in_hand) as total_cash_on_hand, COUNT(id) as total_rider FROM riders WHERE 1=1';
            if (dateFilterRiders) {
                riderQuery += dateFilterRiders;
            }
            
            const [riders] = await db.query(riderQuery, params);
            
            // Total delivery charge, success on delivery, return product
            let orderQuery = 'SELECT status, SUM(delivery_charge) as total_delivery_charge, COUNT(id) as total_count FROM orders WHERE rider_id IS NOT NULL';
            if (dateFilterOrders) {
                orderQuery += dateFilterOrders;
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
                }
            });

            // Total collect cash (COD orders delivered)
            let codQuery = "SELECT SUM(total) as total_cod FROM orders WHERE rider_id IS NOT NULL AND payment_method='cod' AND status='delivered'";
            if (dateFilterOrders) {
                codQuery += dateFilterOrders;
            }
            const [codStats] = await db.query(codQuery, params);
            const totalCollectCash = parseFloat(codStats[0].total_cod) || 0;

            // Total submitted cash (Settlements)
            let settleQuery = 'SELECT SUM(collected_amount) as total_submitted FROM rider_settlements WHERE 1=1';
            if (dateFilterSettlements) {
                settleQuery += dateFilterSettlements;
            }
            const [settleStats] = await db.query(settleQuery, params);
            const totalSubmittedCash = parseFloat(settleStats[0].total_submitted) || 0;

            res.json({
                totalCashOnHand: parseFloat(riders[0].total_cash_on_hand) || 0, // This is current lifetime cash in hand of riders
                totalCollectCash: totalCollectCash,
                totalSubmittedCash: totalSubmittedCash,
                totalUnsubmittedCash: totalCollectCash - totalSubmittedCash,
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
            const { startDate, endDate } = req.query;
            let dateFilterSettlements = '';
            let dateFilterOrders = '';
            let params = [];
            
            if (startDate && endDate) {
                // The frontend explicitly sends the ISO date range
                dateFilterSettlements = ' AND date BETWEEN ? AND ?';
                dateFilterOrders = ' AND updated_at BETWEEN ? AND ?';
                params.push(startDate, endDate);
            }

            const [riders] = await db.query(`
                SELECT id, name, phone, zone, payment_model, per_parcel_rate, base_salary, cash_in_hand, wallet_balance, status, created_at,
                (SELECT COUNT(id) FROM orders WHERE rider_id = riders.id AND status='delivered') as total_delivered
                FROM riders ORDER BY id DESC
            `);
            
            if (startDate && endDate) {
                const [orderStats] = await db.query(
                    `SELECT rider_id, SUM(total) as total_cod, COUNT(id) as delivered_count, SUM(delivery_charge) as total_delivery_charge
                     FROM orders
                     WHERE rider_id IS NOT NULL AND payment_method='cod' AND status='delivered' ${dateFilterOrders}
                     GROUP BY rider_id`,
                    params
                );

                const [settlementStats] = await db.query(
                    `SELECT rider_id, SUM(collected_amount) as submitted_cod, SUM(rider_commission_deducted) as paid_wallet
                     FROM rider_settlements
                     WHERE 1=1 ${dateFilterSettlements}
                     GROUP BY rider_id`,
                    params
                );

                const orderStatsByRider = new Map(orderStats.map(row => [String(row.rider_id), row]));
                const settlementStatsByRider = new Map(settlementStats.map(row => [String(row.rider_id), row]));

                for (let rider of riders) {
                    const orders = orderStatsByRider.get(String(rider.id)) || {};
                    const settlements = settlementStatsByRider.get(String(rider.id)) || {};

                    const totalCod = parseFloat(orders.total_cod) || 0;
                    const submittedCod = parseFloat(settlements.submitted_cod) || 0;
                    const paidWallet = parseFloat(settlements.paid_wallet) || 0;
                    const deliveredCount = orders.delivered_count || 0;
                    const totalDeliveryCharge = parseFloat(orders.total_delivery_charge) || 0;
                    
                    rider.time_filtered_stats = {
                        total_cod: totalCod,
                        submitted_cod: submittedCod,
                        unsubmitted_cod: totalCod - submittedCod,
                        total_earn: 0,
                        paid_wallet: paidWallet,
                        delivered_count: deliveredCount
                    };

                    if (rider.payment_model === 'salary') {
                        rider.time_filtered_stats.total_earn = parseFloat(rider.base_salary) || 0;
                    } else if (rider.payment_model === 'commission') {
                        rider.time_filtered_stats.total_earn = (parseFloat(rider.per_parcel_rate) || 0) * deliveredCount;
                    } else if (rider.payment_model === 'delivery_charge') {
                        rider.time_filtered_stats.total_earn = totalDeliveryCharge;
                    }
                }
            }

            res.json(riders);
        } catch (error) {
            console.error(error);
            res.status(500).json({ message: 'Failed to fetch riders: ' + error.message });
        }
    });

    // POST new rider
    router.post('/', async (req, res) => {
        const { name, phone, password, zone, payment_model, per_parcel_rate, base_salary, status } = req.body;
        if (!name || !phone || !password) {
            return res.status(400).json({ message: 'Name, phone, and password are required' });
        }

        try {
            const hashedPassword = await bcrypt.hash(password, 10);
            const [result] = await db.query(
                'INSERT INTO riders (name, phone, password, zone, payment_model, per_parcel_rate, base_salary, status) VALUES (?, ?, ?, ?, ?, ?, ?, ?)',
                [name, phone, hashedPassword, zone, payment_model, per_parcel_rate, base_salary || 0, status || 'active']
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
                const hashedPassword = await bcrypt.hash(password, 10);
                query += ', password=?';
                params.push(hashedPassword);
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
