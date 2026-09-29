import { Injectable, NotFoundException, UnauthorizedException } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { DatabaseSync } from 'node:sqlite';
import { mkdirSync } from 'node:fs';
import { join } from 'node:path';
import { randomBytes, randomUUID, createHash } from 'node:crypto';
import { DATA_DIRECTORY } from '../../config/database-url.js';

@Injectable()
export class TemporaryAuthService {
  private db?: DatabaseSync;
  constructor(private readonly config: ConfigService) {}
  private database() {
    if (
      this.config.get('AUTH_MODE') !== 'temporary' ||
      this.config.get('NODE_ENV') === 'production'
    )
      throw new NotFoundException('임시 로그인은 개발 환경에서만 사용할 수 있습니다.');
    if (!this.db) {
      mkdirSync(DATA_DIRECTORY, { recursive: true });
      this.db = new DatabaseSync(join(DATA_DIRECTORY, 'auth.db'));
      this.db.exec(`PRAGMA journal_mode=WAL;
        CREATE TABLE IF NOT EXISTS temporary_users(id TEXT PRIMARY KEY, resume_hash TEXT UNIQUE NOT NULL);
        CREATE TABLE IF NOT EXISTS temporary_sessions(hash TEXT PRIMARY KEY, user_id TEXT NOT NULL, expires INTEGER NOT NULL);`);
    }
    return this.db;
  }
  private hash(token: string) {
    return createHash('sha256').update(token).digest('hex');
  }
  login(resumeKey?: string) {
    const db = this.database();
    let user: { id: string };
    if (resumeKey) {
      const existing = db
        .prepare('SELECT id FROM temporary_users WHERE resume_hash=?')
        .get(this.hash(resumeKey)) as { id: string } | undefined;
      if (!existing)
        throw new UnauthorizedException(
          '임시 계정을 복구할 수 없습니다. 이 브라우저의 임시 로그인 정보를 확인해주세요.',
        );
      user = existing;
    } else {
      resumeKey = randomBytes(32).toString('base64url');
      user = { id: randomUUID() };
      db.prepare('INSERT INTO temporary_users VALUES(?,?)').run(user.id, this.hash(resumeKey));
    }
    const token = `temporary_${randomBytes(32).toString('base64url')}`;
    const expiresAt = Date.now() + 7 * 86400000;
    db.prepare('DELETE FROM temporary_sessions WHERE expires<?').run(Date.now());
    db.prepare('INSERT INTO temporary_sessions VALUES(?,?,?)').run(
      this.hash(token),
      user.id,
      expiresAt,
    );
    return { token, resumeKey, expiresAt, user: { ...user, provider: 'temporary' as const } };
  }
  verify(token: string) {
    const user = this.database()
      .prepare('SELECT user_id AS id FROM temporary_sessions WHERE hash=? AND expires>?')
      .get(this.hash(token), Date.now()) as { id: string } | undefined;
    if (!user) throw new UnauthorizedException('임시 로그인이 만료되었습니다. 다시 시작해주세요.');
    return { ...user, provider: 'temporary' as const };
  }
  logout(token: string) {
    this.database().prepare('DELETE FROM temporary_sessions WHERE hash=?').run(this.hash(token));
    return { ok: true };
  }
  onModuleDestroy() {
    this.db?.close();
  }
}
