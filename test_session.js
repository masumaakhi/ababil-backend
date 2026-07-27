require('dotenv').config({ path: './backend/.env' });
const mysql = require('mysql2/promise');
const crypto = require('crypto');

async function testSession() {
  const url = process.env.DATABASE_URL.replace(/^["']|["']$/g, '');
  let db;
  try {
    db = await mysql.createConnection(url + '?ssl={"rejectUnauthorized":false}');
    console.log('Connected to DB');
    
    const session_id = crypto.randomBytes(16).toString('hex');
    console.log('Testing insert with session_id:', session_id);
    
    try {
      const result = await db.execute(`
        INSERT INTO analytics_visitors (
          session_id, customer_id, ip_address, user_agent, browser, os, 
          device_type, screen_resolution, referrer, entry_page, last_page, traffic_source
        ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
      `, [
        session_id, null, '127.0.0.1', 'TestAgent', 'Chrome', 'Windows',
        'desktop', '1920x1080', '', '/', '/', 'Direct'
      ]);
      console.log('INSERT SUCCESS, affectedRows:', result[0].affectedRows);
      
      // Cleanup
      await db.execute('DELETE FROM analytics_visitors WHERE session_id = ?', [session_id]);
      console.log('Cleanup done');
    } catch (e) {
      console.error('INSERT FAILED:', e.message);
      console.error('Full error:', e);
    }
    
  } catch (err) {
    console.error('Connection Error:', err.message);
  } finally {
    if (db) await db.end();
  }
}

testSession();
