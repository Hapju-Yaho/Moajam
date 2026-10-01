import { ApiProperty, ApiPropertyOptional, ApiBearerAuth, ApiTags } from '@nestjs/swagger';
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
  Query,
  ServiceUnavailableException,
  BadRequestException,
} from '@nestjs/common';
import {
  IsIn,
  IsInt,
  IsOptional,
  IsString,
  IsUUID,
  Max,
  MaxLength,
  Min,
  MinLength,
} from 'class-validator';
import { randomUUID } from 'node:crypto';
import { PrismaService } from '../common/database/prisma.service.js';
import { CurrentUser } from '../common/auth/current-user.decorator.js';
import type { AuthenticatedUser } from '../common/auth/auth.service.js';
import { StorageService } from './storage.service.js';
import { SeparationService } from './separation.service.js';
class UploadDto {
  @ApiProperty() @IsString() @MaxLength(255) name!: string;
  @ApiProperty() @IsString() @MaxLength(120) mime!: string;
  @ApiProperty() @IsInt() @Min(1) @Max(104857600) size!: number;
  @ApiProperty() @IsString() @MaxLength(240) scope!: string;
  @ApiPropertyOptional() @IsOptional() @IsUUID() workspaceId?: string;
}
class RenameAssetDto {
  @IsString() @MinLength(1) @MaxLength(255) name!: string;
}
class VisibilityDto {
  @ApiProperty() @IsIn(['PRIVATE', 'WORKSPACE']) visibility!: 'PRIVATE' | 'WORKSPACE';
}
class JobDto {
  @ApiProperty({ format: 'uuid' }) @IsUUID() sourceId!: string;
  @ApiProperty() @IsIn(['vocals', 'drums', 'bass', 'guitar', 'piano', 'other']) instrument!: string;
}
@ApiTags('Media')
@ApiBearerAuth()
@Controller()
export class MediaController {
  constructor(
    private readonly db: PrismaService,
    private readonly storage: StorageService,
    private readonly separation: SeparationService,
  ) {}
  private async asset(id: string, user: string, write = false) {
    const asset = await this.db.mediaAsset.findUnique({ where: { id } });
    if (!asset || asset.deletedAt) throw new NotFoundException();
    if (asset.ownerId === user) return asset;
    if (
      write ||
      asset.visibility !== 'WORKSPACE' ||
      !asset.workspaceId ||
      !(await this.db.workspaceMember.findUnique({
        where: { workspaceId_userId: { workspaceId: asset.workspaceId, userId: user } },
      }))
    )
      throw new ForbiddenException();
    return asset;
  }
  @Post('assets/uploads') async upload(
    @CurrentUser() user: AuthenticatedUser,
    @Body() dto: UploadDto,
  ) {
    if (
      !/^(audio\/(mpeg|wav|x-wav|webm|ogg|mp4|aac|flac)|image\/(png|jpeg|webp)|application\/(pdf|xml|vnd.recordare.musicxml\+xml)|text\/xml)$/.test(
        dto.mime,
      )
    )
      throw new BadRequestException('지원하지 않는 파일 형식입니다.');
    if (
      dto.workspaceId &&
      !(await this.db.workspaceMember.findUnique({
        where: { workspaceId_userId: { workspaceId: dto.workspaceId, userId: user.id } },
      }))
    )
      throw new ForbiddenException();
    const objectKey = `${user.id}/${randomUUID()}`;
    const { data, error } = await this.storage.bucket().createSignedUploadUrl(objectKey);
    if (error || !data) throw new ServiceUnavailableException('업로드를 준비하지 못했습니다.');
    const asset = await this.db.mediaAsset.create({
      data: { ...dto, ownerId: user.id, objectKey },
    });
    return { assetId: asset.id, signedUrl: data.signedUrl };
  }
  @Post('assets/:id/complete') async complete(
    @CurrentUser() user: AuthenticatedUser,
    @Param('id') id: string,
  ) {
    const asset = await this.asset(id, user.id, true);
    const { data, error } = await this.storage.bucket().info(asset.objectKey);
    if (error || !data) throw new BadRequestException('업로드한 파일을 찾을 수 없습니다.');
    if (Number(data.metadata?.size) !== asset.size)
      throw new BadRequestException('업로드 파일 크기가 다릅니다.');
    if (String(data.metadata?.mimetype ?? '').split(';')[0] !== asset.mime)
      throw new BadRequestException('업로드 파일 형식이 다릅니다.');
    return this.db.mediaAsset.update({ where: { id }, data: { ready: true } });
  }
  @Get('assets') async list(
    @CurrentUser() user: AuthenticatedUser,
    @Query('scope') scope: string,
    @Query('workspaceId') workspaceId?: string,
  ) {
    if (!scope || scope.length > 240) throw new BadRequestException('자료 범위가 필요합니다.');
    if (
      workspaceId &&
      !(await this.db.workspaceMember.findUnique({
        where: { workspaceId_userId: { workspaceId, userId: user.id } },
      }))
    )
      throw new ForbiddenException();
    return this.db.mediaAsset.findMany({
      where: {
        scope,
        ...(workspaceId ? { workspaceId } : {}),
        ready: true,
        deletedAt: null,
        OR: [
          { ownerId: user.id },
          ...(workspaceId ? [{ workspaceId, visibility: 'WORKSPACE' }] : []),
        ],
      },
      select: {
        id: true,
        name: true,
        mime: true,
        size: true,
        ownerId: true,
        visibility: true,
        createdAt: true,
      },
      orderBy: { createdAt: 'desc' },
    });
  }
  @Get('assets/:id/download') async download(
    @CurrentUser() user: AuthenticatedUser,
    @Param('id') id: string,
  ) {
    const asset = await this.asset(id, user.id);
    if (!asset.ready) throw new BadRequestException('업로드가 완료되지 않았습니다.');
    return { url: await this.storage.signed(asset.objectKey) };
  }
  @Patch('assets/:id/visibility') async visibility(
    @CurrentUser() user: AuthenticatedUser,
    @Param('id') id: string,
    @Body() dto: VisibilityDto,
  ) {
    const asset = await this.asset(id, user.id, true);
    if (
      dto.visibility === 'WORKSPACE' &&
      (!asset.workspaceId ||
        !(await this.db.workspaceMember.findUnique({
          where: { workspaceId_userId: { workspaceId: asset.workspaceId, userId: user.id } },
        })))
    )
      throw new ForbiddenException();
    return this.db.mediaAsset.update({ where: { id }, data: dto });
  }
  @Patch('assets/:id/name') async rename(
    @CurrentUser() user: AuthenticatedUser,
    @Param('id') id: string,
    @Body() dto: RenameAssetDto,
  ) {
    await this.asset(id, user.id, true);
    if (!dto.name.trim()) throw new BadRequestException('클립 이름을 입력해주세요.');
    return this.db.mediaAsset.update({ where: { id }, data: { name: dto.name.trim() } });
  }
  @Delete('assets/:id') async remove(
    @CurrentUser() user: AuthenticatedUser,
    @Param('id') id: string,
  ) {
    await this.asset(id, user.id, true);
    return this.db.mediaAsset.update({ where: { id }, data: { deletedAt: new Date() } });
  }
  @Post('separation-jobs') async createJob(
    @CurrentUser() user: AuthenticatedUser,
    @Body() dto: JobDto,
  ) {
    const asset = await this.asset(dto.sourceId, user.id);
    if (!asset.ready || !asset.mime.startsWith('audio/'))
      throw new BadRequestException('준비된 오디오 파일을 선택해주세요.');
    return this.separation.enqueue(user.id, dto.sourceId, dto.instrument);
  }
  @Get('separation-jobs') async jobs(@CurrentUser() user: AuthenticatedUser) {
    return this.db.separationJob.findMany({
      where: { ownerId: user.id },
      orderBy: { createdAt: 'desc' },
      take: 30,
    });
  }
  @Post('separation-jobs/:id/cancel') async cancel(
    @CurrentUser() user: AuthenticatedUser,
    @Param('id') id: string,
  ) {
    const job = await this.db.separationJob.findUnique({ where: { id } });
    if (!job || job.ownerId !== user.id) throw new NotFoundException();
    return this.separation.cancel(id);
  }
}
