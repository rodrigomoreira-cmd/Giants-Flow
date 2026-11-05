const Redis = require('ioredis');
require('dotenv').config();

const redisClient = new Redis({
  host: process.env.REDIS_HOST || 'redis',
  port: Number(process.env.REDIS_PORT) || 6379,
  maxRetriesPerRequest: 3,
  retryStrategy(times) {
    return Math.min(times * 50, 2000);
  },
  lazyConnect: true,
});

redisClient.on('connect', () => {
  console.log('🟢 Redis conectado com sucesso!');
});

redisClient.on('error', (err) => {
  console.warn('⚠️ Aviso Redis:', err.message);
});

module.exports = { redisClient };
