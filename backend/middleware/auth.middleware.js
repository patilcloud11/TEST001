/**
 * JWT Authentication Middleware
 * Verifies the Bearer token on protected routes
 */

const jwt = require('jsonwebtoken');
const { docClient, TABLES } = require('../config/dynamodb');
const { GetCommand } = require('@aws-sdk/lib-dynamodb');

const authenticate = async (req, res, next) => {
  try {
    const authHeader = req.headers.authorization;
    if (!authHeader || !authHeader.startsWith('Bearer ')) {
      return res.status(401).json({ error: 'No token provided' });
    }

    const token = authHeader.split(' ')[1];
    const decoded = jwt.verify(token, process.env.JWT_SECRET);

    // Fetch fresh user data from DynamoDB
    const { Item: user } = await docClient.send(
      new GetCommand({ TableName: TABLES.USERS, Key: { userId: decoded.userId } })
    );

    if (!user || !user.isActive) {
      return res.status(401).json({ error: 'User not found or deactivated' });
    }

    // Attach user to request context
    req.user = {
      userId: user.userId,
      email: user.email,
      name: user.name,
      familyId: user.familyId,
      role: user.role,
    };
    next();
  } catch (err) {
    if (err.name === 'JsonWebTokenError' || err.name === 'TokenExpiredError') {
      return res.status(401).json({ error: 'Invalid or expired token' });
    }
    next(err);
  }
};

// Require family admin role
const requireAdmin = (req, res, next) => {
  if (req.user.role !== 'admin') {
    return res.status(403).json({ error: 'Admin access required' });
  }
  next();
};

module.exports = { authenticate, requireAdmin };
