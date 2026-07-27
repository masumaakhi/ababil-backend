require('dotenv').config({ path: './backend/.env' });
const mysql = require('mysql2/promise');

async function checkAnalytics() {
  const url = process.env.DATABASE_URL.replace(/^["']|["']$/g, '');
  let db;
  try {
    db = await mysql.createConnection(url + '?ssl={"rejectUnauthorized":false}');
    console.log('Connected to DB');
    
    const [tables] = await db.query("SHOW TABLES LIKE 'analytics%'");
    console.log('Analytics tables:', tables.map(t => Object.values(t)[0]));
    
    const [vCount] = await db.query('SELECT COUNT(*) as c FROM analytics_visitors');
    console.log('Visitors count:', vCount[0].c);
    
    const [pvCount] = await db.query('SELECT COUNT(*) as c FROM analytics_page_views');
    console.log('Page views count:', pvCount[0].c);
    
    const [evCount] = await db.query('SELECT COUNT(*) as c FROM analytics_events');
    console.log('Events count:', evCount[0].c);
    
    // Try to insert a test session to see if DB write works
    const testSessionId = 'test_debug_' + Date.now();
    try {
      await db.execute(
        'INSERT INTO analytics_visitors (session_id, ip_address, user_agent, browser, os, device_type, entry_page, last_page, traffic_source) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)',
        [testSessionId, '127.0.0.1', 'TestAgent', 'Chrome', 'Windows', 'desktop', '/test', '/test', 'Direct']
      );
      console.log('Test session insert: SUCCESS');
      // Clean up
      await db.execute('DELETE FROM analytics_visitors WHERE session_id = ?', [testSessionId]);
    } catch (e) {
      console.log('Test session insert FAILED:', e.message);
    }
    
  } catch (err) {
    console.error('DB Error:', err.message);
  } finally {
    if (db) await db.end();
  }
}

checkAnalytics();
