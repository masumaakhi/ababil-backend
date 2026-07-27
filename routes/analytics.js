const express = require('express');
const router = express.Router();
const crypto = require('crypto');

module.exports = (db) => {
  // Check if tracking is enabled globally
  const checkTrackingEnabled = async () => {
    try {
      const [rows] = await db.query('SELECT tracking_enabled FROM analytics_settings LIMIT 1');
      if (rows.length > 0) return rows[0].tracking_enabled === 1;
      return true; // Default to true if not set
    } catch (err) {
      return true; // Fail open
    }
  };

  // 1. Initialize or Update Session
  router.post('/session', async (req, res) => {
    const isEnabled = await checkTrackingEnabled();
    if (!isEnabled) return res.json({ status: 'ignored', message: 'Tracking disabled' });

    let {
      session_id,
      customer_id,
      user_agent,
      browser,
      os,
      device_type,
      screen_resolution,
      referrer,
      entry_page,
      traffic_source
    } = req.body;

    const ip_address = req.headers['x-forwarded-for'] || req.socket.remoteAddress;

    // Generate session_id if none provided
    if (!session_id) {
      session_id = crypto.randomBytes(16).toString('hex');
    }

    try {
      // Check if session exists
      const [existing] = await db.query('SELECT id FROM analytics_visitors WHERE session_id = ?', [session_id]);
      
      if (existing.length === 0) {
        // Create new session
        await db.execute(`
          INSERT INTO analytics_visitors (
            session_id, customer_id, ip_address, user_agent, browser, os, 
            device_type, screen_resolution, referrer, entry_page, last_page, traffic_source
          ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
        `, [
          session_id, customer_id || null, ip_address, user_agent, browser, os,
          device_type, screen_resolution, referrer, entry_page, entry_page, traffic_source || 'Direct'
        ]);
      } else {
        // Update existing session (e.g., user logged in, so we have customer_id now)
        if (customer_id) {
          await db.execute('UPDATE analytics_visitors SET customer_id = ?, session_end = CURRENT_TIMESTAMP WHERE session_id = ?', [customer_id, session_id]);
        } else {
          await db.execute('UPDATE analytics_visitors SET session_end = CURRENT_TIMESTAMP WHERE session_id = ?', [session_id]);
        }
      }

      res.status(200).json({ session_id });
    } catch (error) {
      console.error('Analytics session error:', error);
      res.status(500).json({ error: 'Failed to process session' });
    }
  });

  // 2. Track batched data (Page views, events, heatmaps)
  router.post('/track', async (req, res) => {
    const isEnabled = await checkTrackingEnabled();
    if (!isEnabled) return res.status(200).send('OK'); // Return 200 so frontend doesn't retry

    const { session_id, page_views = [], events = [], heatmaps = [], current_page } = req.body;

    if (!session_id) return res.status(400).json({ error: 'Session ID is required' });

    try {
      // Update session last_page and session_end
      if (current_page) {
        await db.execute('UPDATE analytics_visitors SET last_page = ?, session_end = CURRENT_TIMESTAMP, is_bounce = 0 WHERE session_id = ?', [current_page, session_id]);
      } else {
        await db.execute('UPDATE analytics_visitors SET session_end = CURRENT_TIMESTAMP WHERE session_id = ?', [session_id]);
      }

      // Bulk Insert Page Views
      if (page_views.length > 0) {
        const pvValues = page_views.map(pv => [session_id, pv.page_url, pv.page_title, pv.time_spent]);
        await db.query(`
          INSERT INTO analytics_page_views (session_id, page_url, page_title, time_spent) 
          VALUES ?
        `, [pvValues]);
      }

      // Bulk Insert Events
      if (events.length > 0) {
        const evValues = events.map(ev => [session_id, ev.event_type, JSON.stringify(ev.event_data), ev.page_url]);
        await db.query(`
          INSERT INTO analytics_events (session_id, event_type, event_data, page_url) 
          VALUES ?
        `, [evValues]);
      }

      // Bulk Insert Heatmaps
      if (heatmaps.length > 0) {
        const heatValues = heatmaps.map(hm => [
          session_id, hm.page_url, hm.click_x || null, hm.click_y || null, 
          hm.scroll_depth || null, hm.viewport_width || null, hm.viewport_height || null
        ]);
        await db.query(`
          INSERT INTO analytics_heatmaps (session_id, page_url, click_x, click_y, scroll_depth, viewport_width, viewport_height) 
          VALUES ?
        `, [heatValues]);
      }

      res.status(200).json({ success: true });
    } catch (error) {
      console.error('Analytics track error:', error);
      res.status(500).json({ error: 'Failed to process tracking data' });
    }
  });

  // 3. Get Tracking Settings (for frontend to know what to load)
  router.get('/settings', async (req, res) => {
    try {
      const [rows] = await db.query('SELECT tracking_enabled, heatmaps_enabled, recordings_enabled, ga4_id, clarity_id FROM analytics_settings LIMIT 1');
      if (rows.length > 0) {
        res.json(rows[0]);
      } else {
        res.json({ tracking_enabled: 1, heatmaps_enabled: 1, recordings_enabled: 0, ga4_id: null, clarity_id: null });
      }
    } catch (error) {
       res.json({ tracking_enabled: 1, heatmaps_enabled: 1, recordings_enabled: 0, ga4_id: null, clarity_id: null });
    }
  });

  return router;
};
