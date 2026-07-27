require('dotenv').config({ path: './backend/.env' });
const mysql = require('mysql2/promise');
const crypto = require('crypto');

async function testSessionPool() {
  const url = process.env.DATABASE_URL.replace(/^["']|["']$/g, '');
  let db;
  try {
    // Use pool like the backend does
    db = mysql.createPool(url + '?ssl={"rejectUnauthorized":false}');
    console.log('Pool created');
    
    const session_id = crypto.randomBytes(16).toString('hex');
    console.log('Testing pool insert with session_id:', session_id);
    
    try {
      const [result] = await db.execute(`
        INSERT INTO analytics_visitors (
          session_id, customer_id, ip_address, user_agent, browser, os, 
          device_type, screen_resolution, referrer, entry_page, last_page, traffic_source
        ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
      `, [
        session_id, null, '127.0.0.1', 'TestAgent', 'Chrome', 'Windows',
        'desktop', '1920x1080', '', '/', '/', 'Direct'
      ]);
      console.log('POOL INSERT SUCCESS, affectedRows:', result.affectedRows);
      
      // Cleanup
      await db.execute('DELETE FROM analytics_visitors WHERE session_id = ?', [session_id]);
      console.log('Cleanup done');
    } catch (e) {
      console.error('POOL INSERT FAILED:', e.message);
      console.error('SQL State:', e.sqlState);
      console.error('SQL Message:', e.sqlMessage);
    }
    
  } catch (err) {
    console.error('Pool Error:', err.message);
  } finally {
    if (db) await db.end();
  }
}

testSessionPool();
