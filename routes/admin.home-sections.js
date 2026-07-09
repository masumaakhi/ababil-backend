const express = require('express');
const router = express.Router();
const { verifyAdmin } = require('../middleware/auth');
const redisClient = require('../config/redis');

module.exports = (db) => {
  router.use(verifyAdmin);

  const clearCache = async () => {
    try {
      if (redisClient) {
        await redisClient.del('home-sections:/api/products/home-sections');
      }
    } catch (e) {
      console.error('Cache clear error:', e);
    }
  };

  // ─────────────────────────────────────────────────────────────────────────
  // GET /api/admin/home-sections
  // All root categories with show_on_home status + pinned product counts
  // ─────────────────────────────────────────────────────────────────────────
  router.get('/', async (req, res) => {
    try {
      const [categories] = await db.query(`
        SELECT id, name_en, name_bn, icon, sort_order, show_on_home
        FROM categories
        WHERE parent_id IS NULL
        ORDER BY CASE WHEN sort_order IS NULL OR sort_order = 0 THEN 999999 ELSE sort_order END ASC, id ASC
      `);

      // For each category, get pinned product count
      const result = await Promise.all(categories.map(async (cat) => {
        const [pinned] = await db.query(
          'SELECT COUNT(*) as count FROM home_section_products WHERE category_id = ?',
          [cat.id]
        );
        return { ...cat, pinned_count: pinned[0].count };
      }));

      res.json(result);
    } catch (err) {
      console.error('Fetch home sections error:', err);
      res.status(500).json({ message: 'Server error' });
    }
  });

  // ─────────────────────────────────────────────────────────────────────────
  // PUT /api/admin/home-sections/:catId
  // Toggle show_on_home
  // ─────────────────────────────────────────────────────────────────────────
  router.put('/:catId', async (req, res) => {
    const { catId } = req.params;
    const { show_on_home } = req.body;
    try {
      await db.query('UPDATE categories SET show_on_home = ? WHERE id = ?', [show_on_home ? 1 : 0, catId]);
      await clearCache();
      res.json({ message: 'Updated' });
    } catch (err) {
      console.error('Toggle home section error:', err);
      res.status(500).json({ message: 'Server error' });
    }
  });

  // ─────────────────────────────────────────────────────────────────────────
  // GET /api/admin/home-sections/:catId/products
  // Get pinned products for a category section
  // ─────────────────────────────────────────────────────────────────────────
  router.get('/:catId/products', async (req, res) => {
    const { catId } = req.params;
    try {
      const [products] = await db.query(`
        SELECT p.id, p.name_en, p.name_bn, p.base_price as price, p.old_price, p.images, p.status,
               hsp.sort_order as pin_order
        FROM home_section_products hsp
        JOIN products p ON p.id = hsp.product_id
        WHERE hsp.category_id = ?
        ORDER BY hsp.sort_order ASC, hsp.id ASC
      `, [catId]);

      const parsed = products.map(p => ({
        ...p,
        images: typeof p.images === 'string' ? JSON.parse(p.images) : p.images
      }));
      res.json(parsed);
    } catch (err) {
      console.error('Fetch pinned products error:', err);
      res.status(500).json({ message: 'Server error' });
    }
  });

  // ─────────────────────────────────────────────────────────────────────────
  // POST /api/admin/home-sections/:catId/products
  // Add a product to a category section
  // ─────────────────────────────────────────────────────────────────────────
  router.post('/:catId/products', async (req, res) => {
    const { catId } = req.params;
    const { product_id } = req.body;
    if (!product_id) return res.status(400).json({ message: 'product_id required' });

    try {
      // Get max sort_order for this category
      const [maxOrder] = await db.query(
        'SELECT COALESCE(MAX(sort_order), 0) as max_order FROM home_section_products WHERE category_id = ?',
        [catId]
      );
      const nextOrder = maxOrder[0].max_order + 1;

      await db.query(
        'INSERT IGNORE INTO home_section_products (category_id, product_id, sort_order) VALUES (?, ?, ?)',
        [catId, product_id, nextOrder]
      );
      await clearCache();
      res.status(201).json({ message: 'Product pinned to section' });
    } catch (err) {
      console.error('Pin product error:', err);
      res.status(500).json({ message: 'Server error' });
    }
  });

  // ─────────────────────────────────────────────────────────────────────────
  // DELETE /api/admin/home-sections/:catId/products/:productId
  // Remove a pinned product from a section
  // ─────────────────────────────────────────────────────────────────────────
  router.delete('/:catId/products/:productId', async (req, res) => {
    const { catId, productId } = req.params;
    try {
      await db.query(
        'DELETE FROM home_section_products WHERE category_id = ? AND product_id = ?',
        [catId, productId]
      );
      await clearCache();
      res.json({ message: 'Product removed from section' });
    } catch (err) {
      console.error('Unpin product error:', err);
      res.status(500).json({ message: 'Server error' });
    }
  });

  // ─────────────────────────────────────────────────────────────────────────
  // PUT /api/admin/home-sections/:catId/products/reorder
  // Reorder pinned products
  // ─────────────────────────────────────────────────────────────────────────
  router.put('/:catId/products/reorder', async (req, res) => {
    const { catId } = req.params;
    const { productIds } = req.body;
    
    if (!Array.isArray(productIds)) {
      return res.status(400).json({ message: 'productIds array is required' });
    }

    try {
      // Begin transaction if supported, but for simplicity we'll just run queries
      for (let i = 0; i < productIds.length; i++) {
        await db.query(
          'UPDATE home_section_products SET sort_order = ? WHERE category_id = ? AND product_id = ?',
          [i + 1, catId, productIds[i]]
        );
      }
      await clearCache();
      res.json({ message: 'Products reordered successfully' });
    } catch (err) {
      console.error('Reorder products error:', err);
      res.status(500).json({ message: 'Server error' });
    }
  });

  // Helper: recursively get ALL descendant category IDs (any depth)
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

  // ─────────────────────────────────────────────────────────────────────────
  // GET /api/admin/home-sections/:catId/search-products
  // Search products that can be added to a section
  // ─────────────────────────────────────────────────────────────────────────
  router.get('/:catId/search-products', async (req, res) => {
    const { catId } = req.params;
    const { q = '' } = req.query;
    try {
      // Get ALL descendant category IDs (recursive, any depth)
      const allCatIds = await getAllDescendantIds(catId);

      const searchTerm = `%${q.toString().toLowerCase()}%`;

      const [products] = await db.query(`
        SELECT p.id, p.name_en, p.name_bn, p.base_price as price, p.images, p.status
        FROM products p
        WHERE p.status = 'active'
          AND p.category_id IN (${allCatIds.map(() => '?').join(',')})
          AND LOWER(p.name_en) LIKE ?
          AND p.id NOT IN (
            SELECT product_id FROM home_section_products WHERE category_id = ?
          )
        ORDER BY p.name_en ASC
        LIMIT 30
      `, [...allCatIds, searchTerm, catId]);

      const parsed = products.map(p => ({
        ...p,
        images: typeof p.images === 'string' ? JSON.parse(p.images) : p.images
      }));
      res.json(parsed);
    } catch (err) {
      console.error('Search products error:', err);
      res.status(500).json({ message: 'Server error' });
    }
  });

  return router;
};

