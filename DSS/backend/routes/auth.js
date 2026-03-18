import express from 'express';
import { randomUUID } from 'crypto';
import { pool } from '../config/database.js';
import { hashPassword, verifyPassword, issueToken } from '../utils/crypto.js';

const router = express.Router();

router.post('/register', async (req, res) => {
  const { email, password, name = null } = req.body || {};
  if (!email || !password) return res.status(400).json({ message: 'Email and password are required' });
  try {
    const existing = await pool.query('SELECT id FROM users WHERE email = $1', [email]);
    if (existing.rowCount) return res.status(409).json({ message: 'Email already exists' });

    const userId = randomUUID();
    const passwordHash = hashPassword(password);
    await pool.query('INSERT INTO users (id, email, password_hash, name) VALUES ($1, $2, $3, $4)', [userId, email, passwordHash, name]);

    const token = await issueToken(userId);
    res.json({ token, user: { id: userId, email, name } });
  } catch (err) {
    console.error(err);
    res.status(500).json({ message: 'Register failed' });
  }
});

router.post('/login', async (req, res) => {
  const { email, password } = req.body || {};
  if (!email || !password) return res.status(400).json({ message: 'Email and password are required' });
  try {
    const result = await pool.query('SELECT id, password_hash, name FROM users WHERE email = $1', [email]);
    if (!result.rowCount) return res.status(401).json({ message: 'Invalid credentials' });
    const row = result.rows[0];
    if (!verifyPassword(password, row.password_hash)) return res.status(401).json({ message: 'Invalid credentials' });

    const token = await issueToken(row.id);
    res.json({ token, user: { id: row.id, email, name: row.name } });
  } catch (err) {
    console.error(err);
    res.status(500).json({ message: 'Login failed' });
  }
});

export default router;
