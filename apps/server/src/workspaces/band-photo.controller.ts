import { Controller, Get, Param, Res } from '@nestjs/common';
import { ApiOperation, ApiTags } from '@nestjs/swagger';
import type { FastifyReply } from 'fastify';
import { Public } from '../common/auth/public.decorator.js';
import { BandPhotoService } from './band-photo.service.js';

@ApiTags('Band photos')
@Controller('band-photos')
export class BandPhotoController {
  constructor(private readonly photos: BandPhotoService) {}
  @Public()
  @Get(':id')
  @ApiOperation({
    summary: '현재 밴드 사진의 고정 주소. 불투명한 주소를 아는 사용자에게 이미지 표시.',
  })
  async image(@Param('id') id: string, @Res() reply: FastifyReply) {
    const url = await this.photos.download(id);
    return reply
      .header('Cache-Control', 'private, no-store')
      .header('Referrer-Policy', 'no-referrer')
      .redirect(url, 302);
  }
}
