const mysql = require('mysql2/promise');
require('dotenv').config();
async function test() {
  const db = await mysql.createConnection(process.env.DATABASE_URL);
  
  const getAllDescendantIds = async (rootId) => {
    const allIds = [parseInt(rootId)];
    const queue = [parseInt(rootId)];
    while (queue.length > 0) {
      const current = queue.shift();
      const [children] = await db.query('SELECT id FROM categories WHERE parent_id = ?', [current]);
      for (const child of children) {
        allIds.push(child.id);
        queue.push(child.id);
      }
    }
    return allIds;
  };
  
  const ids = await getAllDescendantIds(12);
  console.log('Descendant IDs for 12:', ids);
  
  const [products] = await db.query(`
        SELECT p.id, p.name_en, p.name_bn, p.price, p.status
        FROM products p
        WHERE p.status = 'active'
          AND p.category_id IN (${ids.map(() => '?').join(',')})
          AND LOWER(p.name_en) LIKE ?
          AND p.id NOT IN (
            SELECT product_id FROM home_section_products WHERE category_id = ?
          )
        ORDER BY p.name_en ASC
        LIMIT 30
      `, [...ids, '%luce%', 12]);
  
  console.log('Products:', products);
  process.exit();
}
test();
