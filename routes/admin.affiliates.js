const express = require('express');
const router  = express.Router();

module.exports = (db) => {

  // GET /api/admin/affiliates - Get all affiliates with their computed stats
  router.get('/', async (req, res) => {
    try {
      // Fetch affiliates
      const [affiliates] = await db.query('SELECT * FROM affiliates ORDER BY id DESC');
      
      // Fetch orders that have an affiliate code (not cancelled)
      const [orders] = await db.query(
        "SELECT affiliate_code, total, DATE_FORMAT(created_at, '%Y-%m-%d') as order_date FROM orders WHERE affiliate_code IS NOT NULL AND status != 'cancelled'"
      );

      // Get today's date in local format (YYYY-MM-DD)
      const now = new Date();
      const today = new Date(now.getTime() - (now.getTimezoneOffset() * 60000)).toISOString().split('T')[0];

      // Compute stats for each affiliate
      const enhancedAffiliates = affiliates.map(aff => {
        const affiliateOrders = orders.filter(o => o.affiliate_code === aff.reference_code);
        
        // Today's Sales
        const todayOrders = affiliateOrders.filter(o => {
           return o.order_date === today;
        });

        const todaysSalesCount = todayOrders.length;
        const todaysSalesTotal = todayOrders.reduce((sum, o) => sum + Number(o.total), 0);

        // Total Sales
        const totalSalesCount = affiliateOrders.length;
        const totalSalesTotal = affiliateOrders.reduce((sum, o) => sum + Number(o.total), 0);

        // Commission
        const totalCommissionEarned = totalSalesTotal * (Number(aff.commission_rate) / 100);
        const unpaidEarnings = totalCommissionEarned - Number(aff.paid_amount);

        return {
          ...aff,
          stats: {
            todayCount: todaysSalesCount,
            todayTotal: todaysSalesTotal,
            totalCount: totalSalesCount,
            totalTotal: totalSalesTotal,
            totalCommission: totalCommissionEarned,
            unpaidEarnings: unpaidEarnings < 0 ? 0 : unpaidEarnings
          }
        };
      });

      // Compute global stats
      const activeAffiliatesCount = affiliates.filter(a => a.status === 'active').length;
      const totalReferredSales = enhancedAffiliates.reduce((sum, a) => sum + a.stats.totalCount, 0);
      const globalRevenue = enhancedAffiliates.reduce((sum, a) => sum + a.stats.totalTotal, 0);
      const totalCommissionsPaid = enhancedAffiliates.reduce((sum, a) => sum + Number(a.paid_amount), 0);

      res.json({
        summary: {
          activeAffiliates: activeAffiliatesCount,
          totalReferredSales,
          revenueGenerated: globalRevenue,
          commissionsPaid: totalCommissionsPaid
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
    
    try {
      const [aff] = await db.query('SELECT * FROM affiliates WHERE id = ?', [id]);
      if (aff.length === 0) return res.status(404).json({ message: 'Affiliate not found' });
      
      const affiliate = aff[0];

      // Recompute unpaid earnings to know how much to add to paid_amount
      const [orders] = await db.query(
        "SELECT SUM(total) as revenue FROM orders WHERE affiliate_code = ? AND status != 'cancelled'",
        [affiliate.reference_code]
      );
      
      const revenue = Number(orders[0].revenue || 0);
      const commissionEarned = revenue * (Number(affiliate.commission_rate) / 100);
      const unpaid = commissionEarned - Number(affiliate.paid_amount);

      if (unpaid <= 0) {
        return res.status(400).json({ message: 'No unpaid earnings to pay' });
      }

      const newPaidAmount = Number(affiliate.paid_amount) + unpaid;

      await db.query('UPDATE affiliates SET paid_amount = ? WHERE id = ?', [newPaidAmount, id]);

      res.json({ message: 'Payment recorded successfully' });
    } catch (err) {
      console.error('Pay affiliate error:', err);
      res.status(500).json({ message: 'Server error' });
    }
  });

  return router;
};
