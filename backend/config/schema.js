import { pool } from './database.js';

export async function ensureGeneratedTopicsTable() {
  await pool.query(`
    CREATE TABLE IF NOT EXISTS generated_topics (
      id UUID PRIMARY KEY,
      user_id UUID,
      title TEXT NOT NULL,
      review_data JSONB NOT NULL,
      created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
    )
  `);
}
