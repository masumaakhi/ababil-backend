require('dotenv').config({ path: './backend/.env' });
const http = require('http');

const payload = JSON.stringify({
  user_agent: 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) Chrome/120',
  browser: 'Chrome',
  os: 'Windows',
  device_type: 'desktop',
  screen_resolution: '1920x1080',
  referrer: '',
  traffic_source: 'Direct',
  entry_page: '/',
  customer_id: null
});

const req = http.request({
  hostname: 'localhost',
  port: 5250,
  path: '/api/analytics/session',
  method: 'POST',
  headers: {
    'Content-Type': 'application/json',
    'Content-Length': Buffer.byteLength(payload),
    'Origin': 'http://localhost:3000'
  }
}, (res) => {
  let d = '';
  res.on('data', c => d += c);
  res.on('end', () => {
    console.log('Status:', res.statusCode);
    console.log('Response:', d);
    
    const data = JSON.parse(d);
    if (data.session_id) {
      console.log('\n✅ Session created successfully! session_id:', data.session_id);
      
      // Now test track endpoint
      const trackPayload = JSON.stringify({
        session_id: data.session_id,
        current_page: '/',
        page_views: [{ page_url: '/', page_title: 'Home', time_spent: 10 }],
        events: [],
        heatmaps: []
      });
      
      const req2 = http.request({
        hostname: 'localhost',
        port: 5250,
        path: '/api/analytics/track',
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Content-Length': Buffer.byteLength(trackPayload),
          'Origin': 'http://localhost:3000'
        }
      }, (res2) => {
        let d2 = '';
        res2.on('data', c => d2 += c);
        res2.on('end', () => {
          console.log('\nTrack Status:', res2.statusCode);
          console.log('Track Response:', d2);
        });
      });
      req2.write(trackPayload);
      req2.end();
    }
  });
});
req.write(payload);
req.end();
