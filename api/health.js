'use strict';
const store = require('./store');

module.exports = async function handler(req, res) {
  if (req.method !== 'GET') {
    res.setHeader('Allow', 'GET');
    return res.status(405).json({ success: false, message: 'Method not allowed.' });
  }

  const redisConfigured = Boolean(process.env.UPSTASH_REDIS_REST_URL && process.env.UPSTASH_REDIS_REST_TOKEN);
  const emailConfigured = Boolean(process.env.EMAIL_USER && process.env.EMAIL_PASS);

  try {
    await store.listRegs();
    return res.status(200).json({
      success: true,
      status: 'ok',
      api: 'online',
      storage: store.backend || 'unknown',
      redisConfigured,
      emailConfigured,
    });
  } catch (error) {
    console.error('[health] storage check failed:', error);
    return res.status(503).json({
      success: false,
      status: 'degraded',
      api: 'online',
      storage: 'error',
      redisConfigured,
      emailConfigured,
      errorType: error?.name || 'Error',
      errorMessage: process.env.NODE_ENV === 'production' ? 'Database connection is unavailable.' : String(error?.message || error),
    });
  }
};
