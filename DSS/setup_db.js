import dotenv from 'dotenv';
dotenv.config({ path: './backend/.env' });

import { pool } from './backend/config/database.js';

async function setup() {
  try {
    await pool.query(`
      CREATE TABLE IF NOT EXISTS saved_generations (
        id UUID PRIMARY KEY,
        user_id UUID NOT NULL,
        title TEXT NOT NULL,
        review_data JSONB NOT NULL,
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
      )
    `);
    console.log("Table created");
    process.exit(0);
  } catch (err) {
    console.error(err);
    process.exit(1);
  }
}
setup();
