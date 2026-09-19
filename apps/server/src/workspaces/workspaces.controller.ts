import {
  Body,
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
import { IsIn, IsInt, IsObject, IsString, MaxLength, Min, MinLength } from 'class-validator';
import { createHash, randomBytes } from 'node:crypto';
import { PrismaService } from '../common/database/prisma.service.js';
import { CurrentUser } from '../common/auth/current-user.decorator.js';
import type { AuthenticatedUser } from '../common/auth/supabase.service.js';
import type { Prisma } from '../generated/prisma/client.js';
import { canWriteDocument } from './document-policy.js';
import { StorageService } from '../media/storage.service.js';
import { SeparationService } from '../media/separation.service.js';

class CreateWorkspaceDto {
  @IsString() @MinLength(1) @MaxLength(80) name!: string;
}
class ProfileDto {
  @IsString() @MinLength(1) @MaxLength(80) displayName!: string;
}
class MemberDto {
  @IsIn(['OWNER', 'MEMBER']) role!: 'OWNER' | 'MEMBER';
  @IsString() @MaxLength(80) part!: string;
}
class DocumentDto {
  @IsInt() @Min(0) revision!: number;
  @IsObject() value!: Record<string, unknown>;
}
class AcceptInviteDto {
  @IsString() @MinLength(40) @MaxLength(128) token!: string;
}
class ReminderDto {
  @IsString() @MinLength(1) @MaxLength(500) message!: string;
}
const hash = (token: string) => createHash('sha256').update(token).digest('hex');

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
  @Get('notifications') async notifications(@CurrentUser() user: AuthenticatedUser) {
    const memberships = await this.db.workspaceMember.findMany({
      where: { userId: user.id },
      select: { workspaceId: true },
    });
    return this.db.notification.findMany({
      where: { userId: user.id, workspaceId: { in: memberships.map((item) => item.workspaceId) } },
      orderBy: { createdAt: 'desc' },
      take: 50,
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
          members: { create: { userId: user.id, role: 'OWNER' } },
        },
        include: { members: { include: { user: true } } },
      });
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
    if (
      !/^(recommendations|songs|rehearsals|song\/[\w-]+\/(discussion|checks|arrangement|links)|session\/[\w-]+\/(memo|members|checks|tasks)|recommendation\/[\w-]+\/comments)$/.test(
        key,
      )
    )
      throw new ForbiddenException('지원하지 않는 문서입니다.');
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
