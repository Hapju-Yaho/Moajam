import {
  BadRequestException,
  Controller,
  Get,
  NotFoundException,
  Param,
  Put,
  Req,
  Res,
} from '@nestjs/common';
import type { FastifyRequest, FastifyReply } from 'fastify';
import { Public } from '../common/auth/public.decorator.js';
import { PrismaService } from '../common/database/prisma.service.js';
import { StorageService } from './storage.service.js';
@Public()
@Controller('local-files')
export class LocalFilesController {
  constructor(
    private readonly storage: StorageService,
    private readonly db: PrismaService,
  ) {}
  @Put(':token') async upload(@Param('token') token: string, @Req() request: FastifyRequest) {
    const key = this.storage.verify(token, 'PUT');
    const asset = await this.db.mediaAsset.findUnique({ where: { objectKey: key } });
    if (!asset || asset.deletedAt || asset.ready) throw new NotFoundException();
    const file = await request.file({ limits: { fileSize: 104857600, files: 1, fields: 1 } });
    if (!file) throw new BadRequestException('파일이 필요합니다.');
    const data = await file.toBuffer();
    if (data.length !== asset.size || file.mimetype !== asset.mime)
      throw new BadRequestException('파일 크기 또는 형식이 다릅니다.');
    await this.storage.write(key, data, asset.mime);
    return { ok: true };
  }
  @Get(':token') async download(@Param('token') token: string, @Res() reply: FastifyReply) {
    const key = this.storage.verify(token, 'GET');
    const asset = await this.db.mediaAsset.findUnique({ where: { objectKey: key } });
    if (!asset?.ready || asset.deletedAt) throw new NotFoundException();
    reply
      .header('Cache-Control', 'private, no-store')
      .header('X-Content-Type-Options', 'nosniff')
      .type(asset.mime);
    return reply.send(await this.storage.read(key));
  }
}
