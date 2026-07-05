const express = require('express');
const router = express.Router();
const multer = require('multer');
const { verifyAdmin } = require('../middleware/auth');
const { uploadToCloudinary } = require('../utils/cloudinary');
const redisClient = require('../config/redis');

const upload = multer({ storage: multer.memoryStorage() });

// Invalidate all banner caches
async function invalidateBannerCache() {
  try {
    // 1. Delete home banner cache
    await redisClient.del('banners_home:/api/banners/home');
    
    // 2. Delete category banner caches
    const keys = await redisClient.keys('banners_category:*');
    if (keys.length > 0) {
      await redisClient.del(keys);
    }
    console.log("Successfully invalidated banner cache in Redis!");
  } catch (err) {
    console.error("Failed to invalidate banner cache in Redis:", err);
  }
}

module.exports = (db) => {
  // Require admin auth for all endpoints
  router.use(verifyAdmin);

  // GET /api/admin/banners
  // List all banners with parent category name
  router.get('/', async (req, res) => {
    try {
      const [rows] = await db.query(`
        SELECT b.*, c.name_en AS category_name_en 
        FROM banners b 
        LEFT JOIN categories c ON b.category_id = c.id 
        ORDER BY b.id DESC
      `);
      res.json(rows);
    } catch (err) {
      console.error("Admin fetch banners error:", err);
      res.status(500).json({ message: "Server error" });
    }
  });

  // GET /api/admin/banners/:id
  // Fetch details of a single banner
  router.get('/:id', async (req, res) => {
    try {
      const { id } = req.params;
      const [rows] = await db.query('SELECT * FROM banners WHERE id = ?', [id]);
      if (rows.length === 0) {
        return res.status(404).json({ message: "Banner not found" });
      }
      res.json(rows[0]);
    } catch (err) {
      console.error("Admin fetch banner by id error:", err);
      res.status(500).json({ message: "Server error" });
    }
  });

  // POST /api/admin/banners
  // Create new banner
  router.post('/', upload.single('image'), async (req, res) => {
    try {
      const {
        title_en,
        title_bn,
        desc_en,
        desc_bn,
        badge_en,
        badge_bn,
        type,
        category_id
      } = req.body;

      if (!req.file) {
        return res.status(400).json({ message: "Image is required" });
      }

      console.log("Uploading banner image to Cloudinary...");
      const imageUrl = await uploadToCloudinary(req.file.buffer, 'ababil-shop/banners');
      console.log("Uploaded secure URL:", imageUrl);

      const categoryVal = type === 'category' ? (category_id || null) : null;

      const [result] = await db.query(
        `INSERT INTO banners (image, title_en, title_bn, desc_en, desc_bn, badge_en, badge_bn, type, category_id) 
         VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`,
        [
          imageUrl,
          title_en || null,
          title_bn || null,
          desc_en || null,
          desc_bn || null,
          badge_en || null,
          badge_bn || null,
          type || 'home',
          categoryVal
        ]
      );

      // Invalidate cache
      await invalidateBannerCache();

      res.status(201).json({ message: "Banner created successfully", id: result.insertId });
    } catch (err) {
      console.error("Admin create banner error:", err);
      res.status(500).json({ message: "Server error" });
    }
  });

  // PUT /api/admin/banners/:id
  // Update banner details
  router.put('/:id', upload.single('image'), async (req, res) => {
    try {
      const { id } = req.params;
      const {
        title_en,
        title_bn,
        desc_en,
        desc_bn,
        badge_en,
        badge_bn,
        type,
        category_id
      } = req.body;

      // Check if banner exists
      const [existing] = await db.query('SELECT * FROM banners WHERE id = ?', [id]);
      if (existing.length === 0) {
        return res.status(404).json({ message: "Banner not found" });
      }

      let imageUrl = existing[0].image;
      if (req.file) {
        console.log("Uploading new banner image to Cloudinary...");
        imageUrl = await uploadToCloudinary(req.file.buffer, 'ababil-shop/banners');
      }

      const categoryVal = type === 'category' ? (category_id || null) : null;

      await db.query(
        `UPDATE banners 
         SET image = ?, title_en = ?, title_bn = ?, desc_en = ?, desc_bn = ?, badge_en = ?, badge_bn = ?, type = ?, category_id = ? 
         WHERE id = ?`,
        [
          imageUrl,
          title_en || null,
          title_bn || null,
          desc_en || null,
          desc_bn || null,
          badge_en || null,
          badge_bn || null,
          type || 'home',
          categoryVal,
          id
        ]
      );

      // Invalidate cache
      await invalidateBannerCache();

      res.json({ message: "Banner updated successfully" });
    } catch (err) {
      console.error("Admin update banner error:", err);
      res.status(500).json({ message: "Server error" });
    }
  });

  // DELETE /api/admin/banners/:id
  // Delete banner
  router.delete('/:id', async (req, res) => {
    try {
      const { id } = req.params;
      const [result] = await db.query('DELETE FROM banners WHERE id = ?', [id]);
      if (result.affectedRows === 0) {
        return res.status(404).json({ message: "Banner not found" });
      }

      // Invalidate cache
      await invalidateBannerCache();

      res.json({ message: "Banner deleted successfully" });
    } catch (err) {
      console.error("Admin delete banner error:", err);
      res.status(500).json({ message: "Server error" });
    }
  });

  return router;
};
