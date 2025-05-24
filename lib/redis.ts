import Redis from "ioredis";

const getRedisUrl = () => {
  if (process.env.REDIS_URL) {
    return process.env.REDIS_URL;
  }

  throw new Error("REDIS_URL is not defined");
};

// Create Redis instance
const redis = new Redis(getRedisUrl());

// Handle Redis connection events
redis.on("connect", () => {
  console.log("Redis client connected");
});

redis.on("error", (error) => {
  console.error("Redis client error:", error);
});

export default redis;
