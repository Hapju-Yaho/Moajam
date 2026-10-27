import {
  BadRequestException,
  ConflictException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { PrismaService } from '../common/database/prisma.service.js';
import type { Prisma } from '../generated/prisma/client.js';
import { DawProjectsService, projectAssetIds } from './daw-projects.service.js';
import { isBandScore } from './score-policy.js';
import { documentEvents, writeNotificationEvents } from './notification-events.js';

const summary = {
  id: true,
  workspaceId: true,
  songId: true,
  name: true,
  revision: true,
  createdAt: true,
  updatedAt: true,
} as const;
const conflict = '다른 멤버가 프로젝트를 수정했어요. 내 작업을 파일로 보관한 뒤 새로고침해주세요.';
const nameFields = (input: string) => {
  const name = input.trim();
  if (!name || name.length > 160)
    throw new BadRequestException('프로젝트 이름은 1~160자로 입력해주세요.');
  return { name, nameKey: name.toLocaleLowerCase('en-US') };
};
export function scoreProjectData(value: unknown): Prisma.InputJsonObject {
  if (!isBandScore(value) || JSON.stringify(value).length > 950000)
    throw new BadRequestException('악보 프로젝트 데이터를 확인해주세요.');
  return value as Prisma.InputJsonObject;
}
@Injectable()
export class ScoreProjectsService {
  constructor(
    private readonly db: PrismaService,
    private readonly bands: DawProjectsService,
  ) {}
  private async assets(tx: Prisma.TransactionClient, workspaceId: string, data: unknown) {
    const ids = projectAssetIds(data);
    if (
      (await tx.mediaAsset.count({
        where: {
          id: { in: ids },
          workspaceId,
          visibility: 'WORKSPACE',
          ready: true,
          deletedAt: null,
        },
      })) !== ids.length
    )
      throw new BadRequestException('이 밴드에 공유된 파일만 연결할 수 있어요.');
  }
  private duplicateError(error: unknown): never {
    if ((error as { code?: string }).code === 'P2002')
      throw new ConflictException('같은 이름 프로젝트가 존재합니다.');
    if ((error as { code?: string }).code === 'P2034') throw new ConflictException(conflict);
    throw error;
  }
  async ensureDefault(workspaceId: string, songId: string, user: string) {
    const song = await this.bands.song(workspaceId, songId);
    const legacyKey = `song/${songId}/score`;
    const where = { workspaceId_legacyKey: { workspaceId, legacyKey } };
    const existing = await this.db.scoreProject.findUnique({ where });
    if (existing) return;
    const source = await this.db.workspaceDocument.findUnique({
      where: { workspaceId_key: { workspaceId, key: legacyKey } },
    });
    if (!source) return;
    const data = scoreProjectData((source.value as { data?: unknown }).data);
    try {
      await this.db.$transaction(async (tx) => {
        await this.assets(tx, workspaceId, data);
        await tx.scoreProject.create({
          data: {
            workspaceId,
            songId,
            ...nameFields(song.title.slice(0, 160) || '기존 악보'),
            legacyKey,
            data,
            createdBy: source.updatedBy,
            updatedBy: user,
          },
        });
      });
    } catch (error) {
      if (
        (error as { code?: string }).code !== 'P2002' ||
        !(await this.db.scoreProject.findUnique({ where }))
      )
        this.duplicateError(error);
    }
  }
  async list(workspaceId: string, songId: string, user: string) {
    await this.bands.member(workspaceId, user);
    await this.ensureDefault(workspaceId, songId, user);
    return this.db.scoreProject.findMany({
      where: { workspaceId, songId, deletedAt: null },
      select: summary,
      orderBy: [{ createdAt: 'asc' }, { id: 'asc' }],
    });
  }
  async get(workspaceId: string, id: string, user: string) {
    await this.bands.member(workspaceId, user);
    const project = await this.db.scoreProject.findFirst({
      where: { id, workspaceId, deletedAt: null },
    });
    if (!project) throw new NotFoundException('악보 프로젝트를 찾을 수 없어요.');
    await this.bands.song(workspaceId, project.songId);
    return project;
  }
  async create(workspaceId: string, songId: string, name: string, user: string, input?: unknown) {
    await this.bands.member(workspaceId, user);
    await this.ensureDefault(workspaceId, songId, user);
    const song = await this.bands.song(workspaceId, songId);
    const data = scoreProjectData(
      input ?? {
        title: song.title,
        bpm: 120,
        notes: [],
        parts: ['Guitar', 'Vocal', 'Bass', 'Drums'],
        sync: {},
      },
    );
    try {
      return await this.db.$transaction(async (tx) => {
        await this.assets(tx, workspaceId, data);
        return tx.scoreProject.create({
          data: {
            workspaceId,
            songId,
            ...nameFields(name),
            data,
            createdBy: user,
            updatedBy: user,
          },
          select: summary,
        });
      });
    } catch (error) {
      this.duplicateError(error);
    }
  }
  async save(
    workspaceId: string,
    id: string,
    user: string,
    revision: number,
    input: unknown,
    name?: string,
  ) {
    const previous = await this.get(workspaceId, id, user);
    const data = scoreProjectData(input);
    try {
      return await this.db.$transaction(async (tx) => {
        await this.assets(tx, workspaceId, data);
        const changed = await tx.scoreProject.updateMany({
          where: { id, workspaceId, deletedAt: null, revision },
          data: {
            data,
            ...(name === undefined ? {} : nameFields(name)),
            revision: { increment: 1 },
            updatedBy: user,
          },
        });
        if (!changed.count) throw new ConflictException(conflict);
        await writeNotificationEvents(
          tx,
          workspaceId,
          user,
          documentEvents(`song/${previous.songId}/score`, previous.data, data).map((event) => ({
            ...event,
            metadata: { ...event.metadata, projectId: id },
          })),
        );
        return tx.scoreProject.findUniqueOrThrow({ where: { id } });
      });
    } catch (error) {
      this.duplicateError(error);
    }
  }
  async remove(workspaceId: string, id: string, user: string, revision: number) {
    await this.get(workspaceId, id, user);
    const changed = await this.db.scoreProject.updateMany({
      where: { id, workspaceId, revision, deletedAt: null },
      data: { deletedAt: new Date(), nameKey: null, revision: { increment: 1 }, updatedBy: user },
    });
    if (!changed.count) throw new ConflictException(conflict);
    return { ok: true };
  }
  async migrate() {
    const bands = await this.db.workspace.findMany({ select: { id: true, createdById: true } });
    let checkedSongs = 0;
    for (const band of bands) {
      const doc = await this.db.workspaceDocument.findUnique({
        where: { workspaceId_key: { workspaceId: band.id, key: 'songs' } },
      });
      const songs = (doc?.value as { data?: { id: string }[] } | null)?.data;
      if (!Array.isArray(songs)) continue;
      for (const song of songs) {
        await this.ensureDefault(band.id, song.id, band.createdById);
        checkedSongs++;
      }
    }
    return { checkedSongs };
  }
}
