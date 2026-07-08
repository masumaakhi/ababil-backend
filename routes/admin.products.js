const express = require('express');
const router = express.Router();
const multer = require('multer');
const csv = require('csv-parser');
const streamifier = require('streamifier');
const { verifyAdmin } = require('../middleware/auth');
const { uploadToCloudinary, uploadUrlToCloudinary } = require('../utils/cloudinary');
const redisClient = require('../config/redis');

const upload = multer({ storage: multer.memoryStorage() });

module.exports = (db) => {
  // All routes below require admin auth
  router.use(verifyAdmin);

  // ─────────────────────────────────────────────────────────────────────────
  // GET /api/admin/products/categories
  // Get all categories for dropdown
  // ─────────────────────────────────────────────────────────────────────────
  router.get('/categories', async (req, res) => {
    try {
      const [rows] = await db.query('SELECT * FROM categories ORDER BY name_en ASC');
      res.json(rows);
    } catch (err) {
      console.error(err);
      res.status(500).json({ message: 'Server error' });
    }
  });

  // ─────────────────────────────────────────────────────────────────────────
  // POST /api/admin/products/categories
  // Create a new category
  // ─────────────────────────────────────────────────────────────────────────
  router.post('/categories', async (req, res) => {
    try {
      const { name_en, name_bn, parent_id, icon, sort_order } = req.body;

      if (!name_en) {
        return res.status(400).json({ message: 'Category name (English) is required' });
      }

      // Generate slug
      const slug = name_en.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/(^-|-$)+/g, '');

      const parentVal = parent_id ? parseInt(parent_id) : null;
      const sortVal = sort_order ? parseInt(sort_order) : 0;

      const [result] = await db.query(
        `INSERT INTO categories (name_en, name_bn, slug, parent_id, icon, sort_order) 
         VALUES (?, ?, ?, ?, ?, ?)`,
        [name_en, name_bn || null, slug, parentVal, icon || null, sortVal]
      );

      // Invalidate cache
      try {
        await redisClient.del('categories:/api/products/categories');
        await redisClient.del('home-sections:/api/products/home-sections');
      } catch (e) {}

      res.status(201).json({ message: 'Category created successfully', id: result.insertId });
    } catch (err) {
      console.error(err);
      res.status(500).json({ message: 'Server error creating category' });
    }
  });

  // ─────────────────────────────────────────────────────────────────────────
  // GET /api/admin/products/categories/:id
  // Get single category details
  // ─────────────────────────────────────────────────────────────────────────
  router.get('/categories/:id', async (req, res) => {
    try {
      const { id } = req.params;
      const [rows] = await db.query('SELECT * FROM categories WHERE id = ?', [id]);
      if (rows.length === 0) {
        return res.status(404).json({ message: 'Category not found' });
      }
      res.json(rows[0]);
    } catch (err) {
      console.error(err);
      res.status(500).json({ message: 'Server error' });
    }
  });

  // ─────────────────────────────────────────────────────────────────────────
  // PUT /api/admin/products/categories/:id
  // Update a category
  // ─────────────────────────────────────────────────────────────────────────
  router.put('/categories/:id', async (req, res) => {
    try {
      const { id } = req.params;
      const { name_en, name_bn, parent_id, icon, sort_order } = req.body;

      if (!name_en) {
        return res.status(400).json({ message: 'Category name (English) is required' });
      }

      // Generate slug
      const slug = name_en.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/(^-|-$)+/g, '');

      const parentVal = parent_id ? parseInt(parent_id) : null;
      const sortVal = sort_order ? parseInt(sort_order) : 0;

      await db.query(
        `UPDATE categories 
         SET name_en = ?, name_bn = ?, slug = ?, parent_id = ?, icon = ?, sort_order = ? 
         WHERE id = ?`,
        [name_en, name_bn || null, slug, parentVal, icon || null, sortVal, id]
      );

      // Invalidate cache
      try {
        await redisClient.del('categories:/api/products/categories');
        await redisClient.del('home-sections:/api/products/home-sections');
      } catch (e) {}

      res.json({ message: 'Category updated successfully' });
    } catch (err) {
      console.error(err);
      res.status(500).json({ message: 'Server error updating category' });
    }
  });

  // ─────────────────────────────────────────────────────────────────────────
  // DELETE /api/admin/products/categories/:id
  // Delete a category
  // ─────────────────────────────────────────────────────────────────────────
  router.delete('/categories/:id', async (req, res) => {
    try {
      const { id } = req.params;
      
      // Check if products exist in this category
      const [products] = await db.query('SELECT id FROM products WHERE category_id = ? LIMIT 1', [id]);
      if (products.length > 0) {
        return res.status(400).json({ message: 'Cannot delete category because it has products.' });
      }

      // Check if subcategories exist
      const [subs] = await db.query('SELECT id FROM categories WHERE parent_id = ? LIMIT 1', [id]);
      if (subs.length > 0) {
        return res.status(400).json({ message: 'Cannot delete category because it has sub-categories.' });
      }
      
      const [result] = await db.query('DELETE FROM categories WHERE id = ?', [id]);
      if (result.affectedRows === 0) {
        return res.status(404).json({ message: 'Category not found' });
      }
      
      // Invalidate cache
      try {
        await redisClient.del('categories:/api/products/categories');
        await redisClient.del('home-sections:/api/products/home-sections');
      } catch (e) {}

      res.json({ message: 'Category deleted successfully' });
    } catch (err) {
      console.error(err);
      res.status(500).json({ message: 'Server error deleting category' });
    }
  });

  // ─────────────────────────────────────────────────────────────────────────
  // GET /api/admin/products/brands
  // Get all brands for dropdown
  // ─────────────────────────────────────────────────────────────────────────
  router.get('/brands', async (req, res) => {
    try {
      const [rows] = await db.query('SELECT * FROM brands ORDER BY name ASC');
      res.json(rows);
    } catch (err) {
      console.error(err);
      res.status(500).json({ message: 'Server error' });
    }
  });

  // ─────────────────────────────────────────────────────────────────────────
  // GET /api/admin/products
  // Get all products with category and brand info for Admin List
  // ─────────────────────────────────────────────────────────────────────────
  router.get('/', async (req, res) => {
    try {
      const [rows] = await db.query(`
        SELECT p.*, 
               c.name_en AS category_name_en,
               b.name AS brand_name,
               (SELECT SUM(stock) FROM inventory WHERE product_id = p.id) AS stock,
               (
                 SELECT JSON_ARRAYAGG(
                   JSON_OBJECT(
                     'id', v.id,
                     'name', v.name,
                     'price', v.price,
                     'purchase_price', v.purchase_price,
                     'stock', COALESCE(i.stock, 0)
                   )
                 )
                 FROM product_variants v
                 LEFT JOIN inventory i ON v.id = i.variant_id
                 WHERE v.product_id = p.id
               ) AS variants_data
        FROM products p
        LEFT JOIN categories c ON p.category_id = c.id
        LEFT JOIN brands b ON p.brand_id = b.id
        ORDER BY p.created_at DESC
      `);
      res.json(rows);
    } catch (err) {
      console.error(err);
      res.status(500).json({ message: 'Server error fetching products' });
    }
  });

  // ─────────────────────────────────────────────────────────────────────────
  // POST /api/admin/products
  // Create a new product manually
  // ─────────────────────────────────────────────────────────────────────────
  router.post('/', upload.array('images', 5), async (req, res) => {
    const connection = await db.getConnection();
    try {
      await connection.beginTransaction();

      let {
        name_en, name_bn, category_id, brand_id, new_brand_name, new_company_name, description,
        base_price, old_price, purchase_price, base_unit, status, is_featured, is_recommended,
        variants // Expecting JSON string of variants array: [{name, price, sku, stock, purchase_price}]
      } = req.body;

      if (!name_en || !category_id || !base_price) {
        return res.status(400).json({ message: 'Missing required fields' });
      }

      // Handle new Brand / Company creation
      if (brand_id === 'other' && new_brand_name) {
        let companyId = null;
        if (new_company_name) {
          const compSlug = new_company_name.toLowerCase().replace(/[^a-z0-9]+/g, '-') + '-' + Date.now();
          const [compRes] = await connection.query(
            'INSERT INTO companies (name, slug) VALUES (?, ?)',
            [new_company_name, compSlug]
          );
          companyId = compRes.insertId;
        }
        
        const brandSlug = new_brand_name.toLowerCase().replace(/[^a-z0-9]+/g, '-') + '-' + Date.now();
        const [brandRes] = await connection.query(
          'INSERT INTO brands (name, slug, company_id) VALUES (?, ?, ?)',
          [new_brand_name, brandSlug, companyId]
        );
        brand_id = brandRes.insertId;
      }

      // Generate slug
      const slug = name_en.toLowerCase().replace(/[^a-z0-9]+/g, '-') + '-' + Date.now();

      // Upload Images to Cloudinary
      const imageUrls = [];
      if (req.files && req.files.length > 0) {
        for (const file of req.files) {
          const url = await uploadToCloudinary(file.buffer);
          imageUrls.push(url);
        }
      }

      // Insert Product
      const [prodResult] = await connection.query(`
        INSERT INTO products (
          name_en, name_bn, slug, category_id, brand_id, description,
          base_price, old_price, purchase_price, base_unit, images, status, is_featured, is_recommended
        ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
      `, [
        name_en, name_bn || null, slug, category_id, (brand_id && brand_id !== 'none' && brand_id !== 'null') ? brand_id : null, description || null,
        base_price, old_price || null, purchase_price || null, base_unit || null, JSON.stringify(imageUrls),
        status || 'active', is_featured === 'true' ? 1 : 0, is_recommended === 'true' ? 1 : 0
      ]);

      const productId = prodResult.insertId;

      // Handle Variants and Inventory
      let parsedVariants = [];
      if (variants) {
        try { parsedVariants = JSON.parse(variants); } catch (e) {}
      }

      if (parsedVariants.length > 0) {
        // Has variants
        for (const variant of parsedVariants) {
          const [varResult] = await connection.query(`
            INSERT INTO product_variants (product_id, name, price, old_price, purchase_price, sku)
            VALUES (?, ?, ?, ?, ?, ?)
          `, [productId, variant.name, variant.price, variant.old_price || null, variant.purchase_price || null, variant.sku || null]);

          // Create inventory for variant
          await connection.query(`
            INSERT INTO inventory (product_id, variant_id, stock, opening_stock)
            VALUES (?, ?, ?, ?)
          `, [productId, varResult.insertId, variant.stock || 0, variant.stock || 0]);

          if ((variant.stock || 0) > 0) {
            await connection.query(`
              INSERT INTO inventory_ledger (product_id, variant_id, type, reference, quantity, balance)
              VALUES (?, ?, 'opening', 'Product Creation', ?, ?)
            `, [productId, varResult.insertId, variant.stock, variant.stock]);
          }
        }
      }

      // Always save base stock
      const stock = req.body.stock || 0;
      await connection.query(`
        INSERT INTO inventory (product_id, variant_id, stock, opening_stock)
        VALUES (?, NULL, ?, ?)
      `, [productId, stock, stock]);

      if (stock > 0) {
        await connection.query(`
          INSERT INTO inventory_ledger (product_id, variant_id, type, reference, quantity, balance)
          VALUES (?, NULL, 'opening', 'Product Creation', ?, ?)
        `, [productId, stock, stock]);
      }

      await connection.commit();
      
      // Invalidate relevant caches
      try {
        await redisClient.del('categories:/api/products/categories');
        await redisClient.del('home-sections:/api/products/home-sections');
        // Delete all product-list queries by pattern (using ioredis keys or scan, but for now just exact match if we can, 
        // or flushall if it's a small dataset. For safety, let's just clear common keys)
        const keys = await redisClient.keys('products-list:*');
        if (keys.length > 0) {
          await redisClient.del(keys);
        }
      } catch (err) {
        console.error("Redis Cache invalidation failed:", err);
      }

      res.status(201).json({ message: 'Product created successfully', productId });

    } catch (err) {
      await connection.rollback();
      console.error('Error creating product:', err);
      res.status(500).json({ message: 'Server error' });
    } finally {
      connection.release();
    }
  });

  // ─────────────────────────────────────────────────────────────────────────
  // GET /api/admin/products/:id
  // Fetch single product for editing
  // ─────────────────────────────────────────────────────────────────────────
  router.get('/:id', async (req, res) => {
    try {
      const { id } = req.params;
      
      const [products] = await db.query(`
        SELECT p.*, 
               (SELECT stock FROM inventory WHERE product_id = p.id AND variant_id IS NULL LIMIT 1) AS base_stock
        FROM products p
        WHERE p.id = ?
      `, [id]);

      if (products.length === 0) {
        return res.status(404).json({ message: 'Product not found' });
      }

      const product = products[0];

      const [variants] = await db.query(`
        SELECT v.*, i.stock 
        FROM product_variants v
        LEFT JOIN inventory i ON v.id = i.variant_id
        WHERE v.product_id = ?
      `, [id]);

      product.variants = variants;
      res.json(product);
    } catch (err) {
      console.error(err);
      res.status(500).json({ message: 'Server error fetching product' });
    }
  });

  // ─────────────────────────────────────────────────────────────────────────
  // PUT /api/admin/products/:id
  // Update existing product
  // ─────────────────────────────────────────────────────────────────────────
  router.put('/:id', upload.array('images', 5), async (req, res) => {
    const connection = await db.getConnection();
    try {
      await connection.beginTransaction();
      
      const { id } = req.params;
      const {
        name_en, name_bn, category_id, brand_id, description,
        base_price, old_price, purchase_price, base_unit, status,
        is_featured, is_recommended, variants, existing_images
      } = req.body;

      // Handle brand
      let finalBrandId = brand_id;
      if (brand_id === 'other' && req.body.new_brand_name) {
        const [brandRes] = await connection.query(`INSERT INTO brands (name, company) VALUES (?, ?)`, [
          req.body.new_brand_name, req.body.new_company_name || null
        ]);
        finalBrandId = brandRes.insertId;
      }

      // Handle images (existing + new)
      let imageUrls = [];
      if (existing_images) {
        try { imageUrls = JSON.parse(existing_images); } catch (e) {}
      }
      
      if (req.files && req.files.length > 0) {
        for (const file of req.files) {
          const url = await uploadToCloudinary(file.buffer);
          imageUrls.push(url);
        }
      }

      // Generate slug from English name if missing, else keep existing slug logic simpler by just not updating slug unless necessary
      // We will just update fields.

      await connection.query(`
        UPDATE products SET
          name_en = ?, name_bn = ?, category_id = ?, brand_id = ?, description = ?,
          base_price = ?, old_price = ?, purchase_price = ?, base_unit = ?, images = ?, status = ?,
          is_featured = ?, is_recommended = ?
        WHERE id = ?
      `, [
        name_en, name_bn || null, category_id, (finalBrandId && finalBrandId !== 'none' && finalBrandId !== 'null') ? finalBrandId : null, description || null,
        base_price, old_price || null, purchase_price || null, base_unit || null, JSON.stringify(imageUrls),
        status || 'active', is_featured === 'true' || is_featured === true ? 1 : 0, is_recommended === 'true' || is_recommended === true ? 1 : 0,
        id
      ]);

      // Fetch existing variants and base inventory
      const [oldVariants] = await connection.query(`SELECT * FROM product_variants WHERE product_id = ?`, [id]);
      const [oldInventories] = await connection.query(`SELECT * FROM inventory WHERE product_id = ? AND variant_id IS NULL`, [id]);

      let parsedVariants = [];
      if (variants) {
        try { parsedVariants = JSON.parse(variants); } catch (e) {}
      }

      const processedVariantIds = [];

      if (parsedVariants.length > 0) {
        for (const variant of parsedVariants) {
          const oldVar = oldVariants.find(v => v.name === variant.name);
          if (oldVar) {
            // Update existing variant
            await connection.query(`
              UPDATE product_variants 
              SET price = ?, old_price = ?, purchase_price = ?, sku = ? 
              WHERE id = ?
            `, [variant.price, variant.old_price || null, variant.purchase_price || null, variant.sku || null, oldVar.id]);
            
            // Only update stock, do not touch historical data
            await connection.query(`
              UPDATE inventory SET stock = ? WHERE variant_id = ?
            `, [variant.stock || 0, oldVar.id]);
            
            processedVariantIds.push(oldVar.id);
          } else {
            // Insert new variant
            const [varResult] = await connection.query(`
              INSERT INTO product_variants (product_id, name, price, old_price, purchase_price, sku)
              VALUES (?, ?, ?, ?, ?, ?)
            `, [id, variant.name, variant.price, variant.old_price || null, variant.purchase_price || null, variant.sku || null]);

            const stockVal = variant.stock || 0;
            await connection.query(`
              INSERT INTO inventory (product_id, variant_id, stock, opening_stock)
              VALUES (?, ?, ?, ?)
            `, [id, varResult.insertId, stockVal, stockVal]);

            if (stockVal > 0) {
              await connection.query(`
                INSERT INTO inventory_ledger (product_id, variant_id, type, reference, quantity, balance)
                VALUES (?, ?, 'opening', 'Product Edit - New Variant', ?, ?)
              `, [id, varResult.insertId, stockVal, stockVal]);
            }
          }
        }
      }

      // Delete removed variants
      for (const oldVar of oldVariants) {
        if (!processedVariantIds.includes(oldVar.id)) {
          await connection.query(`DELETE FROM product_variants WHERE id = ?`, [oldVar.id]);
        }
      }

      // Handle Base Stock
      const baseStock = req.body.stock || 0;
      if (oldInventories.length > 0) {
        await connection.query(`
          UPDATE inventory SET stock = ? WHERE id = ?
        `, [baseStock, oldInventories[0].id]);
      } else {
        await connection.query(`
          INSERT INTO inventory (product_id, variant_id, stock, opening_stock)
          VALUES (?, NULL, ?, ?)
        `, [id, baseStock, baseStock]);
        
        if (baseStock > 0) {
          await connection.query(`
            INSERT INTO inventory_ledger (product_id, variant_id, type, reference, quantity, balance)
            VALUES (?, NULL, 'opening', 'Product Edit - New Base Stock', ?, ?)
          `, [id, baseStock, baseStock]);
        }
      }

      await connection.commit();

      // Invalidate caches
      try {
        await redisClient.del('categories:/api/products/categories');
        await redisClient.del('home-sections:/api/products/home-sections');
        await redisClient.del(`product-detail:/api/products/${req.body.slug || ''}`); // Wait, slug might not be in body. We can clear all.
        const keysList = await redisClient.keys('products-list:*');
        const keysDetail = await redisClient.keys('product-detail:*');
        if (keysList.length > 0) await redisClient.del(keysList);
        if (keysDetail.length > 0) await redisClient.del(keysDetail);
      } catch (err) {
        console.error("Redis Cache invalidation failed:", err);
      }

      res.json({ message: 'Product updated successfully' });

    } catch (err) {
      await connection.rollback();
      console.error('Error updating product:', err);
      res.status(500).json({ message: 'Server error' });
    } finally {
      connection.release();
    }
  });

  // ─────────────────────────────────────────────────────────────────────────
  // ─────────────────────────────────────────────────────────────────────────
  // POST /api/admin/products/bulk
  // Bulk Import CSV
  // ─────────────────────────────────────────────────────────────────────────
  router.post('/bulk', upload.single('file'), async (req, res) => {
    if (!req.file) return res.status(400).json({ message: 'CSV file is required' });

    const results = [];
    const errors = [];

    // 1. Parse CSV
    try {
      await new Promise((resolve, reject) => {
        streamifier.createReadStream(req.file.buffer)
          .pipe(csv({
            mapHeaders: ({ header }) => header.trim().replace(/^[\uFEFF\u200B]+/, '')
          }))
          .on('data', (data) => results.push(data))
          .on('end', resolve)
          .on('error', reject);
      });
    } catch (err) {
      return res.status(400).json({ message: 'Error parsing CSV file' });
    }

    if (results.length === 0) {
      return res.status(400).json({ message: 'CSV file is empty' });
    }

    const connection = await db.getConnection();
    
    try {
      await connection.beginTransaction();

      let successCount = 0;
      
      // To keep track of products created in this session by name
      const productCache = new Map(); 

      for (const row of results) {
        try {
          const name_en = row['Product Name (English)'] || row.name_en || row['Product Name'];
          if (!name_en || name_en.trim() === '') {
            throw new Error("Product Name is required");
          }
          const final_name_en = name_en.trim();

          const name_bn = row['Product Name (Bengali)'] || row.name_bn;
          const category_path = row['Category'] || row.category_path;
          
          const company_name = row['Company'] || row.company_name;
          const brand_name = row['Brand'] || row.brand_name;
          
          const description = row['Description'] || row.description;
          const base_price = parseFloat(row['Base Price'] || row.base_price || 0);
          const old_price = row['Old Price'] || row.old_price;
          const base_unit = row['Base Unit'] || row.base_unit;
          const stock = parseInt(row['Base Stock'] || row.stock || 0);
          
          const image_url = row['Image URL'] || row.image_url;
          const variant_name = row['Variant Name'] || row.variant_name;
          const variant_price = row['Variant Price'] || row.variant_price;
          const variant_old_price = row['Variant Old Price'] || row.variant_old_price;
          const sku = row['SKU'] || row.sku;
          const variant_stock = row['Variant Stock'] || row.variant_stock;
          
          const statusRaw = row['Status'] || row.status || 'active';
          const status = statusRaw.toLowerCase() === 'inactive' ? 'inactive' : 'active';
          const is_featured = (row['Featured'] || row.is_featured)?.toString().toLowerCase() === 'true' ? 1 : 0;
          const is_recommended = (row['Recommended'] || row.is_recommended)?.toString().toLowerCase() === 'true' ? 1 : 0;

          // Check if Product already exists (either in DB or created in this batch)
          let productId = productCache.get(final_name_en);
          
          if (!productId) {
            const [existingProd] = await connection.query('SELECT id FROM products WHERE name_en = ?', [final_name_en]);
            if (existingProd.length > 0) {
              productId = existingProd[0].id;
              productCache.set(final_name_en, productId);
            }
          }

          if (!productId) {
            // === CREATE NEW PRODUCT ===

            // Handle Company & Brand
            let company_id = null;
            if (company_name && company_name.trim()) {
              const cName = company_name.trim();
              const [cRows] = await connection.query('SELECT id FROM companies WHERE name = ?', [cName]);
              if (cRows.length > 0) {
                company_id = cRows[0].id;
              } else {
                const cSlug = cName.toLowerCase().replace(/[^a-z0-9]+/g, '-') + '-' + Date.now();
                const [cRes] = await connection.query('INSERT INTO companies (name, slug) VALUES (?, ?)', [cName, cSlug]);
                company_id = cRes.insertId;
              }
            }

            let brand_id = null;
            if (brand_name && brand_name.trim()) {
              const bName = brand_name.trim();
              let q = 'SELECT id FROM brands WHERE name = ?';
              let p = [bName];
              if (company_id) {
                q += ' AND company_id = ?';
                p.push(company_id);
              }
              
              const [bRows] = await connection.query(q, p);
              if (bRows.length > 0) {
                brand_id = bRows[0].id;
              } else {
                const bSlug = bName.toLowerCase().replace(/[^a-z0-9]+/g, '-') + '-' + Date.now();
                const [bRes] = await connection.query('INSERT INTO brands (name, slug, company_id) VALUES (?, ?, ?)', [bName, bSlug, company_id || null]);
                brand_id = bRes.insertId;
              }
            }

            // Handle Category Hierarchy
            let currentParentId = null;
            let catParts = ['Uncategorized'];
            if (category_path && category_path.trim() !== '') {
              catParts = category_path.split('>').map((s) => s.trim()).filter(Boolean);
            }
            
            for (const catName of catParts) {
              let query = 'SELECT id FROM categories WHERE name_en = ?';
              let params = [catName];
              
              if (currentParentId === null) {
                query += ' AND parent_id IS NULL';
              } else {
                query += ' AND parent_id = ?';
                params.push(currentParentId);
              }

              const [cRows] = await connection.query(query, params);
              if (cRows.length > 0) {
                currentParentId = cRows[0].id;
              } else {
                const cSlug = catName.toLowerCase().replace(/[^a-z0-9]+/g, '-') + '-' + Date.now() + Math.floor(Math.random()*1000);
                const [cRes] = await connection.query(
                  'INSERT INTO categories (name_en, slug, parent_id) VALUES (?, ?, ?)',
                  [catName, cSlug, currentParentId]
                );
                currentParentId = cRes.insertId;
              }
            }
            const category_id = currentParentId;
            const slug = final_name_en.toLowerCase().replace(/[^a-z0-9]+/g, '-') + '-' + Date.now() + Math.floor(Math.random()*1000);

            // Handle Multiple Images
            let imagesArray = [];
            if (image_url && image_url.trim() !== '') {
              const urls = image_url.split(',').map(u => u.trim()).filter(Boolean);
              for (const url of urls) {
                if (url.includes('cloudinary.com')) {
                  imagesArray.push(url);
                } else {
                  try {
                    const c_url = await uploadUrlToCloudinary(url);
                    imagesArray.push(c_url);
                  } catch (cErr) {
                    console.error("Cloudinary upload failed for url:", url, cErr);
                    imagesArray.push(url); // fallback
                  }
                }
              }
            }

            // Insert Product
            const [pRes] = await connection.query(`
              INSERT INTO products (
                name_en, name_bn, slug, category_id, brand_id, description,
                base_price, old_price, base_unit, images, status, is_featured, is_recommended
              ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
            `, [
              final_name_en, name_bn || null, slug, category_id, brand_id, description || null,
              base_price, old_price ? parseFloat(old_price) : null, base_unit || null,
              JSON.stringify(imagesArray), status, is_featured, is_recommended
            ]);

            productId = pRes.insertId;
            productCache.set(final_name_en, productId);
            
            // Base Inventory (Only add if no variant is specified on this first row, or if both are specified it's fine)
            if (!variant_name || variant_name.trim() === '') {
              await connection.query(`
                INSERT INTO inventory (product_id, variant_id, stock, opening_stock)
                VALUES (?, NULL, ?, ?)
              `, [productId, stock, stock]);

              if (stock > 0) {
                await connection.query(`
                  INSERT INTO inventory_ledger (product_id, variant_id, type, reference, quantity, balance)
                  VALUES (?, NULL, 'opening', 'CSV Import', ?, ?)
                `, [productId, stock, stock]);
              }
            }
          }

          // === ADD VARIANT ===
          if (variant_name && variant_name.trim() !== '') {
            const [vRes] = await connection.query(`
              INSERT INTO product_variants (product_id, name, price, old_price, sku)
              VALUES (?, ?, ?, ?, ?)
            `, [
              productId, 
              variant_name, 
              parseFloat(variant_price || base_price || 0), 
              variant_old_price ? parseFloat(variant_old_price) : null, 
              sku || null
            ]);
            
            // Inventory for Variant
            const vStock = parseInt(variant_stock || stock || 0);
            await connection.query(`
              INSERT INTO inventory (product_id, variant_id, stock, opening_stock)
              VALUES (?, ?, ?, ?)
            `, [productId, vRes.insertId, vStock, vStock]);

            if (vStock > 0) {
              await connection.query(`
                INSERT INTO inventory_ledger (product_id, variant_id, type, reference, quantity, balance)
                VALUES (?, ?, 'opening', 'CSV Import', ?, ?)
              `, [productId, vRes.insertId, vStock, vStock]);
            }
          }

          successCount++;
        } catch (rowErr) {
          errors.push({ row, error: rowErr.message });
        }
      }

      await connection.commit();

      // Invalidate caches
      try {
        await redisClient.del('categories:/api/products/categories');
        await redisClient.del('home-sections:/api/products/home-sections');
        const keys = await redisClient.keys('products-list:*');
        if (keys.length > 0) await redisClient.del(keys);
      } catch (err) {
        console.error("Redis Cache invalidation failed:", err);
      }

      res.status(200).json({ 
        message: 'Bulk import processed', 
        successCount, 
        errorCount: errors.length,
        errors 
      });

    } catch (err) {
      await connection.rollback();
      console.error('Bulk import error:', err);
      res.status(500).json({ message: 'Server error during bulk import' });
    } finally {
      connection.release();
    }
  });

  // ─────────────────────────────────────────────────────────────────────────
  // DELETE /api/admin/products/:id
  // Delete existing product
  // ─────────────────────────────────────────────────────────────────────────
  router.delete('/:id', async (req, res) => {
    const connection = await db.getConnection();
    try {
      await connection.beginTransaction();
      const { id } = req.params;

      // Delete from related tables first
      await connection.query(`DELETE FROM inventory WHERE product_id = ?`, [id]);
      await connection.query(`DELETE FROM product_variants WHERE product_id = ?`, [id]);
      
      // Delete the product
      const [result] = await connection.query(`DELETE FROM products WHERE id = ?`, [id]);

      if (result.affectedRows === 0) {
        await connection.rollback();
        return res.status(404).json({ message: 'Product not found' });
      }

      await connection.commit();

      // Invalidate caches
      try {
        await redisClient.del('home-sections:/api/products/home-sections');
        const keysList = await redisClient.keys('products-list:*');
        const keysDetail = await redisClient.keys('product-detail:*');
        if (keysList.length > 0) await redisClient.del(keysList);
        if (keysDetail.length > 0) await redisClient.del(keysDetail);
      } catch (err) {
        console.error("Redis Cache invalidation failed:", err);
      }

      res.json({ message: 'Product deleted successfully' });
    } catch (err) {
      await connection.rollback();
      console.error('Error deleting product:', err);
      res.status(500).json({ message: 'Server error' });
    } finally {
      connection.release();
    }
  });

  return router;
};
