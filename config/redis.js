const Redis = require("ioredis");
const RedisMock = require("ioredis-mock");

let redisClient;

// If REDIS_URL is provided in .env, use real Redis (Production)
// Otherwise, use ioredis-mock which perfectly emulates Redis in-memory (Development/Local)
if (process.env.REDIS_URL) {
  console.log("Connecting to Real Redis Cluster...");
  redisClient = new Redis(process.env.REDIS_URL);
} else {
  console.log("No REDIS_URL found. Using in-memory Redis Mock (Enterprise Dev Mode)...");
  redisClient = new RedisMock();
}

redisClient.on("error", (err) => {
  console.error("Redis Error:", err);
});

module.exports = redisClient;
