import {
  Injectable,
  ServiceUnavailableException,
  ConflictException,
  type OnModuleDestroy,
  type OnModuleInit,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { spawn, type ChildProcess } from 'node:child_process';
import { mkdtemp, writeFile, readFile, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { randomUUID } from 'node:crypto';
import { PrismaService } from '../common/database/prisma.service.js';
import { StorageService } from './storage.service.js';
@Injectable()
export class SeparationService implements OnModuleDestroy, OnModuleInit {
  private running = new Map<string, ChildProcess>();
  private cancelled = new Set<string>();
  private executions = new Map<string, Promise<void>>();
  private queue = Promise.resolve();
  private accepting = true;
  constructor(
    private readonly db: PrismaService,
    private readonly storage: StorageService,
    private readonly config: ConfigService,
  ) {}
  async onModuleInit() {
    if (this.config.get<string>('ENABLE_MEDIA_WORKER') !== 'true') return;
    await this.db.separationJob.updateMany({
      where: { status: 'RUNNING' },
      data: { status: 'FAILED', error: '작업 서버가 재시작되었습니다. 다시 요청해주세요.' },
    });
    const waiting = await this.db.separationJob.findMany({
      where: { status: 'QUEUED' },
      orderBy: { createdAt: 'asc' },
    });
    for (const job of waiting) this.queue = this.queue.then(() => this.run(job.id)).catch(() => {});
  }
  async enqueue(ownerId: string, sourceId: string, instrument: string) {
    if (this.config.get<string>('ENABLE_MEDIA_WORKER') !== 'true' || !this.accepting)
      throw new ServiceUnavailableException('음원 분리 작업 서버가 연결되지 않았습니다.');
    if (
      (await this.db.separationJob.count({
        where: { ownerId, status: { in: ['QUEUED', 'RUNNING'] } },
      })) >= 2
    )
      throw new ConflictException('동시에 두 작업까지 요청할 수 있습니다.');
    const job = await this.db.separationJob.create({ data: { ownerId, sourceId, instrument } });
    this.queue = this.queue.then(() => this.run(job.id)).catch(() => {});
    return job;
  }
  async cancel(id: string) {
    const result = await this.db.separationJob.updateMany({
      where: { id, status: { in: ['QUEUED', 'RUNNING'] } },
      data: { status: 'CANCELLED' },
    });
    if (!result.count)
      throw new ConflictException('이미 종료된 작업입니다. 목록을 새로 확인해주세요.');
    this.cancelled.add(id);
    this.running.get(id)?.kill();
    return { cancelled: true };
  }
  async onModuleDestroy() {
    this.accepting = false;
    for (const [id, child] of this.running) {
      this.cancelled.add(id);
      child.kill();
      await this.db.separationJob.updateMany({
        where: { id, status: 'RUNNING' },
        data: {
          status: 'FAILED',
          error: '서버가 종료되어 작업을 중단했습니다. 다시 요청해주세요.',
        },
      });
    }
  }
  async stopForSources(sourceIds: string[]) {
    const jobs = await this.db.separationJob.findMany({ where: { sourceId: { in: sourceIds } } });
    for (const job of jobs) {
      this.cancelled.add(job.id);
      this.running.get(job.id)?.kill();
    }
    await Promise.all(jobs.map((job) => this.executions.get(job.id)));
  }
  private run(id: string) {
    const execution = this.execute(id).finally(() => this.executions.delete(id));
    this.executions.set(id, execution);
    return execution;
  }
  private async execute(id: string) {
    if (!this.accepting || this.cancelled.has(id)) return;
    let directory: string | undefined;
    try {
      const job = await this.db.separationJob.findUniqueOrThrow({ where: { id } });
      if (job.status !== 'QUEUED') return;
      await this.db.separationJob.update({ where: { id }, data: { status: 'RUNNING' } });
      const source = await this.db.mediaAsset.findUniqueOrThrow({ where: { id: job.sourceId } });
      if (source.deletedAt) throw new Error();
      const response = await fetch(await this.storage.signed(source.objectKey), {
        signal: AbortSignal.timeout(60000),
      });
      if (!response.ok) throw new Error();
      const data = Buffer.from(await response.arrayBuffer());
      if (data.length > 104857600) throw new Error();
      directory = await mkdtemp(join(tmpdir(), 'moajam-separation-'));
      const input = join(directory, 'source.audio');
      await writeFile(input, data);
      if (this.cancelled.has(id)) return;
      await new Promise<void>((resolve, reject) => {
        const child = spawn(
          this.config.get<string>('MEDIA_PYTHON') ?? 'python',
          [
            '-m',
            'demucs',
            '-n',
            'htdemucs_6s',
            '--two-stems',
            job.instrument,
            '--out',
            directory!,
            input,
          ],
          { windowsHide: true, stdio: 'ignore' },
        );
        this.running.set(id, child);
        const timeout = setTimeout(() => {
          child.kill();
          reject(new Error('timeout'));
        }, 1800000);
        child.on('error', () => {
          clearTimeout(timeout);
          reject(new Error('worker'));
        });
        child.on('exit', (code) => {
          clearTimeout(timeout);
          if (code === 0) resolve();
          else reject(new Error('worker'));
        });
      });
      if (this.cancelled.has(id)) return;
      const outputs: string[] = [];
      for (const stem of [job.instrument, `no_${job.instrument}`]) {
        if (this.cancelled.has(id)) return;
        const blob = await readFile(join(directory, 'htdemucs_6s', 'source', `${stem}.wav`));
        const objectKey = `${job.ownerId}/${randomUUID()}`;
        const { error } = await this.storage
          .bucket()
          .upload(objectKey, blob, { contentType: 'audio/wav' });
        if (error) throw new Error();
        if (this.cancelled.has(id)) {
          await this.storage.bucket().remove([objectKey]);
          return;
        }
        const asset = await this.db.mediaAsset.create({
          data: {
            ownerId: job.ownerId,
            workspaceId: source.workspaceId,
            scope: 'extraction',
            objectKey,
            name: `${stem}.wav`,
            mime: 'audio/wav',
            size: blob.length,
            ready: true,
          },
        });
        outputs.push(asset.id);
        await this.db.separationJob.update({ where: { id }, data: { outputs } });
      }
      if (!this.cancelled.has(id))
        await this.db.separationJob.update({
          where: { id },
          data: { status: 'SUCCEEDED', outputs },
        });
    } catch {
      if (!this.cancelled.has(id))
        await this.db.separationJob.updateMany({
          where: { id, status: 'RUNNING' },
          data: {
            status: 'FAILED',
            error:
              '분리하지 못했습니다. 파일 형식, 작업 서버와 저장소 연결을 확인한 뒤 다시 요청해주세요.',
          },
        });
    } finally {
      this.running.delete(id);
      if (directory) await rm(directory, { recursive: true, force: true });
    }
  }
}
