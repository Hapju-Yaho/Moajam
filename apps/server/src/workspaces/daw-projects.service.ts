import {
  BadRequestException,
  ConflictException,
  ForbiddenException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { PrismaService } from '../common/database/prisma.service.js';
import type { Prisma } from '../generated/prisma/client.js';
import { documentEvents, writeNotificationEvents } from './notification-events.js';

export function projectData(input: unknown): Prisma.InputJsonObject {
  if (
    !input ||
    typeof input !== 'object' ||
    Array.isArray(input) ||
    !Array.isArray((input as { tracks?: unknown }).tracks) ||
    JSON.stringify(input).length > 950000
  )
    throw new BadRequestException('프로젝트 데이터를 확인해주세요.');
  const data = { ...input } as Record<string, Prisma.InputJsonValue>;
  delete data.metronome;
  delete data.clickVolume;
  return data;
}
export function projectAssetIds(data: unknown): string[] {
  const ids = new Set<string>();
  const walk = (node: unknown) => {
    if (!node || typeof node !== 'object') return;
    if ('__moajamAssetId' in node) {
      if (
        typeof node.__moajamAssetId !== 'string' ||
        !/^[0-9a-f]{8}-[0-9a-f-]{27}$/i.test(node.__moajamAssetId)
      )
        throw new BadRequestException('파일 참조를 확인해주세요.');
      ids.add(node.__moajamAssetId);
    }
    Object.values(node).forEach(walk);
  };
  walk(data);
  return [...ids];
}
const summary = {
  id: true,
  workspaceId: true,
  songId: true,
  name: true,
  revision: true,
  createdAt: true,
  updatedAt: true,
  createdBy: true,
  legacyKey: true,
} as const;

@Injectable()
export class DawProjectsService {
  constructor(private readonly db: PrismaService) {}
  async member(workspaceId: string, user: string) {
    const member = await this.db.workspaceMember.findUnique({
      where: { workspaceId_userId: { workspaceId, userId: user } },
    });
    if (!member) throw new ForbiddenException('이 밴드에 대한 권한이 없습니다.');
    return member;
  }
  async song(workspaceId: string, songId: string) {
    if (!/^[\w-]{1,160}$/.test(songId)) throw new BadRequestException('곡 정보를 확인해주세요.');
    const doc = await this.db.workspaceDocument.findUnique({
      where: { workspaceId_key: { workspaceId, key: 'songs' } },
    });
    const songs = (doc?.value as { data?: { id: string; title: string }[] } | null)?.data;
    const song = Array.isArray(songs) ? songs.find((item) => item.id === songId) : undefined;
    if (!song) throw new NotFoundException('밴드에서 이 곡을 찾을 수 없습니다.');
    return song;
  }
  async ensureDefault(workspaceId: string, songId: string, user: string) {
    const song = await this.song(workspaceId, songId);
    const legacyKey = `song/${songId}/soundtrack`;
    const where = { workspaceId_legacyKey: { workspaceId, legacyKey } };
    const existing = await this.db.dawProject.findUnique({ where });
    // A removed default is retained as a tombstone; never resurrect old data.
    if (existing) return existing;
    const source = await this.db.workspaceDocument.findUnique({
      where: { workspaceId_key: { workspaceId, key: legacyKey } },
    });
    const members = source
      ? []
      : await this.db.workspaceMember.findMany({
          where: { workspaceId },
          select: { userId: true },
        });
    const legacy = source
      ? null
      : await this.db.personalDocument.findFirst({
          where: {
            key: `practice/${workspaceId}/${songId}`,
            ownerId: { in: members.map((item) => item.userId) },
          },
          orderBy: [{ updatedAt: 'desc' }, { ownerId: 'asc' }],
        });
    if (!source && !legacy) return null;
    const data = projectData(
      source
        ? (source.value as { data: unknown }).data
        : legacy
          ? { ...(legacy.value as object), notes: [] }
          : { tracks: [], notes: [] },
    );
    const ids = projectAssetIds(data);
    try {
      return await this.db.$transaction(async (tx) => {
        const available = await tx.mediaAsset.count({
          where: legacy
            ? {
                id: { in: ids },
                ownerId: legacy.ownerId,
                ready: true,
                deletedAt: null,
                OR: [{ workspaceId: null }, { workspaceId }],
              }
            : {
                id: { in: ids },
                workspaceId,
                visibility: 'WORKSPACE',
                ready: true,
                deletedAt: null,
              },
        });
        if (available !== ids.length)
          throw new BadRequestException('기존 작업실 파일을 확인해주세요.');
        if (legacy)
          await tx.mediaAsset.updateMany({
            where: { id: { in: ids }, ownerId: legacy.ownerId },
            data: { workspaceId, visibility: 'WORKSPACE' },
          });
        return tx.dawProject.create({
          data: {
            workspaceId,
            songId,
            legacyKey,
            name: song.title.slice(0, 160),
            data,
            createdBy: source?.updatedBy ?? legacy?.ownerId ?? user,
            updatedBy: user,
          },
        });
      });
    } catch (error) {
      if ((error as { code?: string }).code === 'P2002')
        return this.db.dawProject.findUniqueOrThrow({ where });
      throw error;
    }
  }
  async list(workspaceId: string, songId: string, user: string) {
    await this.member(workspaceId, user);
    await this.ensureDefault(workspaceId, songId, user);
    return this.db.dawProject.findMany({
      where: { workspaceId, songId, deletedAt: null },
      select: summary,
      orderBy: [{ createdAt: 'asc' }, { id: 'asc' }],
    });
  }
  async get(workspaceId: string, id: string, user: string) {
    await this.member(workspaceId, user);
    const project = await this.db.dawProject.findFirst({
      where: { id, workspaceId, deletedAt: null },
    });
    if (!project) throw new NotFoundException('프로젝트를 찾을 수 없습니다.');
    return project;
  }
  async create(workspaceId: string, songId: string, name: string, user: string, input?: unknown) {
    await this.member(workspaceId, user);
    await this.song(workspaceId, songId);
    const data = projectData(input ?? { tracks: [], notes: [] });
    const ids = projectAssetIds(data);
    if (
      (await this.db.mediaAsset.count({
        where: {
          id: { in: ids },
          workspaceId,
          visibility: 'WORKSPACE',
          ready: true,
          deletedAt: null,
        },
      })) !== ids.length
    )
      throw new BadRequestException('이 밴드에 공유된 파일만 연결할 수 있습니다.');
    return this.db.dawProject.create({
      data: {
        workspaceId,
        songId,
        name: this.name(name),
        data,
        createdBy: user,
        updatedBy: user,
      },
      select: summary,
    });
  }
  private name(name: string) {
    if (!name.trim() || name.trim().length > 160)
      throw new BadRequestException('프로젝트 이름은 1~160자로 입력해주세요.');
    return name.trim();
  }
  async save(
    workspaceId: string,
    id: string,
    user: string,
    revision: number,
    input: unknown,
    name?: string,
  ) {
    await this.member(workspaceId, user);
    const data = projectData(input);
    const ids = projectAssetIds(data);
    return this.db.$transaction(async (tx) => {
      const previous = await tx.dawProject.findFirst({
        where: { id, workspaceId, deletedAt: null },
      });
      if (!previous) throw new NotFoundException('프로젝트를 찾을 수 없습니다.');
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
        throw new BadRequestException('이 밴드에 공유된 파일만 연결할 수 있습니다.');
      const changed = await tx.dawProject.updateMany({
        where: { id, workspaceId, revision, deletedAt: null },
        data: {
          data,
          ...(name === undefined ? {} : { name: this.name(name) }),
          revision: { increment: 1 },
          updatedBy: user,
        },
      });
      if (!changed.count)
        throw new ConflictException(
          '서버에 변경사항이 존재합니다. 새로고침 후 공유하기를 눌러주세요.',
        );
      await writeNotificationEvents(
        tx,
        workspaceId,
        user,
        documentEvents(`song/${previous.songId}/soundtrack`, previous.data, data).map((event) => ({
          ...event,
          metadata: { ...event.metadata, projectId: id },
        })),
      );
      return tx.dawProject.findUniqueOrThrow({ where: { id } });
    });
  }
  async rename(workspaceId: string, id: string, user: string, name: string, revision: number) {
    await this.get(workspaceId, id, user);
    const changed = await this.db.dawProject.updateMany({
      where: { id, workspaceId, revision, deletedAt: null },
      data: { name: this.name(name), revision: { increment: 1 }, updatedBy: user },
    });
    if (!changed.count)
      throw new ConflictException('프로젝트가 변경되었습니다. 목록을 새로고침해주세요.');
    return this.db.dawProject.findUniqueOrThrow({ where: { id }, select: summary });
  }
  async duplicate(workspaceId: string, id: string, user: string) {
    const source = await this.get(workspaceId, id, user);
    return this.db.dawProject.create({
      data: {
        workspaceId,
        songId: source.songId,
        name: `${source.name.slice(0, 156)} 복사본`,
        data: source.data as Prisma.InputJsonValue,
        createdBy: user,
        updatedBy: user,
      },
      select: summary,
    });
  }
  async remove(workspaceId: string, id: string, user: string, revision: number) {
    await this.get(workspaceId, id, user);
    const changed = await this.db.dawProject.updateMany({
      where: { id, workspaceId, revision, deletedAt: null },
      data: { deletedAt: new Date(), revision: { increment: 1 }, updatedBy: user },
    });
    if (!changed.count)
      throw new ConflictException('프로젝트가 변경되었습니다. 목록을 새로고침해주세요.');
    return { ok: true };
  }
  async migrate() {
    const workspaces = await this.db.workspace.findMany({
      select: { id: true, createdById: true },
    });
    let projects = 0;
    for (const band of workspaces) {
      const songs = await this.db.workspaceDocument.findUnique({
        where: { workspaceId_key: { workspaceId: band.id, key: 'songs' } },
      });
      const rows = (songs?.value as { data?: { id: string }[] } | null)?.data;
      if (!Array.isArray(rows)) continue;
      for (const song of rows) {
        await this.ensureDefault(band.id, song.id, band.createdById);
        projects++;
      }
    }
    return { checkedSongs: projects };
  }
}
