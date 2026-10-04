import {
  Body,
  Controller,
  Get,
  Put,
  Param,
  BadRequestException,
  ConflictException,
} from '@nestjs/common';
import { ApiBearerAuth, ApiOkResponse, ApiOperation, ApiProperty, ApiTags } from '@nestjs/swagger';
import { Allow, IsInt, Min, IsObject } from 'class-validator';
import { PrismaService } from '../common/database/prisma.service.js';
import { CurrentUser } from '../common/auth/current-user.decorator.js';
import type { AuthenticatedUser } from '../common/auth/auth.service.js';
import type { Prisma } from '../generated/prisma/client.js';
import { ProfilePhotoService, type PreparedPhoto } from './profile-photo.service.js';
import {
  OnboardingDto,
  OnboardingStateDto,
  profileParts,
  validatePhoto,
} from './onboarding.dto.js';

export class PersonalWriteDto {
  @ApiProperty({ minimum: 0, description: '최초 저장 0, 이후 현재 revision' })
  @IsInt()
  @Min(0)
  revision!: number;
  @ApiProperty({
    type: 'object',
    additionalProperties: true,
    description: '개인 악보/연습 기록. 파일은 소유한 Asset 참조로만 저장.',
  })
  @Allow()
  value!: Prisma.InputJsonValue;
}
export class PreferencesDto {
  @ApiProperty({ type: 'object', additionalProperties: true })
  @IsObject()
  value!: Record<string, unknown>;
  @ApiProperty({ minimum: 0 }) @IsInt() @Min(0) revision!: number;
}
export function validatePersonalKey(key: string) {
  if (
    key.length > 240 ||
    !/^(preferences|(?:score|practice|library)\/[\w/.-]+)$/.test(key) ||
    key.includes('..')
  )
    throw new BadRequestException('지원하지 않는 개인 기록입니다.');
}
function validatePreferences(value: Record<string, unknown>) {
  const strings = { name: 80, bio: 2000, photo: 700000 };
  const flags = ['push', 'email', 'reminder', 'metronome'];
  const ranges: Record<string, [number, number]> = {
    bpm: [20, 400],
    countIn: [0, 16],
    volume: [0, 1],
  };
  for (const [key, field] of Object.entries(value)) {
    if (key in strings) {
      if (typeof field !== 'string' || field.length > strings[key as keyof typeof strings])
        throw new BadRequestException('프로필 입력을 확인해주세요.');
      if (key === 'photo') validatePhoto(field);
    } else if (key === 'parts') {
      if (
        !Array.isArray(field) ||
        field.length < 1 ||
        field.length > 6 ||
        new Set(field).size !== field.length ||
        field.some((part) => typeof part !== 'string' || !profileParts.includes(part))
      )
        throw new BadRequestException('담당 세션을 하나 이상 선택해주세요.');
    } else if (flags.includes(key)) {
      if (typeof field !== 'boolean') throw new BadRequestException('설정을 확인해주세요.');
    } else if (key in ranges) {
      if (
        typeof field !== 'number' ||
        !Number.isFinite(field) ||
        field < ranges[key][0] ||
        field > ranges[key][1]
      )
        throw new BadRequestException('연습 설정을 확인해주세요.');
    } else throw new BadRequestException('지원하지 않는 설정입니다.');
  }
  if (typeof value.name !== 'string' || !value.name.trim())
    throw new BadRequestException('이름을 입력해주세요.');
}
@ApiTags('Personal storage')
@ApiBearerAuth()
@Controller('me')
export class PersonalController {
  constructor(
    private readonly db: PrismaService,
    private readonly photos: ProfilePhotoService,
  ) {}
  @Get('onboarding')
  @ApiOperation({ summary: '내 첫 로그인 설정과 완료 여부 조회' })
  @ApiOkResponse({ type: OnboardingStateDto })
  async onboarding(@CurrentUser() user: AuthenticatedUser) {
    const profile = await this.db.profile.findUnique({ where: { id: user.id } });
    return {
      displayName: profile?.displayName ?? '',
      photo: profile?.avatarUrl ?? '',
      parts: profile?.parts ?? [],
      completed: !!profile?.onboardingCompletedAt,
      completedAt: profile?.onboardingCompletedAt?.toISOString() ?? null,
    };
  }
  @Put('onboarding')
  @ApiOperation({
    summary: '첫 로그인 설정 완료: 이름·사진·복수 담당 세션 저장',
    description:
      '인증된 본인만 저장. 이름과 세션 1개 이상 필수. 사진은 빈 문자열로 생략/제거. 프로필과 개인 설정을 같은 트랜잭션에서 반영하며 재요청 시 최초 완료 시각 유지.',
  })
  @ApiOkResponse({ type: OnboardingStateDto })
  async completeOnboarding(@CurrentUser() user: AuthenticatedUser, @Body() dto: OnboardingDto) {
    if (!dto?.displayName.trim()) throw new BadRequestException('이름을 입력해주세요.');
    validatePhoto(dto.photo);
    const displayName = dto.displayName.trim();
    const photo = await this.photos.prepare(user.id, dto.photo);
    const profile = await this.db
      .$transaction(async (tx) => {
        const previous = await tx.profile.findUnique({ where: { id: user.id } });
        const data = {
          displayName,
          avatarUrl: photo.value || null,
          parts: dto.parts,
          onboardingCompletedAt: previous?.onboardingCompletedAt ?? new Date(),
        };
        const saved = await tx.profile.upsert({
          where: { id: user.id },
          create: { id: user.id, ...data },
          update: data,
        });
        const where = { ownerId_key: { ownerId: user.id, key: 'preferences' } };
        const preferences = await tx.personalDocument.findUnique({ where });
        const value = {
          ...((preferences?.value as Record<string, Prisma.InputJsonValue>) ?? {}),
          name: displayName,
          photo: photo.value,
          parts: dto.parts,
        };
        await tx.personalDocument.upsert({
          where,
          create: { ownerId: user.id, key: 'preferences', value },
          update: { value, revision: { increment: 1 } },
        });
        return saved;
      })
      .catch(async (error) => {
        await this.photos.discard(photo);
        throw error;
      });
    return {
      displayName: profile.displayName,
      photo: profile.avatarUrl ?? '',
      parts: profile.parts,
      completed: true,
      completedAt: profile.onboardingCompletedAt!.toISOString(),
    };
  }
  @Get('documents/:key')
  @ApiOperation({ summary: '내 악보·연습 기록 조회. 없는 기록은 null' })
  get(@CurrentUser() user: AuthenticatedUser, @Param('key') key: string) {
    validatePersonalKey(key);
    return this.db.personalDocument.findUnique({
      where: { ownerId_key: { ownerId: user.id, key } },
    });
  }
  @Put('documents/:key')
  @ApiOperation({ summary: '내 악보·연습 기록 저장 (revision 충돌 409)' })
  async save(
    @CurrentUser() user: AuthenticatedUser,
    @Param('key') key: string,
    @Body() dto: PersonalWriteDto,
  ) {
    validatePersonalKey(key);
    if (dto.value === undefined || dto.value === null || JSON.stringify(dto.value).length > 950000)
      throw new BadRequestException('저장할 기록을 확인해주세요.');
    if (key === 'preferences') validatePreferences(dto.value as Record<string, unknown>);
    const assets = new Set<string>();
    const walk = (node: unknown) => {
      if (!node || typeof node !== 'object') return;
      if ('__moajamAssetId' in node) {
        if (typeof node.__moajamAssetId !== 'string')
          throw new BadRequestException('파일 참조가 올바르지 않습니다.');
        assets.add(node.__moajamAssetId);
      }
      Object.values(node).forEach(walk);
    };
    walk(dto.value);
    if (
      assets.size &&
      (await this.db.mediaAsset.count({
        where: { id: { in: [...assets] }, ownerId: user.id, ready: true, deletedAt: null },
      })) !== assets.size
    )
      throw new BadRequestException('본인의 준비된 파일만 개인 기록에 연결할 수 있습니다.');
    let photo: PreparedPhoto | undefined;
    if (key === 'preferences') {
      const value = dto.value as Record<string, Prisma.InputJsonValue>;
      if (typeof value.photo === 'string') {
        photo = await this.photos.prepare(user.id, value.photo);
        dto = { ...dto, value: { ...value, photo: photo.value } };
      }
    }
    try {
      return await this.db.$transaction(async (tx) => {
        const where = { ownerId_key: { ownerId: user.id, key } };
        let document;
        if (dto.revision === 0)
          document = await tx.personalDocument.create({
            data: { ownerId: user.id, key, value: dto.value },
          });
        else {
          const result = await tx.personalDocument.updateMany({
            where: { ownerId: user.id, key, revision: dto.revision },
            data: { value: dto.value, revision: { increment: 1 } },
          });
          if (!result.count)
            throw new ConflictException(
              '다른 기기에서 수정한 기록이 있습니다. 현재 내용을 내보낸 뒤 다시 불러와주세요.',
            );
          document = await tx.personalDocument.findUniqueOrThrow({ where });
        }
        if (key === 'preferences') {
          const displayName = String((dto.value as Record<string, unknown>).name).trim();
          const preferences = dto.value as Record<string, Prisma.InputJsonValue>;
          const profileData = {
            displayName,
            ...(typeof preferences.photo === 'string'
              ? { avatarUrl: preferences.photo || null }
              : {}),
            ...(Array.isArray(preferences.parts) ? { parts: preferences.parts } : {}),
          };
          await tx.profile.upsert({
            where: { id: user.id },
            create: { id: user.id, ...profileData },
            update: profileData,
          });
        }
        return document;
      });
    } catch (error) {
      if (photo) await this.photos.discard(photo);
      if ((error as { code?: string }).code === 'P2002')
        throw new ConflictException('다른 기기에서 먼저 저장했습니다. 기록을 다시 불러와주세요.');
      throw error;
    }
  }
  @Get('preferences')
  @ApiOperation({ summary: '내 프로필·알림·연습 환경 설정 조회' })
  preferences(@CurrentUser() user: AuthenticatedUser) {
    return this.get(user, 'preferences');
  }
  @Put('preferences')
  @ApiOperation({ summary: '설정과 프로필 이름을 함께 저장' })
  setPreferences(@CurrentUser() user: AuthenticatedUser, @Body() dto: PreferencesDto) {
    return this.save(user, 'preferences', dto as PersonalWriteDto);
  }
}
