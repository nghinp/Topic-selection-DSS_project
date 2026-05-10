import { pool } from '../config/database.js';
import { isUuid } from '../utils/crypto.js';
import dotenv from 'dotenv';

dotenv.config();

const ADMIN_EMAILS = (process.env.ADMIN_EMAILS || '')
  .split(',')
  .map((email) => email.trim().toLowerCase())
  .filter(Boolean);

export function getBearerToken(req) {
  const header = req.header('authorization') || req.header('Authorization');
  if (!header) return null;
  const parts = header.split(' ');
  if (parts.length === 2 && /^Bearer$/i.test(parts[0])) {
    return parts[1];
  }
  return null;
}

export async function getUserByToken(token) {
  if (!token) return null;
  if (!isUuid(token)) return null;
  try {
    const result = await pool.query(
      `SELECT t.user_id AS id, u.email AS email, t.token AS token
         FROM auth_tokens t
         LEFT JOIN users u ON u.id = t.user_id
        WHERE t.token = $1`,
      [token]
    );
    if (!result.rowCount) return null;
    return result.rows[0];
  } catch (err) {
    console.error('getUserByToken failed', err);
    return null;
  }
}

export async function requireAuth(req, res, next) {
  const user = await getUserByToken(getBearerToken(req));
  if (!user) return res.status(401).json({ message: 'Unauthorized' });
  req.userId = user.id;
  req.userEmail = user.email;
  req.authToken = user.token;
  next();
}

export async function requireAuthOptional(req, res, next) {
  const user = await getUserByToken(getBearerToken(req));
  if (user) {
    req.userId = user.id;
    req.userEmail = user.email;
    req.authToken = user.token;
  }
  next();
}

export async function requireAdmin(req, res, next) {
  const user = await getUserByToken(getBearerToken(req));
  if (!user) return res.status(401).json({ message: 'Unauthorized' });
  const email = user.email?.toLowerCase() || '';
  if (ADMIN_EMAILS.length && !ADMIN_EMAILS.includes(email)) {
    return res.status(403).json({ message: 'Forbidden' });
  }
  req.userId = user.id;
  req.userEmail = user.email;
  req.authToken = user.token;
  next();
}
