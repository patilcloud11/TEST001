/**
 * Health Check Route — ALB Target Group Health Check
 * Path: GET /api/health
 *
 * File location: src/routes/health.js
 *
 * AWS ALB hits this endpoint every 30 seconds.
 * Must return HTTP 200 or the instance is marked unhealthy.
 */

const express = require('express');
const router = express.Router();
const os = require('os');

router.get('/api/health', (req, res) => {
  res.status(200).json({
    status: 'ok',
    service: 'backend',
    environment: process.env.NODE_ENV || 'unknown',
    region: process.env.AWS_REGION || 'unknown',
    hostname: os.hostname(),
    uptime: Math.floor(process.uptime()),
    timestamp: new Date().toISOString(),
  });
});

module.exports = router;
