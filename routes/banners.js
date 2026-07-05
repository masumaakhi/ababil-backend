const express = require('express');
const router = express.Router();
const cache = require('../middlewares/cache');

module.exports = (db) => {

  // Get home hero banners (cached for 1 hour)
  router.get('/home', cache('banners_home', 3600), async (req, res) => {
    try {
      const [rows] = await db.query("SELECT * FROM banners WHERE type = 'home' ORDER BY id ASC");
      res.json(rows);
    } catch (err) {
      console.error("Failed to fetch home banners:", err);
      res.status(500).json({ message: "Server error" });
    }
  });

  // Get category specific banners (cached for 1 hour)
  router.get('/category/:id', cache('banners_category', 3600), async (req, res) => {
    try {
      const categoryId = req.params.id;
      const [rows] = await db.query(
        "SELECT * FROM banners WHERE type = 'category' AND category_id = ? ORDER BY id ASC",
        [categoryId]
      );
      res.json(rows);
    } catch (err) {
      console.error(`Failed to fetch banners for category ${req.params.id}:`, err);
      res.status(500).json({ message: "Server error" });
    }
  });

  return router;
};
