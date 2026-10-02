import { ApiProperty, ApiBearerAuth, ApiTags } from '@nestjs/swagger';
import {
  Body,
  BadRequestException,
  Controller,
  Delete,
  ForbiddenException,
  Get,
  NotFoundException,
  Param,
  Patch,
  Post,
  Put,
  Query,
  ConflictException,
  ServiceUnavailableException,
} from '@nestjs/common';
import {
  IsOptional,
  Matches,
  IsIn,
  IsInt,
  IsObject,
  IsString,
  MaxLength,
  Min,
  MinLength,
} from 'class-validator';
import { createHash, randomBytes } from 'node:crypto';
import { PrismaService } from '../common/database/prisma.service.js';
import { CurrentUser } from '../common/auth/current-user.decorator.js';
import type { AuthenticatedUser } from '../common/auth/auth.service.js';
import type { Prisma } from '../generated/prisma/client.js';
import { canWriteDocument, isWorkspaceDocumentKey } from './document-policy.js';
import { StorageService } from '../media/storage.service.js';
import { SeparationService } from '../media/separation.service.js';
import { isBandScore } from './score-policy.js';

class CreateWorkspaceDto {
  @IsOptional() @IsString() @MaxLength(2000) description?: string;
  @IsOptional()
  @IsString()
  @MaxLength(700000)
  @Matches(/^(data:image\/(png|jpeg|webp);base64,[A-Za-z0-9+/=]+)?$/)
  photo?: string;
  @ApiProperty() @IsString() @MinLength(1) @MaxLength(80) name!: string;
}
class ProfileDto {
  @ApiProperty() @IsString() @MinLength(1) @MaxLength(80) displayName!: string;
}
class MemberDto {
  @ApiProperty() @IsIn(['OWNER', 'MEMBER']) role!: 'OWNER' | 'MEMBER';
  @ApiProperty() @IsString() @MaxLength(80) part!: string;
}
class DocumentDto {
  @ApiProperty() @IsInt() @Min(0) revision!: number;
  @ApiProperty({ type: 'object', additionalProperties: true }) @IsObject() value!: Record<
    string,
    unknown
  >;
}
class AcceptInviteDto {
  @ApiProperty() @IsString() @MinLength(40) @MaxLength(128) token!: string;
}
class ReminderDto {
  @ApiProperty() @IsString() @MinLength(1) @MaxLength(500) message!: string;
}
class PersonalScheduleDto {
  @ApiProperty({ type: 'object', additionalProperties: true }) @IsObject() value!: Record<
    string,
    unknown
  >;
}
const hash = (token: string) => createHash('sha256').update(token).digest('hex');

@ApiTags('Workspaces')
@ApiBearerAuth()
@Controller()
export class WorkspacesController {
  constructor(
    private readonly db: PrismaService,
    private readonly storage: StorageService,
    private readonly separation: SeparationService,
  ) {}
  private async membership(workspaceId: string, userId: string, owner = false) {
    const member = await this.db.workspaceMember.findUnique({
      where: { workspaceId_userId: { workspaceId, userId } },
    });
    if (!member || (owner && member.role !== 'OWNER'))
      throw new ForbiddenException('이 밴드에 대한 권한이 없습니다.');
    return member;
  }
  @Get('me') async me(@CurrentUser() user: AuthenticatedUser) {
    return this.db.profile.findUnique({ where: { id: user.id } });
  }
  @Get('me/schedules') async personalSchedules(@CurrentUser() user: AuthenticatedUser) {
    const rows = await this.db.personalSchedule.findMany({ where: { ownerId: user.id } });
    return rows.map((row) => row.value);
  }
  @Put('me/schedules/:id') async savePersonalSchedule(
    @CurrentUser() user: AuthenticatedUser,
    @Param('id') id: string,
    @Body() dto: PersonalScheduleDto,
  ) {
    const value = dto.value;
    if (
      !/^[\w-]{1,120}$/.test(id) ||
      value.id !== id ||
      typeof value.title !== 'string' ||
      !value.title.trim() ||
      value.title.length > 200 ||
      typeof value.place !== 'string' ||
      value.place.length > 1000 ||
      typeof value.goal !== 'string' ||
      value.goal.length > 5000 ||
      !canWriteDocument('rehearsals', [], [value], user.id, true)
    )
      throw new BadRequestException('일정 이름, 날짜와 시간을 확인해주세요.');
    // Never accept ownership or workspace fields from the request body.
    const data = {
      id,
      title: value.title.trim(),
      date: value.date,
      start: value.start,
      end: value.end,
      place: value.place,
      goal: value.goal,
    } as Prisma.InputJsonValue;
    return this.db.personalSchedule.upsert({
      where: { ownerId_id: { ownerId: user.id, id } },
      create: { ownerId: user.id, id, value: data },
      update: { value: data },
    });
  }
  @Delete('me/schedules/:id') async deletePersonalSchedule(
    @CurrentUser() user: AuthenticatedUser,
    @Param('id') id: string,
  ) {
    return this.db.personalSchedule.deleteMany({ where: { ownerId: user.id, id } });
  }
  @Get('notifications') async notifications(
    @CurrentUser() user: AuthenticatedUser,
    @Query('workspaceId') workspaceId?: string,
  ) {
    const memberships = await this.db.workspaceMember.findMany({
      where: { userId: user.id, ...(workspaceId ? { workspaceId } : {}) },
      select: { workspaceId: true },
    });
    return this.db.notification.findMany({
      where: { userId: user.id, workspaceId: { in: memberships.map((item) => item.workspaceId) } },
      orderBy: { createdAt: 'desc' },
      take: 50,
    });
  }
  @Post('notifications/read-all') async readAllNotifications(
    @CurrentUser() user: AuthenticatedUser,
    @Query('workspaceId') workspaceId?: string,
  ) {
    const memberships = await this.db.workspaceMember.findMany({
      where: { userId: user.id, ...(workspaceId ? { workspaceId } : {}) },
      select: { workspaceId: true },
    });
    return this.db.notification.updateMany({
      where: {
        userId: user.id,
        readAt: null,
        workspaceId: { in: memberships.map((item) => item.workspaceId) },
      },
      data: { readAt: new Date() },
    });
  }
  @Delete('notifications') async deleteAllNotifications(
    @CurrentUser() user: AuthenticatedUser,
    @Query('workspaceId') workspaceId?: string,
  ) {
    const memberships = await this.db.workspaceMember.findMany({
      where: { userId: user.id, ...(workspaceId ? { workspaceId } : {}) },
      select: { workspaceId: true },
    });
    return this.db.notification.deleteMany({
      where: { userId: user.id, workspaceId: { in: memberships.map((item) => item.workspaceId) } },
    });
  }
  @Post('notifications/:id/read') async readNotification(
    @CurrentUser() user: AuthenticatedUser,
    @Param('id') id: string,
  ) {
    return this.db.notification.updateMany({
      where: { id, userId: user.id },
      data: { readAt: new Date() },
    });
  }
  @Post('workspaces/:workspaceId/reminders') async reminder(
    @CurrentUser() user: AuthenticatedUser,
    @Param('workspaceId') workspaceId: string,
    @Body() dto: ReminderDto,
  ) {
    await this.membership(workspaceId, user.id, true);
    if (
      await this.db.notification.count({
        where: {
          workspaceId,
          createdAt: { gte: new Date(Date.now() - 60000) },
          message: dto.message,
        },
      })
    )
      throw new ConflictException('같은 알림을 방금 보냈습니다. 잠시 후 다시 시도해주세요.');
    const members = await this.db.workspaceMember.findMany({ where: { workspaceId } });
    return this.db.notification.createMany({
      data: members.map((member) => ({ workspaceId, userId: member.userId, message: dto.message })),
    });
  }
  @Put('me') async profile(@CurrentUser() user: AuthenticatedUser, @Body() dto: ProfileDto) {
    return this.db.profile.upsert({
      where: { id: user.id },
      create: { id: user.id, displayName: dto.displayName.trim() },
      update: { displayName: dto.displayName.trim() },
    });
  }
  @Get('workspaces') async list(@CurrentUser() user: AuthenticatedUser) {
    return this.db.workspace.findMany({
      where: { members: { some: { userId: user.id } } },
      include: { members: { include: { user: true } } },
      orderBy: { createdAt: 'asc' },
    });
  }
  @Post('workspaces') async create(
    @CurrentUser() user: AuthenticatedUser,
    @Body() dto: CreateWorkspaceDto,
  ) {
    if (!dto.name.trim()) throw new BadRequestException('밴드 이름을 입력해주세요.');
    return this.db.$transaction(async (tx) => {
      await tx.profile.upsert({
        where: { id: user.id },
        create: { id: user.id, displayName: user.email?.split('@')[0] ?? '뮤지션' },
        update: {},
      });
      return tx.workspace.create({
        data: {
          name: dto.name.trim(),
          createdById: user.id,
          documents: {
            create: {
              key: 'band/profile',
              value: { data: { description: dto.description ?? '', photo: dto.photo ?? '' } },
              updatedBy: user.id,
            },
          },
          members: { create: { userId: user.id, role: 'OWNER' } },
        },
        include: { members: { include: { user: true } } },
      });
    });
  }
  @Patch('workspaces/:workspaceId') async updateBand(
    @CurrentUser() user: AuthenticatedUser,
    @Param('workspaceId') workspaceId: string,
    @Body() dto: CreateWorkspaceDto,
  ) {
    await this.membership(workspaceId, user.id, true);
    if (!dto.name.trim()) throw new BadRequestException('밴드 이름을 입력해주세요.');
    return this.db.$transaction(async (tx) => {
      await tx.workspace.update({ where: { id: workspaceId }, data: { name: dto.name.trim() } });
      const value = { data: { description: dto.description ?? '', photo: dto.photo ?? '' } };
      await tx.workspaceDocument.upsert({
        where: { workspaceId_key: { workspaceId, key: 'band/profile' } },
        create: { workspaceId, key: 'band/profile', value, updatedBy: user.id },
        update: { value, updatedBy: user.id, revision: { increment: 1 } },
      });
      return { id: workspaceId };
    });
  }
  @Patch('workspaces/:workspaceId/members/:userId') async member(
    @CurrentUser() user: AuthenticatedUser,
    @Param('workspaceId') workspaceId: string,
    @Param('userId') userId: string,
    @Body() dto: MemberDto,
  ) {
    await this.membership(workspaceId, user.id, true);
    return this.db.$transaction(
      async (tx) => {
        const target = await tx.workspaceMember.findUnique({
          where: { workspaceId_userId: { workspaceId, userId } },
        });
        if (!target) throw new NotFoundException();
        if (
          target.role === 'OWNER' &&
          dto.role !== 'OWNER' &&
          (await tx.workspaceMember.count({ where: { workspaceId, role: 'OWNER' } })) <= 1
        )
          throw new ConflictException('마지막 Owner는 변경할 수 없습니다.');
        return tx.workspaceMember.update({
          where: { workspaceId_userId: { workspaceId, userId } },
          data: dto,
        });
      },
      { isolationLevel: 'Serializable' },
    );
  }
  @Delete('workspaces/:workspaceId/members/:userId') async remove(
    @CurrentUser() user: AuthenticatedUser,
    @Param('workspaceId') workspaceId: string,
    @Param('userId') userId: string,
    @Query('confirmDelete') confirmDelete?: string,
  ) {
    await this.membership(workspaceId, user.id, user.id !== userId);
    if (
      confirmDelete === 'true' &&
      (await this.db.workspaceMember.count({ where: { workspaceId } })) === 1
    ) {
      const assets = await this.db.mediaAsset.findMany({ where: { workspaceId } });
      await this.separation.stopForSources(assets.map((asset) => asset.id));
    }
    return this.db.$transaction(
      async (tx) => {
        const target = await tx.workspaceMember.findUnique({
          where: { workspaceId_userId: { workspaceId, userId } },
        });
        if (!target) throw new NotFoundException();
        const memberCount = await tx.workspaceMember.count({ where: { workspaceId } });
        if (memberCount === 1) {
          if (confirmDelete !== 'true')
            throw new ConflictException(
              '멤버가 없으면 밴드 공간도 지워집니다. 모든 데이터 삭제를 확인해주세요.',
            );
          const assets = await tx.mediaAsset.findMany({ where: { workspaceId } });
          const sourceIds = assets.map((asset) => asset.id);
          const jobs = await tx.separationJob.findMany({ where: { sourceId: { in: sourceIds } } });
          const outputIds = jobs.flatMap((job) =>
            Array.isArray(job.outputs)
              ? job.outputs.filter((id): id is string => typeof id === 'string')
              : [],
          );
          const allAssets = await tx.mediaAsset.findMany({
            where: { OR: [{ workspaceId }, { id: { in: outputIds } }] },
          });
          for (let index = 0; index < allAssets.length; index += 100) {
            const { error } = await this.storage
              .bucket()
              .remove(allAssets.slice(index, index + 100).map((asset) => asset.objectKey));
            if (error)
              throw new ServiceUnavailableException(
                '첨부 파일을 삭제하지 못했습니다. 다시 시도해주세요.',
              );
          }
          await tx.separationJob.deleteMany({
            where: { sourceId: { in: allAssets.map((asset) => asset.id) } },
          });
          await tx.mediaAsset.deleteMany({
            where: { id: { in: allAssets.map((asset) => asset.id) } },
          });
          await tx.notification.deleteMany({ where: { workspaceId } });
          // Documents, invitations and memberships are removed by the workspace foreign keys.
          await tx.workspace.delete({ where: { id: workspaceId } });
          return { removed: true, workspaceDeleted: true };
        }
        if (
          target.role === 'OWNER' &&
          (await tx.workspaceMember.count({ where: { workspaceId, role: 'OWNER' } })) <= 1
        )
          throw new ConflictException('다른 Owner에게 권한을 이전한 뒤 탈퇴해주세요.');
        await tx.workspaceMember.delete({ where: { workspaceId_userId: { workspaceId, userId } } });
        return { removed: true };
      },
      { isolationLevel: 'Serializable', timeout: 60000 },
    );
  }
  private async scoreKey(workspaceId: string, songId: string) {
    if (!/^[\w-]{1,160}$/.test(songId)) throw new BadRequestException('곡 정보를 확인해주세요.');
    const songs = await this.db.workspaceDocument.findUnique({
      where: { workspaceId_key: { workspaceId, key: 'songs' } },
    });
    const data = (songs?.value as { data?: { id: string }[] } | null)?.data;
    if (!Array.isArray(data) || !data.some((song) => song.id === songId))
      throw new NotFoundException('밴드에서 이 곡을 찾을 수 없습니다.');
    return `song/${songId}/score`;
  }
  @Get('workspaces/:workspaceId/scores/:songId')
  async score(
    @CurrentUser() user: AuthenticatedUser,
    @Param('workspaceId') workspaceId: string,
    @Param('songId') songId: string,
  ) {
    await this.membership(workspaceId, user.id);
    const key = await this.scoreKey(workspaceId, songId);
    return this.db.workspaceDocument.findUnique({
      where: { workspaceId_key: { workspaceId, key } },
    });
  }
  @Put('workspaces/:workspaceId/scores/:songId')
  async saveScore(
    @CurrentUser() user: AuthenticatedUser,
    @Param('workspaceId') workspaceId: string,
    @Param('songId') songId: string,
    @Body() dto: DocumentDto,
  ) {
    await this.membership(workspaceId, user.id);
    const key = await this.scoreKey(workspaceId, songId);
    if (!isBandScore(dto.value.data)) throw new BadRequestException('악보 데이터를 확인해주세요.');
    const value = dto.value as Prisma.InputJsonValue;
    const ids = this.practiceAssets(dto.value.data);
    const conflict =
      '다른 멤버가 악보를 수정했어요. 내 작업을 파일로 저장한 뒤 최신 악보를 불러와주세요.';
    try {
      return await this.db.$transaction(
        async (tx) => {
          // Recheck membership inside the transaction, including ordinary members.
          if (
            !(await tx.workspaceMember.findUnique({
              where: { workspaceId_userId: { workspaceId, userId: user.id } },
            }))
          )
            throw new ForbiddenException('이 밴드에 대한 권한이 없습니다.');
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
          if (dto.revision === 0)
            return tx.workspaceDocument.create({
              data: { workspaceId, key, value, updatedBy: user.id },
            });
          const changed = await tx.workspaceDocument.updateMany({
            where: { workspaceId, key, revision: dto.revision },
            data: { value, revision: { increment: 1 }, updatedBy: user.id },
          });
          if (!changed.count) throw new ConflictException(conflict);
          return tx.workspaceDocument.findUniqueOrThrow({
            where: { workspaceId_key: { workspaceId, key } },
          });
        },
        { isolationLevel: 'Serializable' },
      );
    } catch (error) {
      if (['P2002', 'P2034'].includes((error as { code?: string }).code ?? ''))
        throw new ConflictException(conflict);
      throw error;
    }
  }
  private practiceKey(songId: string) {
    if (!/^[\w-]{1,160}$/.test(songId)) throw new BadRequestException('곡 정보를 확인해주세요.');
    return `song/${songId}/soundtrack`;
  }
  private practiceAssets(value: unknown): string[] {
    const ids = new Set<string>();
    const walk = (node: unknown) => {
      if (!node || typeof node !== 'object') return;
      if ('__moajamAssetId' in node) {
        if (typeof node.__moajamAssetId !== 'string')
          throw new BadRequestException('파일 참조를 확인해주세요.');
        ids.add(node.__moajamAssetId);
      }
      Object.values(node).forEach(walk);
    };
    walk(value);
    return [...ids];
  }
  @Get('workspaces/:workspaceId/practice/:songId')
  async practice(
    @CurrentUser() user: AuthenticatedUser,
    @Param('workspaceId') workspaceId: string,
    @Param('songId') songId: string,
  ) {
    await this.membership(workspaceId, user.id);
    const key = this.practiceKey(songId);
    const where = { workspaceId_key: { workspaceId, key } };
    const existing = await this.db.workspaceDocument.findUnique({ where });
    if (existing) return existing;
    // Recover the newest previously saved band-song session. Original personal records are retained.
    const members = await this.db.workspaceMember.findMany({
      where: { workspaceId },
      select: { userId: true },
    });
    const legacy = await this.db.personalDocument.findFirst({
      where: {
        key: `practice/${workspaceId}/${songId}`,
        ownerId: { in: members.map((member) => member.userId) },
      },
      orderBy: [{ updatedAt: 'desc' }, { ownerId: 'asc' }],
    });
    if (!legacy) return null;
    const value: Record<string, Prisma.InputJsonValue> = {
      ...(legacy.value as Record<string, Prisma.InputJsonValue>),
      notes: [],
    };
    delete value.metronome;
    delete value.clickVolume;
    const ids = this.practiceAssets(value);
    try {
      return await this.db.$transaction(async (tx) => {
        const available = await tx.mediaAsset.count({
          where: {
            id: { in: ids },
            ownerId: legacy.ownerId,
            ready: true,
            deletedAt: null,
            OR: [{ workspaceId: null }, { workspaceId }],
          },
        });
        if (available !== ids.length)
          throw new BadRequestException('기존 연습실 파일을 확인해주세요.');
        await tx.mediaAsset.updateMany({
          where: { id: { in: ids }, ownerId: legacy.ownerId },
          data: { workspaceId, visibility: 'WORKSPACE' },
        });
        return tx.workspaceDocument.create({
          data: { workspaceId, key, value: { data: value }, updatedBy: user.id },
        });
      });
    } catch (error) {
      if ((error as { code?: string }).code === 'P2002')
        return this.db.workspaceDocument.findUniqueOrThrow({ where });
      throw error;
    }
  }
  @Put('workspaces/:workspaceId/practice/:songId')
  async savePractice(
    @CurrentUser() user: AuthenticatedUser,
    @Param('workspaceId') workspaceId: string,
    @Param('songId') songId: string,
    @Body() dto: DocumentDto,
  ) {
    await this.membership(workspaceId, user.id);
    const key = this.practiceKey(songId);
    const input = dto.value.data;
    if (
      !input ||
      typeof input !== 'object' ||
      Array.isArray(input) ||
      !Array.isArray((input as Record<string, unknown>).tracks) ||
      JSON.stringify(input).length > 950000
    )
      throw new BadRequestException('연습실 데이터를 확인해주세요.');
    const value: Record<string, Prisma.InputJsonValue> = {
      ...(input as Record<string, Prisma.InputJsonValue>),
    };
    delete value.metronome;
    delete value.clickVolume;
    const ids = this.practiceAssets(value);
    try {
      return await this.db.$transaction(async (tx) => {
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
        if (dto.revision === 0)
          return tx.workspaceDocument.create({
            data: { workspaceId, key, value: { data: value }, updatedBy: user.id },
          });
        const changed = await tx.workspaceDocument.updateMany({
          where: { workspaceId, key, revision: dto.revision },
          data: { value: { data: value }, revision: { increment: 1 }, updatedBy: user.id },
        });
        if (!changed.count)
          throw new ConflictException(
            '서버에 변경사항이 존재합니다. 새로고침 후 공유하기를 눌러주세요.',
          );
        return tx.workspaceDocument.findUniqueOrThrow({
          where: { workspaceId_key: { workspaceId, key } },
        });
      });
    } catch (error) {
      if ((error as { code?: string }).code === 'P2002')
        throw new ConflictException(
          '서버에 변경사항이 존재합니다. 새로고침 후 공유하기를 눌러주세요.',
        );
      throw error;
    }
  }
  @Get('workspaces/:workspaceId/documents') async documents(
    @CurrentUser() user: AuthenticatedUser,
    @Param('workspaceId') workspaceId: string,
  ) {
    await this.membership(workspaceId, user.id);
    return this.db.workspaceDocument.findMany({ where: { workspaceId }, orderBy: { key: 'asc' } });
  }
  @Put('workspaces/:workspaceId/documents/:key') async saveDocument(
    @CurrentUser() user: AuthenticatedUser,
    @Param('workspaceId') workspaceId: string,
    @Param('key') key: string,
    @Body() dto: DocumentDto,
  ) {
    const member = await this.membership(workspaceId, user.id);
    if (!isWorkspaceDocumentKey(key)) throw new ForbiddenException('지원하지 않는 문서입니다.');
    return this.db.$transaction(async (tx) => {
      const existing = await tx.workspaceDocument.findUnique({
        where: { workspaceId_key: { workspaceId, key } },
      });
      const previous = (existing?.value as { data?: unknown } | null)?.data;
      if (!canWriteDocument(key, previous, dto.value.data, user.id, member.role === 'OWNER'))
        throw new ForbiddenException('문서 형식이나 변경 권한을 확인해주세요.');
      if (dto.revision === 0) {
        try {
          return await tx.workspaceDocument.create({
            data: {
              workspaceId,
              key,
              value: dto.value as Prisma.InputJsonValue,
              updatedBy: user.id,
            },
          });
        } catch (error) {
          if ((error as { code?: string }).code === 'P2002')
            throw new ConflictException(
              '다른 멤버가 먼저 저장했습니다. 새로 불러온 뒤 다시 시도해주세요.',
            );
          throw error;
        }
      }
      const result = await tx.workspaceDocument.updateMany({
        where: { workspaceId, key, revision: dto.revision },
        data: {
          value: dto.value as Prisma.InputJsonValue,
          revision: { increment: 1 },
          updatedBy: user.id,
        },
      });
      if (!result.count)
        throw new ConflictException(
          '다른 멤버의 변경 내용이 있습니다. 새로 불러온 뒤 다시 시도해주세요.',
        );
      return tx.workspaceDocument.findUniqueOrThrow({
        where: { workspaceId_key: { workspaceId, key } },
      });
    });
  }
  @Post('workspaces/:workspaceId/invitations') async invite(
    @CurrentUser() user: AuthenticatedUser,
    @Param('workspaceId') workspaceId: string,
  ) {
    await this.membership(workspaceId, user.id, true);
    const token = randomBytes(32).toString('base64url');
    const invitation = await this.db.workspaceInvitation.create({
      data: { workspaceId, tokenHash: hash(token), expiresAt: new Date(Date.now() + 7 * 86400000) },
    });
    return { id: invitation.id, token, expiresAt: invitation.expiresAt };
  }
  @Get('workspaces/:workspaceId/invitations') async invitations(
    @CurrentUser() user: AuthenticatedUser,
    @Param('workspaceId') workspaceId: string,
  ) {
    await this.membership(workspaceId, user.id, true);
    return this.db.workspaceInvitation.findMany({
      where: { workspaceId },
      select: { id: true, expiresAt: true, revoked: true, createdAt: true },
    });
  }
  @Delete('workspaces/:workspaceId/invitations/:id') async revoke(
    @CurrentUser() user: AuthenticatedUser,
    @Param('workspaceId') workspaceId: string,
    @Param('id') id: string,
  ) {
    await this.membership(workspaceId, user.id, true);
    return this.db.workspaceInvitation.updateMany({
      where: { id, workspaceId },
      data: { revoked: true },
    });
  }
  @Post('invitations/accept') async accept(
    @CurrentUser() user: AuthenticatedUser,
    @Body() dto: AcceptInviteDto,
  ) {
    return this.db.$transaction(
      async (tx) => {
        const invite = await tx.workspaceInvitation.findUnique({
          where: { tokenHash: hash(dto.token) },
        });
        if (!invite || invite.revoked || invite.expiresAt <= new Date())
          throw new NotFoundException('만료되었거나 취소된 초대입니다.');
        await tx.profile.upsert({
          where: { id: user.id },
          create: { id: user.id, displayName: user.email?.split('@')[0] ?? '뮤지션' },
          update: {},
        });
        await tx.workspaceMember.upsert({
          where: { workspaceId_userId: { workspaceId: invite.workspaceId, userId: user.id } },
          create: { workspaceId: invite.workspaceId, userId: user.id, role: 'MEMBER' },
          update: {},
        });
        return { workspaceId: invite.workspaceId };
      },
      { isolationLevel: 'Serializable' },
    );
  }
}
