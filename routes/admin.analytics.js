const express = require('express');
const router = express.Router();
const { verifyAdmin } = require('../middleware/auth');

module.exports = (db) => {
  // All routes are protected by verifyAdmin
  router.use(verifyAdmin);

  // 1. Dashboard Cards & Basic Stats
  router.get('/dashboard', async (req, res) => {
    try {
      const [totalVisitors] = await db.query('SELECT COUNT(DISTINCT session_id) as total FROM analytics_visitors');
      const [todayVisitors] = await db.query('SELECT COUNT(DISTINCT session_id) as total FROM analytics_visitors WHERE DATE(session_start) = CURDATE()');
      const [totalPageViews] = await db.query('SELECT COUNT(id) as total FROM analytics_page_views');
      
      // Active in last 10 minutes
      const [activeUsers] = await db.query(`
        SELECT COUNT(DISTINCT session_id) as total 
        FROM analytics_visitors 
        WHERE session_end >= DATE_SUB(NOW(), INTERVAL 10 MINUTE)
      `);

      // Bounce rate: sessions with only 1 page view (is_bounce = 1)
      const [bounceData] = await db.query(`
        SELECT 
          (SELECT COUNT(*) FROM analytics_visitors WHERE is_bounce = 1) / 
          (SELECT COUNT(*) FROM analytics_visitors) * 100 as bounce_rate
      `);

      res.json({
        totalVisitors: totalVisitors[0]?.total || 0,
        todayVisitors: todayVisitors[0]?.total || 0,
        onlineUsers: activeUsers[0]?.total || 0,
        totalPageViews: totalPageViews[0]?.total || 0,
        bounceRate: bounceData[0]?.bounce_rate ? parseFloat(bounceData[0].bounce_rate).toFixed(2) : 0,
      });
    } catch (error) {
      console.error(error);
      res.status(500).json({ error: 'Failed to fetch dashboard data' });
    }
  });

  // 2. Live Visitors
  router.get('/live', async (req, res) => {
    try {
      const [liveSessions] = await db.query(`
        SELECT v.session_id, v.ip_address, v.browser, v.os, v.device_type, v.country, v.city, v.last_page, v.session_start,
               c.name as customer_name
        FROM analytics_visitors v
        LEFT JOIN customers c ON v.customer_id = c.id
        WHERE v.session_end >= DATE_SUB(NOW(), INTERVAL 10 MINUTE)
        ORDER BY v.session_end DESC
      `);
      res.json(liveSessions);
    } catch (error) {
      res.status(500).json({ error: 'Failed to fetch live visitors' });
    }
  });

  // 3. Visitors Trend (Last 30 days)
  router.get('/visitors-trend', async (req, res) => {
    try {
      const [trend] = await db.query(`
        SELECT DATE(session_start) as date, COUNT(DISTINCT session_id) as visitors
        FROM analytics_visitors
        WHERE session_start >= DATE_SUB(CURDATE(), INTERVAL 30 DAY)
        GROUP BY DATE(session_start)
        ORDER BY date ASC
      `);
      res.json(trend);
    } catch (error) {
      res.status(500).json({ error: 'Failed to fetch visitors trend' });
    }
  });

  // 4. Traffic Sources
  router.get('/traffic-sources', async (req, res) => {
    try {
      const [sources] = await db.query(`
        SELECT traffic_source as name, COUNT(DISTINCT session_id) as value
        FROM analytics_visitors
        GROUP BY traffic_source
        ORDER BY value DESC
      `);
      res.json(sources);
    } catch (error) {
      res.status(500).json({ error: 'Failed to fetch traffic sources' });
    }
  });

  // 5. Device & Browser Stats
  router.get('/devices', async (req, res) => {
    try {
      const [devices] = await db.query(`
        SELECT device_type as name, COUNT(DISTINCT session_id) as value
        FROM analytics_visitors
        GROUP BY device_type
      `);
      const [browsers] = await db.query(`
        SELECT browser as name, COUNT(DISTINCT session_id) as value
        FROM analytics_visitors
        GROUP BY browser
        ORDER BY value DESC
        LIMIT 5
      `);
      const [os] = await db.query(`
        SELECT os as name, COUNT(DISTINCT session_id) as value
        FROM analytics_visitors
        GROUP BY os
        ORDER BY value DESC
        LIMIT 5
      `);
      res.json({ devices, browsers, os });
    } catch (error) {
      res.status(500).json({ error: 'Failed to fetch device stats' });
    }
  });

  // 6. Most Viewed Pages
  router.get('/pages', async (req, res) => {
    try {
      const [pages] = await db.query(`
        SELECT page_url, COUNT(*) as views, AVG(time_spent) as avg_time
        FROM analytics_page_views
        GROUP BY page_url
        ORDER BY views DESC
        LIMIT 20
      `);
      res.json(pages);
    } catch (error) {
      res.status(500).json({ error: 'Failed to fetch page stats' });
    }
  });

  // 7. Settings
  router.get('/settings', async (req, res) => {
    try {
      const [settings] = await db.query('SELECT * FROM analytics_settings LIMIT 1');
      res.json(settings[0] || {});
    } catch (error) {
      res.status(500).json({ error: 'Failed to fetch settings' });
    }
  });

  router.put('/settings', async (req, res) => {
    const { tracking_enabled, heatmaps_enabled, recordings_enabled, retention_days, ga4_id, clarity_id } = req.body;
    try {
      const [existing] = await db.query('SELECT id FROM analytics_settings LIMIT 1');
      if (existing.length === 0) {
        await db.execute('INSERT INTO analytics_settings (tracking_enabled, heatmaps_enabled, recordings_enabled, retention_days, ga4_id, clarity_id) VALUES (?, ?, ?, ?, ?, ?)', 
          [tracking_enabled?1:0, heatmaps_enabled?1:0, recordings_enabled?1:0, retention_days, ga4_id, clarity_id]);
      } else {
        await db.execute('UPDATE analytics_settings SET tracking_enabled=?, heatmaps_enabled=?, recordings_enabled=?, retention_days=?, ga4_id=?, clarity_id=? WHERE id = ?', 
          [tracking_enabled?1:0, heatmaps_enabled?1:0, recordings_enabled?1:0, retention_days, ga4_id, clarity_id, existing[0].id]);
      }
      res.json({ success: true });
    } catch (error) {
      res.status(500).json({ error: 'Failed to update settings' });
    }
  });

  // ── AUDIENCE GROUP ENDPOINTS ─────────────────────────────────────────────

  // 1. Visitor Analytics
  router.get('/audience/visitors', async (req, res) => {
    try {
      const [visitors] = await db.query(`
        SELECT session_id, ip_address, country, city, device_type, browser, os, traffic_source, session_start, session_end, is_bounce
        FROM analytics_visitors
        ORDER BY session_start DESC
        LIMIT 50
      `);
      
      const [stats] = await db.query(`
        SELECT 
          COUNT(DISTINCT session_id) as total_visitors,
          SUM(CASE WHEN is_bounce = 1 THEN 1 ELSE 0 END) / COUNT(DISTINCT session_id) * 100 as bounce_rate
        FROM analytics_visitors
      `);

      res.json({ visitors, stats: stats[0] });
    } catch (error) {
      res.status(500).json({ error: 'Failed to fetch visitors' });
    }
  });

  // 2. Traffic Sources
  router.get('/audience/traffic', async (req, res) => {
    try {
      const [sources] = await db.query(`
        SELECT traffic_source, COUNT(*) as count 
        FROM analytics_visitors 
        GROUP BY traffic_source 
        ORDER BY count DESC
      `);
      
      const [referrers] = await db.query(`
        SELECT referrer, COUNT(*) as count 
        FROM analytics_visitors 
        WHERE referrer IS NOT NULL AND referrer != '' 
        GROUP BY referrer 
        ORDER BY count DESC
        LIMIT 10
      `);

      res.json({ sources, referrers });
    } catch (error) {
      res.status(500).json({ error: 'Failed to fetch traffic sources' });
    }
  });

  // 3. Devices & Browsers
  router.get('/audience/devices', async (req, res) => {
    try {
      const [devices] = await db.query('SELECT device_type, COUNT(*) as count FROM analytics_visitors GROUP BY device_type');
      const [browsers] = await db.query('SELECT browser, COUNT(*) as count FROM analytics_visitors GROUP BY browser');
      const [os] = await db.query('SELECT os, COUNT(*) as count FROM analytics_visitors GROUP BY os');
      const [resolutions] = await db.query('SELECT screen_resolution, COUNT(*) as count FROM analytics_visitors GROUP BY screen_resolution');

      res.json({ devices, browsers, os, resolutions });
    } catch (error) {
      res.status(500).json({ error: 'Failed to fetch device stats' });
    }
  });

  // 4. Geo / Locations
  router.get('/audience/geo', async (req, res) => {
    try {
      const [countries] = await db.query('SELECT country, COUNT(*) as count FROM analytics_visitors WHERE country IS NOT NULL GROUP BY country ORDER BY count DESC');
      const [cities] = await db.query('SELECT city, country, COUNT(*) as count FROM analytics_visitors WHERE city IS NOT NULL GROUP BY city, country ORDER BY count DESC');

      res.json({ countries, cities });
    } catch (error) {
      res.status(500).json({ error: 'Failed to fetch geo stats' });
    }
  });

  // ── BEHAVIOR GROUP ENDPOINTS ─────────────────────────────────────────────

  router.get('/behavior/pages', async (req, res) => {
    try {
      const [pages] = await db.query(`
        SELECT page_url, page_title, COUNT(*) as views, AVG(time_spent) as avg_time
        FROM analytics_page_views
        GROUP BY page_url, page_title
        ORDER BY views DESC
        LIMIT 20
      `);
      res.json(pages);
    } catch (error) {
      res.status(500).json({ error: 'Failed to fetch page stats' });
    }
  });

  router.get('/behavior/events', async (req, res) => {
    try {
      const [events] = await db.query(`
        SELECT event_type, COUNT(*) as count
        FROM analytics_events
        GROUP BY event_type
        ORDER BY count DESC
      `);
      res.json(events);
    } catch (error) {
      res.status(500).json({ error: 'Failed to fetch events' });
    }
  });

  router.get('/behavior/journey', async (req, res) => {
    try {
      const [journeys] = await db.query(`
        SELECT 
          session_id, 
          GROUP_CONCAT(page_url ORDER BY created_at ASC SEPARATOR ' ➜ ') as flow,
          COUNT(page_url) as steps,
          MAX(created_at) as last_activity
        FROM analytics_page_views
        GROUP BY session_id
        ORDER BY last_activity DESC
        LIMIT 50
      `);
      res.json(journeys);
    } catch (error) {
      res.status(500).json({ error: 'Failed to fetch journey data' });
    }
  });

  // ── HEATMAPS ENDPOINTS ───────────────────────────────────────────────────

  router.get('/behavior/heatmaps/pages', async (req, res) => {
    try {
      const [pages] = await db.query(`
        SELECT page_url, COUNT(*) as click_count
        FROM analytics_heatmaps
        WHERE click_x IS NOT NULL
        GROUP BY page_url
        ORDER BY click_count DESC
        LIMIT 50
      `);
      res.json(pages);
    } catch (error) {
      console.error(error);
      res.status(500).json({ error: 'Failed to fetch heatmap pages' });
    }
  });

  router.get('/behavior/heatmaps/data', async (req, res) => {
    try {
      const { url } = req.query;
      if (!url) return res.status(400).json({ error: 'URL is required' });

      const [clicks] = await db.query(`
        SELECT click_x, click_y, viewport_width, viewport_height
        FROM analytics_heatmaps
        WHERE page_url = ? AND click_x IS NOT NULL
        LIMIT 3000
      `, [url]);
      
      res.json(clicks);
    } catch (error) {
      console.error(error);
      res.status(500).json({ error: 'Failed to fetch heatmap data' });
    }
  });

  // ── SESSION RECORDINGS / TIMELINES ───────────────────────────────────────

  router.get('/behavior/recordings/sessions', async (req, res) => {
    try {
      const [sessions] = await db.query(`
        SELECT session_id, ip_address, device_type, country, city, entry_page, created_at, session_end,
          TIMESTAMPDIFF(SECOND, created_at, session_end) as duration_seconds
        FROM analytics_visitors
        ORDER BY created_at DESC
        LIMIT 50
      `);
      res.json(sessions);
    } catch (error) {
      console.error(error);
      res.status(500).json({ error: 'Failed to fetch sessions' });
    }
  });

  router.get('/behavior/recordings/timeline/:sessionId', async (req, res) => {
    try {
      const { sessionId } = req.params;
      
      // Fetch Page Views
      const [pageViews] = await db.query(`
        SELECT 'page_view' as type, page_url, page_title, time_spent as data, created_at
        FROM analytics_page_views WHERE session_id = ?
      `, [sessionId]);

      // Fetch Events
      const [events] = await db.query(`
        SELECT 'event' as type, event_type as title, event_data as data, created_at
        FROM analytics_events WHERE session_id = ?
      `, [sessionId]);

      // Combine and Sort
      const timeline = [...pageViews, ...events].sort((a, b) => new Date(a.created_at).getTime() - new Date(b.created_at).getTime());
      
      res.json(timeline);
    } catch (error) {
      console.error(error);
      res.status(500).json({ error: 'Failed to fetch timeline' });
    }
  });

  // ── CONVERSIONS GROUP ENDPOINTS ──────────────────────────────────────────

  router.get('/conversions/funnel', async (req, res) => {
    try {
      const [visits] = await db.query('SELECT COUNT(DISTINCT session_id) as count FROM analytics_visitors');
      const [carts] = await db.query('SELECT COUNT(DISTINCT session_id) as count FROM analytics_events WHERE event_type="add_to_cart"');
      const [purchases] = await db.query('SELECT COUNT(DISTINCT session_id) as count FROM analytics_events WHERE event_type="purchase"');
      
      res.json({
        visits: visits[0].count,
        carts: carts[0].count,
        purchases: purchases[0].count
      });
    } catch (error) {
      res.status(500).json({ error: 'Failed to fetch funnel stats' });
    }
  });

  router.get('/conversions/search', async (req, res) => {
    try {
      const [searches] = await db.query(`
        SELECT JSON_UNQUOTE(JSON_EXTRACT(event_data, '$.query')) as query, COUNT(*) as count
        FROM analytics_events
        WHERE event_type = 'search_query'
        GROUP BY query
        ORDER BY count DESC
        LIMIT 20
      `);
      res.json(searches);
    } catch (error) {
      res.status(500).json({ error: 'Failed to fetch search stats' });
    }
  });

  router.get('/conversions/products', async (req, res) => {
    try {
      const [products] = await db.query(`
        SELECT 
          jt.product_id as id,
          MAX(jt.titleEn) as name,
          MAX(jt.price) as price,
          COUNT(o.id) as times_sold,
          COALESCE(SUM(jt.quantity), 0) as total_quantity_sold,
          COALESCE(SUM(jt.price * jt.quantity), 0) as total_revenue
        FROM orders o
        JOIN JSON_TABLE(
          o.items,
          '$[*]' COLUMNS (
            product_id VARCHAR(50) PATH '$.id',
            titleEn VARCHAR(255) PATH '$.titleEn',
            price DECIMAL(10,2) PATH '$.price',
            quantity INT PATH '$.quantity'
          )
        ) as jt
        GROUP BY jt.product_id
        ORDER BY total_quantity_sold DESC
        LIMIT 20
      `);
      res.json(products);
    } catch (error) {
      console.error(error);
      res.status(500).json({ error: 'Failed to fetch product analytics' });
    }
  });

  router.get('/conversions/customers', async (req, res) => {
    try {
      const [customers] = await db.query(`
        SELECT 
          c.id, 
          c.name as customer_name, 
          c.email,
          COUNT(o.id) as total_orders,
          COALESCE(SUM(o.total), 0) as total_spent
        FROM customers c
        JOIN orders o ON c.id = o.customer_id
        GROUP BY c.id
        ORDER BY total_spent DESC
        LIMIT 20
      `);
      res.json(customers);
    } catch (error) {
      console.error(error);
      res.status(500).json({ error: 'Failed to fetch customer analytics' });
    }
  });

  // ── SYSTEM GROUP ENDPOINTS ─────────────────────────────────────────────

  router.get('/system/errors', async (req, res) => {
    try {
      const [errors] = await db.query(`
        SELECT JSON_UNQUOTE(JSON_EXTRACT(event_data, '$.message')) as message, 
               JSON_UNQUOTE(JSON_EXTRACT(event_data, '$.source')) as source, 
               COUNT(*) as count, MAX(created_at) as last_seen
        FROM analytics_events
        WHERE event_type = 'javascript_error'
        GROUP BY message, source
        ORDER BY last_seen DESC
        LIMIT 50
      `);
      res.json(errors);
    } catch (error) {
      res.status(500).json({ error: 'Failed to fetch errors' });
    }
  });

  router.get('/system/reports/:type', async (req, res) => {
    try {
      const { type } = req.params;
      let data = [];
      
      if (type === 'visitors') {
        [data] = await db.query('SELECT session_id, ip_address, country, city, device_type, browser, traffic_source, is_bounce, created_at FROM analytics_visitors ORDER BY created_at DESC LIMIT 1000');
      } else if (type === 'sales') {
        [data] = await db.query('SELECT o.id as order_id, u.name as customer, o.total_amount, o.status, o.created_at FROM orders o LEFT JOIN users u ON o.user_id = u.id ORDER BY o.created_at DESC LIMIT 1000');
      } else if (type === 'events') {
        [data] = await db.query('SELECT session_id, event_type, event_data, page_url, created_at FROM analytics_events ORDER BY created_at DESC LIMIT 1000');
      } else {
        return res.status(400).json({ error: 'Invalid report type' });
      }
      
      res.json(data);
    } catch (error) {
      console.error(error);
      res.status(500).json({ error: 'Failed to generate report data' });
    }
  });

  return router;
};
