import { defineConfig } from 'prisma/config';
import { LOCAL_DATABASE_URL } from './src/config/database-url.js';
export default defineConfig({
  schema: 'prisma/sqlite.prisma',
  datasource: { url: LOCAL_DATABASE_URL },
});
