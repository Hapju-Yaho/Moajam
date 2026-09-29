import { PrismaPg } from '@prisma/adapter-pg';
import { Injectable, type OnModuleDestroy } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { PrismaClient } from '../../generated/prisma/client.js';
import { PrismaClient as SqliteClient } from '../../generated/sqlite/client.js';
import { PrismaBetterSqlite3 } from '@prisma/adapter-better-sqlite3';

@Injectable()
export class PrismaService extends PrismaClient implements OnModuleDestroy {
  constructor(config: ConfigService) {
    if (config.get<string>('DATABASE_MODE') === 'sqlite') {
      const client = new SqliteClient({
        adapter: new PrismaBetterSqlite3({ url: config.getOrThrow<string>('DATABASE_URL') }),
      });
      Object.assign(client, { onModuleDestroy: () => client.$disconnect() });
      return client as unknown as PrismaService;
    }
    const adapter = new PrismaPg({
      connectionString: config.getOrThrow<string>('DATABASE_URL'),
      max: config.get<string>('NODE_ENV') === 'production' ? 10 : 5,
      connectionTimeoutMillis: 5_000,
      idleTimeoutMillis: 30_000,
    });

    super({ adapter });
  }

  async onModuleDestroy() {
    await this.$disconnect();
  }
}
