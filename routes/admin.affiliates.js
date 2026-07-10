const express = require('express');
const router  = express.Router();

module.exports = (db) => {

  // GET /api/admin/affiliates - Get all affiliates with their computed stats
  router.get('/', async (req, res) => {
    try {
      const { startDate, endDate } = req.query;

      // Fetch affiliates
      const [affiliates] = await db.query('SELECT * FROM affiliates ORDER BY id DESC');
      
      // Fetch ALL orders that have an affiliate code (not cancelled)
      const [allOrders] = await db.query(
        "SELECT affiliate_code, total, created_at as order_datetime, DATE_FORMAT(created_at, '%Y-%m-%d') as order_date FROM orders WHERE affiliate_code IS NOT NULL AND status != 'cancelled'"
      );

      // Fetch ALL payouts
      const [allPayouts] = await db.query('SELECT * FROM affiliate_payouts');

      let periodOrders = allOrders;
      let periodPayouts = allPayouts;
      if (startDate && endDate) {
        const start = new Date(startDate).getTime();
        const end = new Date(endDate).getTime();
        periodOrders = allOrders.filter(o => {
           const time = new Date(o.order_datetime).getTime();
           return time >= start && time <= end;
        });
        periodPayouts = allPayouts.filter(p => {
           const time = new Date(p.created_at).getTime();
           return time >= start && time <= end;
        });
      }

      // Get today's date in local format (YYYY-MM-DD)
      const now = new Date();
      const today = new Date(now.getTime() - (now.getTimezoneOffset() * 60000)).toISOString().split('T')[0];

      // Compute stats for each affiliate
      const enhancedAffiliates = affiliates.map(aff => {
        const lifetimeAffiliateOrders = allOrders.filter(o => o.affiliate_code === aff.reference_code);
        const affiliateOrders = periodOrders.filter(o => o.affiliate_code === aff.reference_code);
        
        // Today's Sales
        const todayOrders = affiliateOrders.filter(o => o.order_date === today);

        const todaysSalesCount = todayOrders.length;
        const todaysSalesTotal = todayOrders.reduce((sum, o) => sum + Number(o.total), 0);
        const todayCommission = todaysSalesTotal * (Number(aff.commission_rate) / 100);

        // Total Sales (In Period)
        const totalSalesCount = affiliateOrders.length;
        const totalSalesTotal = affiliateOrders.reduce((sum, o) => sum + Number(o.total), 0);
        const totalCommissionEarned = totalSalesTotal * (Number(aff.commission_rate) / 100);

        // Paid & Due (In Period)
        const affiliatePayouts = periodPayouts.filter(p => p.affiliate_id === aff.id);
        const paidEarnings = affiliatePayouts.reduce((sum, p) => sum + Number(p.amount), 0);
        const unpaidEarnings = totalCommissionEarned - paidEarnings;

        // Last Sale Date (Lifetime)
        let lastSale = null;
        if (lifetimeAffiliateOrders.length > 0) {
           const sortedDates = lifetimeAffiliateOrders.map(o => new Date(o.order_datetime)).sort((a, b) => b - a);
           lastSale = sortedDates[0];
        }

        return {
          ...aff,
          joined_date: aff.created_at,
          last_sale: lastSale,
          stats: {
            todayCount: todaysSalesCount,
            todayTotal: todaysSalesTotal,
            totalCount: totalSalesCount,
            totalTotal: totalSalesTotal,
            todayCommission: todayCommission,
            totalCommission: totalCommissionEarned,
            paidEarnings: paidEarnings,
            unpaidEarnings: unpaidEarnings
          }
        };
      });

      // Compute global stats
      const activeAffiliatesCount = affiliates.filter(a => a.status === 'active').length;
      const totalReferredSales = enhancedAffiliates.reduce((sum, a) => sum + a.stats.totalCount, 0);
      const globalRevenue = enhancedAffiliates.reduce((sum, a) => sum + a.stats.totalTotal, 0);
      const totalCommissionsPaid = enhancedAffiliates.reduce((sum, a) => sum + a.stats.paidEarnings, 0);
      const totalCommissionsEarned = enhancedAffiliates.reduce((sum, a) => sum + a.stats.totalCommission, 0);
      const totalDueCommissions = enhancedAffiliates.reduce((sum, a) => sum + a.stats.unpaidEarnings, 0);

      res.json({
        summary: {
          activeAffiliates: activeAffiliatesCount,
          totalReferredSales,
          revenueGenerated: globalRevenue,
          totalCommission: totalCommissionsEarned,
          commissionsPaid: totalCommissionsPaid,
          dueCommission: totalDueCommissions
        },
        affiliates: enhancedAffiliates
      });

    } catch (err) {
      console.error('Fetch affiliates error:', err);
      res.status(500).json({ message: 'Server error' });
    }
  });

  // POST /api/admin/affiliates - Create new affiliate
  router.post('/', async (req, res) => {
    const { name, referenceCode, commissionRate } = req.body;
    
    if (!name || !referenceCode) {
      return res.status(400).json({ message: 'Name and reference code are required' });
    }

    try {
      const [existing] = await db.query('SELECT id FROM affiliates WHERE reference_code = ?', [referenceCode]);
      if (existing.length > 0) {
        return res.status(400).json({ message: 'Reference code already exists' });
      }

      await db.query(
        'INSERT INTO affiliates (name, reference_code, commission_rate) VALUES (?, ?, ?)',
        [name, referenceCode, commissionRate || 5.00]
      );

      res.status(201).json({ message: 'Affiliate created successfully' });
    } catch (err) {
      console.error('Create affiliate error:', err);
      res.status(500).json({ message: 'Server error' });
    }
  });

  // PUT /api/admin/affiliates/:id/pay - Pay unpaid earnings
  router.put('/:id/pay', async (req, res) => {
    const { id } = req.params;
    const { amount, startDate, endDate } = req.body;
    
    if (!amount || isNaN(amount) || amount <= 0) {
       return res.status(400).json({ message: 'Valid amount is required' });
    }

    try {
      const [aff] = await db.query('SELECT * FROM affiliates WHERE id = ?', [id]);
      if (aff.length === 0) return res.status(404).json({ message: 'Affiliate not found' });
      
      let period_start = null;
      let period_end = null;
      if (startDate && endDate) {
         period_start = new Date(startDate);
         period_end = new Date(endDate);
      }

      await db.query(
         'INSERT INTO affiliate_payouts (affiliate_id, amount, period_start, period_end) VALUES (?, ?, ?, ?)',
         [id, amount, period_start, period_end]
      );

      res.json({ message: 'Payment recorded successfully' });
    } catch (err) {
      console.error('Pay affiliate error:', err);
      res.status(500).json({ message: 'Server error' });
    }
  });
  // PUT /api/admin/affiliates/:id - Edit affiliate
  router.put('/:id', async (req, res) => {
    const { id } = req.params;
    const { name, commissionRate, status } = req.body;
    
    if (!name || commissionRate === undefined) {
      return res.status(400).json({ message: 'Name and commission rate are required' });
    }

    try {
      const [existing] = await db.query('SELECT id FROM affiliates WHERE id = ?', [id]);
      if (existing.length === 0) {
        return res.status(404).json({ message: 'Affiliate not found' });
      }

      await db.query(
        'UPDATE affiliates SET name = ?, commission_rate = ?, status = ? WHERE id = ?',
        [name, commissionRate, status || 'active', id]
      );

      res.json({ message: 'Affiliate updated successfully' });
    } catch (err) {
      console.error('Update affiliate error:', err);
      res.status(500).json({ message: 'Server error' });
    }
  });

  return router;
};
