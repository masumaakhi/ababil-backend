const mysql = require('mysql2/promise');
require('dotenv').config();

async function run() {
  const db = await mysql.createConnection(process.env.DATABASE_URL + '?ssl={"rejectUnauthorized":false}');
  
  const [rows] = await db.query('SELECT id, name_en, parent_id FROM categories ORDER BY name_en ASC');
  
  const map = {};
  rows.forEach(r => map[r.id] = r);
  
  const getPath = (id) => {
    let path = [];
    let curr = map[id];
    while (curr) {
      path.unshift(curr.name_en);
      curr = map[curr.parent_id];
    }
    return path.join(' > ');
  };
  
  const allPaths = rows.map(r => getPath(r.id)).sort();
  
  const fs = require('fs');
  fs.writeFileSync('available_categories.txt', '=== Available Categories for CSV ===\n\n' + allPaths.join('\n'));
  console.log('Categories written to available_categories.txt');
  process.exit(0);
}

run().catch(console.error);
