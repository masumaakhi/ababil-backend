const express = require('express');
const router = express.Router();
const { verifyAdmin } = require('../middleware/auth');

module.exports = (db) => {
  router.use(verifyAdmin);

  // GET /api/admin/dashboard/stats
  router.get('/stats', async (req, res) => {
    try {
      const { startDate, endDate } = req.query;
      
      // Fetch all products and variants to get purchase prices
      const [products] = await db.query('SELECT id, purchase_price, base_price FROM products');
      const [variants] = await db.query('SELECT id, product_id, purchase_price, price FROM product_variants');

      const productMap = {};
      products.forEach(p => {
        productMap[p.id] = {
          purchase_price: parseFloat(p.purchase_price) || 0,
          base_price: parseFloat(p.base_price) || 0
        };
      });

      const variantMap = {};
      variants.forEach(v => {
        variantMap[v.id] = {
          purchase_price: parseFloat(v.purchase_price) || 0,
          price: parseFloat(v.price) || 0
        };
      });

      // Calculate stats helper
      const calculateStats = (ordersList) => {
        let ordersCount = 0;
        let revenue = 0;
        let purchasePrice = 0;
        let profit = 0;
        let netProfit = 0;
        let deliveredCount = 0;
        let pendingCount = 0;
        let cancelledCount = 0;

        ordersList.forEach(order => {
          ordersCount++;
          const status = (order.status || '').toLowerCase();
          const total = parseFloat(order.total) || 0;

          if (status === 'delivered') {
            deliveredCount++;
          } else if (status === 'pending') {
            pendingCount++;
          } else if (status === 'cancelled') {
            cancelledCount++;
          }

          // Parse items
          let orderItems = [];
          try {
            orderItems = typeof order.items === 'string' ? JSON.parse(order.items) : (order.items || []);
          } catch (e) {}

          let orderPurchasePrice = 0;
          orderItems.forEach(item => {
            let pId = item.id;
            let vId = null;
            if (typeof item.id === 'string' && item.id.includes('-')) {
              const parts = item.id.split('-');
              pId = parts[0];
              vId = parts[1];
            }
            if (vId === 'base') vId = null;

            let itemPurchasePrice = 0;
            if (vId && variantMap[vId]) {
              itemPurchasePrice = variantMap[vId].purchase_price || productMap[pId]?.purchase_price || 0;
            } else if (pId && productMap[pId]) {
              itemPurchasePrice = productMap[pId].purchase_price || 0;
            }
            orderPurchasePrice += itemPurchasePrice * (parseInt(item.quantity) || 0);
          });

          // Exclude cancelled from financials
          if (status !== 'cancelled') {
            revenue += total;
            purchasePrice += orderPurchasePrice;
            const orderProfit = total - orderPurchasePrice;
            profit += orderProfit;

            if (status === 'delivered') {
              netProfit += orderProfit;
            }
          }
        });

        return {
          ordersCount,
          revenue,
          purchasePrice,
          profit,
          netProfit,
          delivered: deliveredCount,
          pending: pendingCount,
          cancelled: cancelledCount
        };
      };

      // Query current period orders
      let currentOrders = [];
      if (startDate && endDate) {
        [currentOrders] = await db.query(
          'SELECT total, status, items, created_at FROM orders WHERE created_at BETWEEN ? AND ?',
          [startDate, endDate]
        );
      } else {
        [currentOrders] = await db.query(
          'SELECT total, status, items, created_at FROM orders'
        );
      }

      const currentStats = calculateStats(currentOrders);

      // Query previous period orders for percentage comparison
      let prevStats = {
        ordersCount: 0,
        revenue: 0,
        purchasePrice: 0,
        profit: 0,
        netProfit: 0,
        delivered: 0,
        pending: 0,
        cancelled: 0
      };

      if (startDate && endDate) {
        const duration = new Date(endDate).getTime() - new Date(startDate).getTime();
        const prevStart = new Date(new Date(startDate).getTime() - duration).toISOString();
        const prevEnd = startDate;

        const [prevOrders] = await db.query(
          'SELECT total, status, items, created_at FROM orders WHERE created_at BETWEEN ? AND ?',
          [prevStart, prevEnd]
        );
        prevStats = calculateStats(prevOrders);
      }

      // 3. Recent orders (always last 8)
      const [recentOrders] = await db.query(`
        SELECT order_id, customer_name, total, status, created_at
        FROM orders
        ORDER BY created_at DESC
        LIMIT 8
      `);

      // 4. Generate chart data
      const generateChartData = (ordersList, start, end) => {
        const chart = [];
        const startDay = new Date(start);
        const endDay = new Date(end);
        
        let current = new Date(startDay);
        current.setHours(0,0,0,0);
        
        const diffTime = Math.abs(endDay - startDay);
        const diffDays = Math.ceil(diffTime / (1000 * 60 * 60 * 24));
        
        if (diffDays > 35) {
          let temp = new Date(startDay);
          while (temp <= endDay) {
            const monthLabel = temp.toLocaleString('en-US', { month: 'short', year: '2-digit' });
            chart.push({ day_name: monthLabel, count: 0, dateStr: temp.toISOString().substring(0, 7) });
            temp.setMonth(temp.getMonth() + 1);
          }
          
          ordersList.forEach(order => {
            const orderDate = new Date(order.created_at);
            const orderMonthStr = orderDate.toISOString().substring(0, 7);
            const slot = chart.find(c => c.dateStr === orderMonthStr);
            if (slot) slot.count++;
          });
        } else {
          while (current <= endDay) {
            const dayLabel = current.toLocaleString('en-US', { weekday: 'short' });
            chart.push({ day_name: dayLabel, count: 0, dateStr: current.toDateString() });
            current.setDate(current.getDate() + 1);
          }
          
          ordersList.forEach(order => {
            const orderDate = new Date(order.created_at);
            const slot = chart.find(c => c.dateStr === orderDate.toDateString());
            if (slot) slot.count++;
          });
        }
        
        return chart.map(c => ({ day_name: c.day_name, count: c.count }));
      };

      let chartData = [];
      if (startDate && endDate) {
        chartData = generateChartData(currentOrders, startDate, endDate);
      } else {
        const end = new Date();
        const start = new Date();
        start.setDate(end.getDate() - 6);
        chartData = generateChartData(currentOrders, start, end);
      }

      res.json({
        todayOrders: currentStats.ordersCount,
        yesterdayOrders: prevStats.ordersCount,
        todayRevenue: currentStats.revenue,
        yesterdayRevenue: prevStats.revenue,
        delivered: currentStats.delivered,
        pending: currentStats.pending,
        cancelled: currentStats.cancelled,
        purchasePrice: currentStats.purchasePrice,
        yesterdayPurchasePrice: prevStats.purchasePrice,
        profit: currentStats.profit,
        yesterdayProfit: prevStats.profit,
        netProfit: currentStats.netProfit,
        yesterdayNetProfit: prevStats.netProfit,
        recentOrders,
        chartData
      });
    } catch (err) {
      console.error("Dashboard stats error:", err);
      res.status(500).json({ message: 'Server error' });
    }
  });

  return router;
};
