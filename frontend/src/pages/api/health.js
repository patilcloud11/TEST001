/**
 * Health Check Endpoint — ALB Target Group Health Check
 * Path: GET /api/health
 * Returns 200 OK so AWS ALB knows this instance is alive and ready.
 *
 * File location: pages/api/health.js
 */

export default function handler(req, res) {
  // Only allow GET requests
  if (req.method !== 'GET') {
    return res.status(405).json({ error: 'Method not allowed' });
  }

  res.status(200).json({
    status: 'ok',
    service: 'frontend',
    environment: process.env.NODE_ENV || 'unknown',
    timestamp: new Date().toISOString(),
  });
}
