const redisClient = require("../config/redis");

/**
 * Cache middleware for Express routes.
 * @param {string} keyPrefix - The prefix for the cache key (e.g., 'categories'). If empty, uses req.originalUrl.
 * @param {number} duration - Time to live in seconds (default 3600 = 1 hour).
 */
const cacheMiddleware = (keyPrefix = "", duration = 3600) => {
  return async (req, res, next) => {
    // Only cache GET requests
    if (req.method !== "GET") {
      return next();
    }

    const key = keyPrefix ? `${keyPrefix}:${req.originalUrl}` : req.originalUrl;

    try {
      const cachedData = await redisClient.get(key);
      if (cachedData) {
        // Cache Hit
        // console.log(`[Cache Hit] ${key}`);
        return res.json(JSON.parse(cachedData));
      }

      // Cache Miss
      // console.log(`[Cache Miss] ${key}`);
      
      // Intercept the res.json to save to Redis before sending to client
      const originalJson = res.json.bind(res);
      res.json = (body) => {
        // Only cache successful responses (HTTP 200)
        if (res.statusCode >= 200 && res.statusCode < 300) {
          redisClient.setex(key, duration, JSON.stringify(body)).catch(err => {
            console.error("Redis setex error:", err);
          });
        }
        return originalJson(body);
      };

      next();
    } catch (err) {
      console.error("Redis Cache Middleware Error:", err);
      // Fallback to DB if Redis fails
      next();
    }
  };
};

module.exports = cacheMiddleware;
