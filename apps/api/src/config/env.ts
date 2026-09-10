import path from 'node:path';
import { fileURLToPath } from 'node:url';
import dotenv from 'dotenv';
import { z } from 'zod';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

// Carrega o .env localizado na raiz do projeto ou diretório corrente
dotenv.config({ path: path.resolve(__dirname, '../../../../.env') });
dotenv.config();

const envSchema = z.object({
  NODE_ENV: z.enum(['development', 'test', 'production']).default('development'),
  API_PORT: z.coerce.number().int().positive().default(3333),
  WEB_PORT: z.coerce.number().int().positive().default(5173),
  DATABASE_URL: z.string().default('file:../../data/app.db'),
  GOOGLE_CLIENT_ID: z.string().optional().default(''),
  GOOGLE_CLIENT_SECRET: z.string().optional().default(''),
  GOOGLE_REDIRECT_URI: z.string().default('http://localhost:3333/api/auth/google/callback'),
  DEFAULT_TIMEZONE: z.string().default('America/Recife'),
  DEFAULT_MINIMUM_LEAD_MINUTES: z.coerce.number().int().min(0).default(10),
});

export const env = envSchema.parse(process.env);
