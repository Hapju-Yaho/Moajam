import {
  BadRequestException,
  Controller,
  Get,
  Param,
  ServiceUnavailableException,
} from '@nestjs/common';
import { ApiBearerAuth, ApiOperation, ApiParam, ApiTags } from '@nestjs/swagger';
type Metadata = { title: string; author_name: string; thumbnail_url: string };
@ApiTags('References')
@ApiBearerAuth()
@Controller('integrations/youtube')
export class YouTubeController {
  private cache = new Map<string, { value: Metadata; expires: number }>();
  @Get(':videoId')
  @ApiOperation({ summary: 'YouTube 제목·채널 조회. 실패 시 직접 입력 가능' })
  @ApiParam({ name: 'videoId', schema: { type: 'string', pattern: '^[a-zA-Z0-9_-]{11}$' } })
  async metadata(@Param('videoId') id: string) {
    if (!/^[a-zA-Z0-9_-]{11}$/.test(id))
      throw new BadRequestException('YouTube 영상 ID를 확인해주세요.');
    const cached = this.cache.get(id);
    if (cached && cached.expires > Date.now()) return cached.value;
    try {
      // Only a fixed upstream and a validated ID can be fetched; never proxy an arbitrary URL.
      const response = await fetch(
        `https://www.youtube.com/oembed?url=${encodeURIComponent(`https://www.youtube.com/watch?v=${id}`)}&format=json`,
        { signal: AbortSignal.timeout(8000), redirect: 'error' },
      );
      if (!response.ok) throw new Error();
      const data = (await response.json()) as Partial<Metadata>;
      if (typeof data.title !== 'string' || typeof data.author_name !== 'string') throw new Error();
      const value = {
        title: data.title.slice(0, 1000),
        author_name: data.author_name.slice(0, 500),
        thumbnail_url: `https://i.ytimg.com/vi/${id}/hqdefault.jpg`,
      };
      if (this.cache.size >= 1000) this.cache.clear();
      this.cache.set(id, { value, expires: Date.now() + 3600000 });
      return value;
    } catch {
      throw new ServiceUnavailableException(
        '영상 정보를 불러오지 못했습니다. 제목과 아티스트를 직접 입력해주세요.',
      );
    }
  }
}
