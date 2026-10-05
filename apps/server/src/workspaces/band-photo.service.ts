import {
  BadRequestException,
  Injectable,
  NotFoundException,
  ServiceUnavailableException,
} from '@nestjs/common';
import { randomUUID } from 'node:crypto';
import { PrismaService } from '../common/database/prisma.service.js';
import type { Prisma } from '../generated/prisma/client.js';
import { StorageService } from '../media/storage.service.js';
import { validatePhoto } from '../personal/onboarding.dto.js';
import type { PreparedPhoto } from '../personal/profile-photo.service.js';

function bandPhotoPath(value: string) {
  try {
    const url = new URL(value, 'https://moajam.invalid');
    if (!['http:', 'https:'].includes(url.protocol) || url.search || url.hash) return null;
    const match =
      /^\/(?:api\/)?v1\/band-photos\/([a-f0-9]{8}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{12})$/.exec(
        url.pathname,
      );
    return match ? `/v1/band-photos/${match[1]}` : null;
  } catch {
    return null;
  }
}

function object(value: unknown): Record<string, unknown> {
  return value && typeof value === 'object' && !Array.isArray(value)
    ? (value as Record<string, unknown>)
    : {};
}

@Injectable()
export class BandPhotoService {
  constructor(
    private readonly db: PrismaService,
    private readonly storage: StorageService,
  ) {}

  async prepare(ownerId: string, workspaceId: string, value: string): Promise<PreparedPhoto> {
    if (!value) return { value: '' };
    const path = bandPhotoPath(value);
    if (path) {
      const asset = await this.db.mediaAsset.findFirst({
        where: {
          id: path.split('/').at(-1),
          workspaceId,
          scope: 'band-photo',
          ready: true,
          deletedAt: null,
        },
      });
      if (!asset) throw new BadRequestException('이 밴드에 저장한 사진만 사용할 수 있습니다.');
      return { value: path };
    }
    if (!value.startsWith('data:image/'))
      throw new BadRequestException('밴드 사진을 확인해주세요.');
    validatePhoto(value);
    const [header, encoded] = value.split(',');
    const mime = header.slice(5, header.indexOf(';'));
    const bytes = Buffer.from(encoded, 'base64');
    const id = randomUUID();
    const key = `${ownerId}/${randomUUID()}`;
    const result = await this.storage.bucket().upload(key, bytes, { contentType: mime });
    if (result.error)
      throw new ServiceUnavailableException('밴드 사진을 저장하지 못했습니다. 다시 시도해주세요.');
    try {
      await this.db.mediaAsset.create({
        data: {
          id,
          ownerId,
          workspaceId,
          objectKey: key,
          scope: 'band-photo',
          name: `band.${mime.split('/')[1]}`,
          mime,
          size: bytes.length,
          ready: true,
        },
      });
    } catch (error) {
      await this.storage.bucket().remove([key]);
      throw error;
    }
    return { value: `/v1/band-photos/${id}`, created: { id, key } };
  }

  async discard(workspaceId: string, photo: PreparedPhoto) {
    if (!photo.created) return;
    const current = await this.db.workspaceDocument.findUnique({
      where: { workspaceId_key: { workspaceId, key: 'band/profile' } },
    });
    if (object(object(current?.value).data).photo === photo.value) return;
    const removed = await this.storage.bucket().remove([photo.created.key]);
    if (!removed.error)
      await this.db.mediaAsset.deleteMany({ where: { id: photo.created.id, scope: 'band-photo' } });
  }

  async download(id: string) {
    if (!/^[a-f0-9]{8}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{12}$/.test(id))
      throw new NotFoundException();
    const asset = await this.db.mediaAsset.findFirst({
      where: { id, scope: 'band-photo', ready: true, deletedAt: null },
    });
    if (!asset?.workspaceId) throw new NotFoundException();
    const profile = await this.db.workspaceDocument.findUnique({
      where: { workspaceId_key: { workspaceId: asset.workspaceId, key: 'band/profile' } },
    });
    if (object(object(profile?.value).data).photo !== `/v1/band-photos/${id}`)
      throw new NotFoundException();
    return this.storage.signed(asset.objectKey);
  }

  async migrateLegacy() {
    const profiles = await this.db.workspaceDocument.findMany({ where: { key: 'band/profile' } });
    let found = 0;
    let migrated = 0;
    for (const profile of profiles) {
      const value = object(profile.value);
      const data = object(value.data);
      if (typeof data.photo !== 'string' || !data.photo.startsWith('data:image/')) continue;
      found++;
      const prepared = await this.prepare(profile.updatedBy, profile.workspaceId, data.photo);
      try {
        const updated = await this.db.workspaceDocument.updateMany({
          where: { workspaceId: profile.workspaceId, key: profile.key, revision: profile.revision },
          data: {
            value: { ...value, data: { ...data, photo: prepared.value } } as Prisma.InputJsonValue,
            revision: { increment: 1 },
          },
        });
        if (updated.count) migrated++;
        else await this.discard(profile.workspaceId, prepared);
      } catch (error) {
        await this.discard(profile.workspaceId, prepared);
        throw error;
      }
    }
    return { found, migrated };
  }
}
