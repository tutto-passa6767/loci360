import { loadEnvConfig } from '@next/env';
import { resolve } from 'node:path';

// Development: the monorepo keeps one .env at the root. In containers there is no file and nothing is loaded.
loadEnvConfig(resolve(process.cwd(), '../..'), process.env.NODE_ENV !== 'production');
