const mysql = require('mysql2/promise');
async function test() {
  try {
    const db = await mysql.createConnection("mysql://root:QmhFsDwRTZRjJsBxddvJiotJUurgduiF@hayabusa.proxy.rlwy.net:56062/ababil-shop");
    const [settings] = await db.query('SELECT setting_key, setting_value FROM store_settings WHERE setting_key IN ("steadfast_api_key", "steadfast_secret_key")');
    const apiKeyRow = settings.find(s => s.setting_key === 'steadfast_api_key');
    const secretKeyRow = settings.find(s => s.setting_key === 'steadfast_secret_key');
    const apiKey = apiKeyRow ? apiKeyRow.setting_value : null;
    const secretKey = secretKeyRow ? secretKeyRow.setting_value : null;

    const res = await fetch('https://portal.packzy.com/api/v1/create_order', {
      method: 'POST',
      headers: {
        'Api-Key': apiKey,
        'Secret-Key': secretKey,
        'Content-Type': 'application/json'
      },
      body: JSON.stringify({
        invoice: 'AB-TEST123',
        recipient_name: 'test',
        recipient_phone: '01700000000',
        recipient_address: 'test',
        cod_amount: 100
      })
    });
    const text = await res.text();
    console.log('Steadfast response:', text);
    process.exit(0);
  } catch (err) {
    console.error(err);
    process.exit(1);
  }
}
test();
