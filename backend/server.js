import dotenv from 'dotenv';
import { createApp } from './app.js';
import { ensureGeneratedTopicsTable } from './config/schema.js';

dotenv.config();

const port = process.env.PORT || 3000;
const app = createApp();

ensureGeneratedTopicsTable().catch(console.error);

app.listen(port, () => {
  console.log(`API Base: http://localhost:${port}`);
});
