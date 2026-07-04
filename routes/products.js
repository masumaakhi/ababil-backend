const express = require('express');
const router = express.Router();
const cache = require('../middlewares/cache');

module.exports = (db) => {

  // ─────────────────────────────────────────────────────────────────────────
  // GET /api/products/categories
  // Get all categories in hierarchical format for Mega Menu
  // ─────────────────────────────────────────────────────────────────────────
  router.get('/categories', cache('categories', 3600), async (req, res) => {
    try {
      const [rows] = await db.query('SELECT * FROM categories ORDER BY parent_id ASC, CASE WHEN sort_order IS NULL OR sort_order = 0 THEN 999999 ELSE sort_order END ASC, id ASC');
      
      // Build hierarchy
      const categoryMap = {};
      const rootCategories = [];

      rows.forEach(cat => {
        categoryMap[cat.id] = { ...cat, children: [] };
      });

      rows.forEach(cat => {
        if (cat.parent_id) {
          if (categoryMap[cat.parent_id]) {
            categoryMap[cat.parent_id].children.push(categoryMap[cat.id]);
          }
        } else {
          rootCategories.push(categoryMap[cat.id]);
        }
      });

      res.json(rootCategories);
    } catch (err) {
      console.error(err);
      res.status(500).json({ message: 'Server error' });
    }
  });

  // ─────────────────────────────────────────────────────────────────────────
  // GET /api/products/home-sections
  // Extremely fast endpoint for the frontend homepage to get all category sections
  // ─────────────────────────────────────────────────────────────────────────
  router.get('/home-sections', cache('home-sections', 3600), async (req, res) => {
    try {
      // 1. Fetch all root categories
      const [categories] = await db.query('SELECT id, name_en, name_bn FROM categories WHERE parent_id IS NULL ORDER BY CASE WHEN sort_order IS NULL OR sort_order = 0 THEN 999999 ELSE sort_order END ASC, id ASC LIMIT 11');
      
      const sections = [];
      
      // 2. For each root category, fetch its subcategory IDs
      for (const cat of categories) {
        const [subCats] = await db.query('SELECT id FROM categories WHERE parent_id = ?', [cat.id]);
        let catIds = [cat.id];
        if (subCats.length > 0) {
          catIds = catIds.concat(subCats.map(s => s.id));
        }

        // Fetch products for these categories
        const [products] = await db.query(`
          SELECT p.*,
                 (SELECT COALESCE(SUM(stock), 0) FROM inventory WHERE product_id = p.id) as total_stock
          FROM products p
          WHERE p.status = 'active' AND p.category_id IN (?)
          ORDER BY p.created_at DESC
          LIMIT 10
        `, [catIds]);
        
        if (products.length > 0) {
           const parsedProducts = products.map(p => ({
             ...p,
             images: typeof p.images === 'string' ? JSON.parse(p.images) : p.images
           }));
           sections.push({ category: cat, products: parsedProducts });
        }
      }

      res.json(sections);
    } catch (err) {
      console.error(err);
      res.status(500).json({ message: 'Server error' });
    }
  });

  // ─────────────────────────────────────────────────────────────────────────
  // GET /api/products
  // Get products with filters (is_featured, is_recommended, category_id)
  // ─────────────────────────────────────────────────────────────────────────
  router.get('/', cache('products-list', 600), async (req, res) => {
    try {
      const { is_featured, is_recommended, category_id, limit = 20 } = req.query;
      
      let query = `
        SELECT p.*, c.name_en as category_name, b.name as brand_name,
               (SELECT COALESCE(SUM(stock), 0) FROM inventory WHERE product_id = p.id) as total_stock
        FROM products p
        LEFT JOIN categories c ON p.category_id = c.id
        LEFT JOIN brands b ON p.brand_id = b.id
        WHERE p.status = 'active'
      `;
      const params = [];

      if (is_featured === 'true') {
        query += ' AND p.is_featured = 1';
      }
      if (is_recommended === 'true') {
        query += ' AND p.is_recommended = 1';
      }
      if (category_id) {
        query += ' AND p.category_id = ?';
        params.push(parseInt(category_id));
      }

      query += ' ORDER BY p.created_at DESC LIMIT ?';
      params.push(parseInt(limit));

      const [products] = await db.query(query, params);
      
      // Parse JSON images
      const parsedProducts = products.map(p => ({
        ...p,
        images: typeof p.images === 'string' ? JSON.parse(p.images) : p.images
      }));

      res.json(parsedProducts);
    } catch (err) {
      console.error(err);
      res.status(500).json({ message: 'Server error' });
    }
  });

  // ─────────────────────────────────────────────────────────────────────────
  // GET /api/products/:slug
  // Get single product details
  // ─────────────────────────────────────────────────────────────────────────
  router.get('/:slug', cache('product-detail', 600), async (req, res) => {
    try {
      const { slug } = req.params;
      
      const [products] = await db.query(`
        SELECT p.*, c.name_en as category_name, b.name as brand_name,
               (SELECT COALESCE(SUM(stock), 0) FROM inventory WHERE product_id = p.id) as total_stock
        FROM products p
        LEFT JOIN categories c ON p.category_id = c.id
        LEFT JOIN brands b ON p.brand_id = b.id
        WHERE p.slug = ? AND p.status = 'active'
      `, [slug]);

      if (products.length === 0) {
        return res.status(404).json({ message: 'Product not found' });
      }

      const product = products[0];
      product.images = typeof product.images === 'string' ? JSON.parse(product.images) : product.images;

      // Fetch variants and their stock
      const [variants] = await db.query(`
        SELECT pv.*, i.stock 
        FROM product_variants pv
        LEFT JOIN inventory i ON i.variant_id = pv.id
        WHERE pv.product_id = ?
      `, [product.id]);

      product.variants = variants;

      res.json(product);
    } catch (err) {
      console.error(err);
      res.status(500).json({ message: 'Server error' });
    }
  });

  return router;
};
