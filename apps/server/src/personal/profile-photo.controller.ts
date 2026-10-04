import { Controller, Get, Param, Res } from '@nestjs/common';
import { ApiOperation, ApiTags } from '@nestjs/swagger';
import type { FastifyReply } from 'fastify';
import { Public } from '../common/auth/public.decorator.js';
import { ProfilePhotoService } from './profile-photo.service.js';

@ApiTags('Profile photos')
@Controller('profile-photos')
export class ProfilePhotoController {
  constructor(private readonly photos: ProfilePhotoService) {}
  @Public()
  @Get(':id')
  @ApiOperation({
    summary: '현재 사용 중인 프로필 사진의 고정 주소. 불투명한 주소를 아는 사용자에게 이미지 표시.',
  })
  async image(@Param('id') id: string, @Res() reply: FastifyReply) {
    const url = await this.photos.download(id);
    return reply
      .header('Cache-Control', 'private, no-store')
      .header('Referrer-Policy', 'no-referrer')
      .redirect(url, 302);
  }
}
