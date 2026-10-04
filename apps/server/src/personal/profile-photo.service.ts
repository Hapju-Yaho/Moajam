import {
  BadRequestException,
  Injectable,
  NotFoundException,
  ServiceUnavailableException,
} from '@nestjs/common';
import { randomUUID } from 'node:crypto';
import { PrismaService } from '../common/database/prisma.service.js';
import { StorageService } from '../media/storage.service.js';
import { profilePhotoPath, validatePhoto } from './onboarding.dto.js';

export interface PreparedPhoto {
  value: string;
  created?: { id: string; key: string };
}

@Injectable()
export class ProfilePhotoService {
  constructor(
    private readonly db: PrismaService,
    private readonly storage: StorageService,
  ) {}

  async prepare(ownerId: string, value: string): Promise<PreparedPhoto> {
    validatePhoto(value);
    if (!value) return { value: '' };
    const path = profilePhotoPath(value);
    if (path) {
      const asset = await this.db.mediaAsset.findFirst({
        where: {
          id: path.split('/').at(-1),
          ownerId,
          scope: 'profile-photo',
          ready: true,
          deletedAt: null,
        },
      });
      if (!asset) throw new BadRequestException('본인이 저장한 프로필 사진만 사용할 수 있습니다.');
      return { value: path };
    }
    const [header, encoded] = value.split(',');
    const mime = header.slice(5, header.indexOf(';'));
    const bytes = Buffer.from(encoded, 'base64');
    const id = randomUUID();
    const key = `${ownerId}/${randomUUID()}`;
    const result = await this.storage.bucket().upload(key, bytes, { contentType: mime });
    if (result.error)
      throw new ServiceUnavailableException(
        '프로필 사진을 저장하지 못했습니다. 다시 시도해주세요.',
      );
    try {
      await this.db.mediaAsset.create({
        data: {
          id,
          ownerId,
          objectKey: key,
          scope: 'profile-photo',
          name: `profile.${mime.split('/')[1]}`,
          mime,
          size: bytes.length,
          ready: true,
        },
      });
    } catch (error) {
      await this.storage.bucket().remove([key]);
      throw error;
    }
    return { value: `/v1/profile-photos/${id}`, created: { id, key } };
  }

  async discard(photo: PreparedPhoto) {
    if (!photo.created) return;
    // A failed profile transaction must not replace the previous photo.
    if (await this.db.profile.count({ where: { avatarUrl: photo.value } })) return;
    const removed = await this.storage.bucket().remove([photo.created.key]);
    if (!removed.error)
      await this.db.mediaAsset.deleteMany({
        where: { id: photo.created.id, scope: 'profile-photo' },
      });
  }

  async download(id: string) {
    if (!/^[a-f0-9]{8}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{12}$/.test(id))
      throw new NotFoundException();
    const asset = await this.db.mediaAsset.findFirst({
      where: { id, scope: 'profile-photo', ready: true, deletedAt: null },
    });
    if (
      !asset ||
      !(await this.db.profile.findFirst({
        where: { id: asset.ownerId, avatarUrl: `/v1/profile-photos/${id}` },
      }))
    )
      throw new NotFoundException();
    return this.storage.signed(asset.objectKey);
  }

  async migrateLegacy() {
    const profiles = await this.db.profile.findMany({
      where: { avatarUrl: { startsWith: 'data:image/' } },
    });
    let migrated = 0;
    for (const profile of profiles) {
      const prepared = await this.prepare(profile.id, profile.avatarUrl!);
      try {
        const changed = await this.db.$transaction(async (tx) => {
          const updated = await tx.profile.updateMany({
            where: { id: profile.id, avatarUrl: profile.avatarUrl },
            data: { avatarUrl: prepared.value },
          });
          if (!updated.count) return false;
          const where = { ownerId_key: { ownerId: profile.id, key: 'preferences' } };
          const prefs = await tx.personalDocument.findUnique({ where });
          if (
            prefs?.value &&
            typeof prefs.value === 'object' &&
            !Array.isArray(prefs.value) &&
            prefs.value.photo === profile.avatarUrl
          )
            await tx.personalDocument.update({
              where,
              data: {
                value: { ...prefs.value, photo: prepared.value },
                revision: { increment: 1 },
              },
            });
          return true;
        });
        if (changed) migrated++;
        else await this.discard(prepared);
      } catch (error) {
        await this.discard(prepared);
        throw error;
      }
    }
    return { found: profiles.length, migrated };
  }
}
