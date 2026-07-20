const fetch = require('node-fetch'); // Not required in Node 22, can just use global fetch

async function test() {
  try {
    const res = await fetch('http://localhost:5250/api/admin/orders/send-courier', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json'
        // Missing auth token, but let's see what happens.
        // Wait, admin routes might require authorization.
      },
      body: JSON.stringify({ orderIds: ['AB-300895'] })
    });
    
    console.log(res.status);
    const text = await res.text();
    console.log(text);
  } catch (err) {
    console.error(err);
  }
}
test();
