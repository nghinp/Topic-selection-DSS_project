import { scryptSync, randomBytes, timingSafeEqual, randomUUID } from 'crypto';
import { pool } from '../config/database.js';

export function hashPassword(password) {
  const salt = randomBytes(16);
  const hash = scryptSync(password, salt, 64);
  return `${salt.toString('hex')}:${hash.toString('hex')}`;
}

export function verifyPassword(password, stored) {
  if (!stored || !stored.includes(':')) return false;
  const [saltHex, hashHex] = stored.split(':');
  const salt = Buffer.from(saltHex, 'hex');
  const hash = Buffer.from(hashHex, 'hex');
  const testHash = scryptSync(password, salt, 64);
  return timingSafeEqual(hash, testHash);
}

export async function issueToken(userId) {
  const token = randomUUID();
  await pool.query('INSERT INTO auth_tokens (token, user_id) VALUES ($1, $2)', [token, userId]);
  return token;
}

export function isUuid(value) {
  if (!value || typeof value !== 'string') return false;
  return /^[0-9a-fA-F]{8}-[0-9a-fA-F]{4}-[1-5][0-9a-fA-F]{3}-[89abAB][0-9a-fA-F]{3}-[0-9a-fA-F]{12}$/.test(value);
}
