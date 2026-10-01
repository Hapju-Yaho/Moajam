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
  @Get(':token') async download(
    @Param('token') token: string,
    @Res() reply: FastifyReply,
    @Req() request: FastifyRequest,
  ) {
    const key = this.storage.verify(token, 'GET');
    const asset = await this.db.mediaAsset.findUnique({ where: { objectKey: key } });
    if (!asset?.ready || asset.deletedAt) throw new NotFoundException();
    reply
      .header('Cache-Control', 'private, no-store')
      .header('X-Content-Type-Options', 'nosniff')
      .type(asset.mime);
    const data = await this.storage.read(key);
    reply.header('Accept-Ranges', 'bytes');
    const range = request.headers.range;
    if (range) {
      const match = /^bytes=(\d*)-(\d*)$/.exec(range);
      if (!match || (!match[1] && !match[2]))
        return reply.code(416).header('Content-Range', `bytes */${data.length}`).send();
      const start = match[1] ? Number(match[1]) : Math.max(0, data.length - Number(match[2]));
      const end =
        match[1] && match[2] ? Math.min(Number(match[2]), data.length - 1) : data.length - 1;
      if (
        !Number.isSafeInteger(start) ||
        !Number.isSafeInteger(end) ||
        start > end ||
        start >= data.length
      )
        return reply.code(416).header('Content-Range', `bytes */${data.length}`).send();
      return reply
        .code(206)
        .header('Content-Range', `bytes ${start}-${end}/${data.length}`)
        .header('Content-Length', end - start + 1)
        .send(data.subarray(start, end + 1));
    }
    return reply.header('Content-Length', data.length).send(data);
  }
}
