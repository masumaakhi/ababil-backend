const express = require('express');
const router = express.Router();
const { verifyAdmin } = require('../middleware/auth');

module.exports = (db) => {
  router.use(verifyAdmin);

  // GET /api/admin/dashboard/stats
  router.get('/stats', async (req, res) => {
    try {
      // 1. Today's stats
      const [todayStats] = await db.query(`
        SELECT 
          COUNT(id) as today_orders,
          COALESCE(SUM(total), 0) as today_revenue
        FROM orders
        WHERE DATE(created_at) = CURDATE()
      `);

      // Yesterday's stats (for comparison)
      const [yesterdayStats] = await db.query(`
        SELECT 
          COUNT(id) as yesterday_orders,
          COALESCE(SUM(total), 0) as yesterday_revenue
        FROM orders
        WHERE DATE(created_at) = DATE_SUB(CURDATE(), INTERVAL 1 DAY)
      `);

      // 2. Status counts
      const [statusCounts] = await db.query(`
        SELECT 
          COALESCE(SUM(CASE WHEN status = 'delivered' THEN 1 ELSE 0 END), 0) as delivered,
          COALESCE(SUM(CASE WHEN status = 'pending' THEN 1 ELSE 0 END), 0) as pending,
          COALESCE(SUM(CASE WHEN status = 'cancelled' THEN 1 ELSE 0 END), 0) as cancelled
        FROM orders
      `);

      // 3. Recent orders (last 8)
      const [recentOrders] = await db.query(`
        SELECT order_id, customer_name, total, status, created_at
        FROM orders
        ORDER BY created_at DESC
        LIMIT 8
      `);

      // 4. Daily order volumes for the last 7 days (ending today)
      const [chartData] = await db.query(`
        SELECT 
          DATE_FORMAT(d.date, '%a') as day_name,
          COALESCE(COUNT(o.id), 0) as count
        FROM (
          SELECT CURDATE() as date UNION ALL
          SELECT DATE_SUB(CURDATE(), INTERVAL 1 DAY) UNION ALL
          SELECT DATE_SUB(CURDATE(), INTERVAL 2 DAY) UNION ALL
          SELECT DATE_SUB(CURDATE(), INTERVAL 3 DAY) UNION ALL
          SELECT DATE_SUB(CURDATE(), INTERVAL 4 DAY) UNION ALL
          SELECT DATE_SUB(CURDATE(), INTERVAL 5 DAY) UNION ALL
          SELECT DATE_SUB(CURDATE(), INTERVAL 6 DAY)
        ) d
        LEFT JOIN orders o ON DATE(o.created_at) = d.date
        GROUP BY d.date
        ORDER BY d.date ASC
      `);

      const stats = {
        todayOrders: todayStats[0].today_orders,
        todayRevenue: parseFloat(todayStats[0].today_revenue),
        yesterdayOrders: yesterdayStats[0].yesterday_orders,
        yesterdayRevenue: parseFloat(yesterdayStats[0].yesterday_revenue),
        delivered: parseInt(statusCounts[0].delivered),
        pending: parseInt(statusCounts[0].pending),
        cancelled: parseInt(statusCounts[0].cancelled),
        recentOrders,
        chartData
      };

      res.json(stats);
    } catch (err) {
      console.error("Dashboard stats error:", err);
      res.status(500).json({ message: 'Server error' });
    }
  });

  return router;
};
