import {
  Body,
  Controller,
  Put,
  Param,
  ForbiddenException,
  ConflictException,
  BadRequestException,
} from '@nestjs/common';
import { Type } from 'class-transformer';
import {
  IsArray,
  ArrayMaxSize,
  IsString,
  IsInt,
  Min,
  IsObject,
  IsIn,
  ValidateNested,
  MaxLength,
  IsUUID,
} from 'class-validator';
import { ApiBearerAuth, ApiProperty, ApiTags, ApiOperation } from '@nestjs/swagger';
import { PrismaService } from '../common/database/prisma.service.js';
import { CurrentUser } from '../common/auth/current-user.decorator.js';
import type { AuthenticatedUser } from '../common/auth/auth.service.js';
import type { Prisma } from '../generated/prisma/client.js';
import { canWriteDocument, isWorkspaceDocumentKey } from './document-policy.js';
class SyncDocument {
  @ApiProperty() @IsString() @MaxLength(240) key!: string;
  @ApiProperty() @IsInt() @Min(0) revision!: number;
  @ApiProperty({ type: 'object', additionalProperties: true }) @IsObject() value!: {
    data: Prisma.InputJsonValue;
  };
}
class SyncMember {
  @ApiProperty() @IsUUID() userId!: string;
  @ApiProperty({ enum: ['OWNER', 'MEMBER'] }) @IsIn(['OWNER', 'MEMBER']) role!: 'OWNER' | 'MEMBER';
  @ApiProperty() @IsString() @MaxLength(80) part!: string;
}
export class WorkspaceSyncDto {
  @ApiProperty({ type: [SyncDocument] })
  @IsArray()
  @ArrayMaxSize(100)
  @ValidateNested({ each: true })
  @Type(() => SyncDocument)
  documents!: SyncDocument[];
  @ApiProperty({ type: [SyncMember] })
  @IsArray()
  @ArrayMaxSize(100)
  @ValidateNested({ each: true })
  @Type(() => SyncMember)
  members!: SyncMember[];
  @ApiProperty({ type: [String] })
  @IsArray()
  @ArrayMaxSize(100)
  @IsUUID(undefined, { each: true })
  removedMemberIds!: string[];
}
@ApiTags('Workspace sync')
@ApiBearerAuth()
@Controller('workspaces/:workspaceId/sync')
export class WorkspaceSyncController {
  constructor(private readonly db: PrismaService) {}
  @Put()
  @ApiOperation({ summary: '화면 변경을 문서·멤버 단위로 한 트랜잭션에 저장' })
  async save(
    @CurrentUser() user: AuthenticatedUser,
    @Param('workspaceId') workspaceId: string,
    @Body() dto: WorkspaceSyncDto,
  ) {
    if (new Set(dto.documents.map((d) => d.key)).size !== dto.documents.length)
      throw new BadRequestException('문서 키가 중복되었습니다.');
    try {
      return await this.db.$transaction(
        async (tx) => {
          const membership = await tx.workspaceMember.findUnique({
            where: { workspaceId_userId: { workspaceId, userId: user.id } },
          });
          if (!membership) throw new ForbiddenException('밴드 권한이 없습니다.');
          const owner = membership.role === 'OWNER';
          if ((dto.members.length || dto.removedMemberIds.length) && !owner)
            throw new ForbiddenException('관리자만 멤버를 변경할 수 있습니다.');
          if (dto.removedMemberIds.includes(user.id))
            throw new BadRequestException('본인 탈퇴는 탈퇴 메뉴를 이용해주세요.');
          for (const member of dto.members) {
            const result = await tx.workspaceMember.updateMany({
              where: { workspaceId, userId: member.userId },
              data: { role: member.role, part: member.part },
            });
            if (!result.count)
              throw new ConflictException('멤버 정보가 변경되었습니다. 다시 불러와주세요.');
          }
          await tx.workspaceMember.deleteMany({
            where: { workspaceId, userId: { in: dto.removedMemberIds } },
          });
          if (!(await tx.workspaceMember.count({ where: { workspaceId, role: 'OWNER' } })))
            throw new ConflictException('마지막 Owner는 제거할 수 없습니다.');
          const saved = [];
          for (const doc of dto.documents) {
            if (!isWorkspaceDocumentKey(doc.key) || doc.value.data === undefined)
              throw new BadRequestException('지원하지 않는 문서입니다.');
            const where = { workspaceId_key: { workspaceId, key: doc.key } };
            const before = await tx.workspaceDocument.findUnique({ where });
            if (
              !canWriteDocument(
                doc.key,
                (before?.value as { data?: unknown } | null)?.data,
                doc.value.data,
                user.id,
                owner,
              )
            )
              throw new ForbiddenException('문서 형식이나 변경 권한을 확인해주세요.');
            if (doc.revision === 0)
              saved.push(
                await tx.workspaceDocument.create({
                  data: { workspaceId, key: doc.key, value: doc.value, updatedBy: user.id },
                }),
              );
            else {
              const changed = await tx.workspaceDocument.updateMany({
                where: { workspaceId, key: doc.key, revision: doc.revision },
                data: { value: doc.value, updatedBy: user.id, revision: { increment: 1 } },
              });
              if (!changed.count)
                throw new ConflictException(
                  '다른 멤버가 수정했습니다. 변경 내용을 백업한 뒤 다시 불러와주세요.',
                );
              saved.push(await tx.workspaceDocument.findUniqueOrThrow({ where }));
            }
            if (doc.key === 'recommendations' || doc.key === 'rehearsals') {
              const previous = (before?.value as { data?: { id: string }[] } | null)?.data ?? [];
              const next = doc.value.data as { id: string; title: string }[];
              const added = next.filter((item) => !previous.some((old) => old.id === item.id));
              if (added.length) {
                const members = await tx.workspaceMember.findMany({ where: { workspaceId } });
                await tx.notification.createMany({
                  data: added.flatMap((item) =>
                    members.map((member) => ({
                      workspaceId,
                      userId: member.userId,
                      kind: doc.key === 'recommendations' ? 'RECOMMENDATION' : 'REHEARSAL',
                      entityId: item.id,
                      message:
                        `${doc.key === 'recommendations' ? '새 추천 곡' : '새 합주 일정'} · ${item.title}`.slice(
                          0,
                          500,
                        ),
                    })),
                  ),
                });
              }
            }
          }
          return { documents: saved };
        },
        { isolationLevel: 'Serializable' },
      );
    } catch (error) {
      if (['P2002', 'P2034'].includes((error as { code?: string }).code ?? ''))
        throw new ConflictException('다른 멤버의 변경과 충돌했습니다. 다시 불러와주세요.');
      throw error;
    }
  }
}
