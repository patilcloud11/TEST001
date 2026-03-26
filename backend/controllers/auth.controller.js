/**
 * Authentication Controller
 * Handles signup, login, and profile operations
 */

const bcrypt = require('bcryptjs');
const jwt = require('jsonwebtoken');
const { v4: uuidv4 } = require('uuid');
const { docClient, TABLES } = require('../config/dynamodb');
const { PutCommand, GetCommand, QueryCommand, UpdateCommand } = require('@aws-sdk/lib-dynamodb');

// ─── Helper: Generate JWT ────────────────────────────────────────────────────
const generateToken = (userId) =>
  jwt.sign({ userId }, process.env.JWT_SECRET, {
    expiresIn: process.env.JWT_EXPIRES_IN || '7d',
  });

// ─── SIGNUP ──────────────────────────────────────────────────────────────────
const signup = async (req, res) => {
  try {
    const { name, email, password, familyName } = req.body;

    // Check if email already exists via GSI
    const { Items: existing } = await docClient.send(
      new QueryCommand({
        TableName: TABLES.USERS,
        IndexName: 'email-index',
        KeyConditionExpression: 'email = :email',
        ExpressionAttributeValues: { ':email': email.toLowerCase() },
        Limit: 1,
      })
    );

    if (existing && existing.length > 0) {
      return res.status(409).json({ error: 'Email already registered' });
    }

    const userId = uuidv4();
    const familyId = uuidv4();
    const hashedPassword = await bcrypt.hash(password, 12);
    const now = new Date().toISOString();

    // Create the family first
    await docClient.send(
      new PutCommand({
        TableName: TABLES.FAMILIES,
        Item: {
          familyId,
          name: familyName || `${name}'s Family`,
          adminUserId: userId,
          members: [userId],
          monthlyBudget: 50000, // Default ₹50,000
          currency: 'INR',
          createdAt: now,
          updatedAt: now,
        },
      })
    );

    // Create the user
    await docClient.send(
      new PutCommand({
        TableName: TABLES.USERS,
        Item: {
          userId,
          email: email.toLowerCase(),
          name,
          password: hashedPassword,
          familyId,
          role: 'admin',
          isActive: true,
          createdAt: now,
          updatedAt: now,
        },
      })
    );

    const token = generateToken(userId);

    res.status(201).json({
      message: 'Account created successfully',
      token,
      user: { userId, email: email.toLowerCase(), name, familyId, role: 'admin' },
    });
  } catch (err) {
    console.error('Signup error:', err);
    res.status(500).json({ error: 'Failed to create account' });
  }
};

// ─── LOGIN ────────────────────────────────────────────────────────────────────
const login = async (req, res) => {
  try {
    const { email, password } = req.body;

    // Look up user by email via GSI
    const { Items } = await docClient.send(
      new QueryCommand({
        TableName: TABLES.USERS,
        IndexName: 'email-index',
        KeyConditionExpression: 'email = :email',
        ExpressionAttributeValues: { ':email': email.toLowerCase() },
        Limit: 1,
      })
    );

    if (!Items || Items.length === 0) {
      return res.status(401).json({ error: 'Invalid email or password' });
    }

    const user = Items[0];

    if (!user.isActive) {
      return res.status(403).json({ error: 'Account deactivated' });
    }

    const isPasswordValid = await bcrypt.compare(password, user.password);
    if (!isPasswordValid) {
      return res.status(401).json({ error: 'Invalid email or password' });
    }

    const token = generateToken(user.userId);

    // Update last login timestamp
    await docClient.send(
      new UpdateCommand({
        TableName: TABLES.USERS,
        Key: { userId: user.userId },
        UpdateExpression: 'SET lastLoginAt = :now',
        ExpressionAttributeValues: { ':now': new Date().toISOString() },
      })
    );

    res.json({
      message: 'Login successful',
      token,
      user: {
        userId: user.userId,
        email: user.email,
        name: user.name,
        familyId: user.familyId,
        role: user.role,
      },
    });
  } catch (err) {
    console.error('Login error:', err);
    res.status(500).json({ error: 'Login failed' });
  }
};

// ─── GET PROFILE ──────────────────────────────────────────────────────────────
const getProfile = async (req, res) => {
  try {
    const { Item: user } = await docClient.send(
      new GetCommand({ TableName: TABLES.USERS, Key: { userId: req.user.userId } })
    );

    if (!user) return res.status(404).json({ error: 'User not found' });

    // Strip password from response
    const { password: _, ...safeUser } = user;

    // Fetch family details too
    const { Item: family } = await docClient.send(
      new GetCommand({ TableName: TABLES.FAMILIES, Key: { familyId: user.familyId } })
    );

    res.json({ user: safeUser, family });
  } catch (err) {
    console.error('Get profile error:', err);
    res.status(500).json({ error: 'Failed to fetch profile' });
  }
};

// ─── UPDATE PROFILE ───────────────────────────────────────────────────────────
const updateProfile = async (req, res) => {
  try {
    const { name, currentPassword, newPassword } = req.body;
    const updates = { updatedAt: new Date().toISOString() };
    let updateExpr = 'SET updatedAt = :updatedAt';
    const exprVals = { ':updatedAt': updates.updatedAt };

    if (name) {
      updateExpr += ', #n = :name';
      exprVals[':name'] = name;
    }

    if (newPassword) {
      // Verify current password first
      const { Item: user } = await docClient.send(
        new GetCommand({ TableName: TABLES.USERS, Key: { userId: req.user.userId } })
      );
      const valid = await bcrypt.compare(currentPassword, user.password);
      if (!valid) return res.status(400).json({ error: 'Current password is incorrect' });
      updateExpr += ', password = :password';
      exprVals[':password'] = await bcrypt.hash(newPassword, 12);
    }

    await docClient.send(
      new UpdateCommand({
        TableName: TABLES.USERS,
        Key: { userId: req.user.userId },
        UpdateExpression: updateExpr,
        ExpressionAttributeValues: exprVals,
        ...(name && { ExpressionAttributeNames: { '#n': 'name' } }),
      })
    );

    res.json({ message: 'Profile updated successfully' });
  } catch (err) {
    console.error('Update profile error:', err);
    res.status(500).json({ error: 'Failed to update profile' });
  }
};

module.exports = { signup, login, getProfile, updateProfile };
