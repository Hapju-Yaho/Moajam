import {
  BadRequestException,
  Body,
  Controller,
  Delete,
  Get,
  Param,
  Post,
  Req,
  Query,
} from '@nestjs/common';
import { ApiBearerAuth, ApiTags } from '@nestjs/swagger';
import {
  IsBoolean,
  IsIn,
  IsInt,
  IsOptional,
  IsObject,
  IsArray,
  ArrayMinSize,
  ArrayMaxSize,
  ValidateNested,
  IsString,
  IsUUID,
  MaxLength,
  Max,
  Min,
} from 'class-validator';
import { Type } from 'class-transformer';
import type { FastifyRequest } from 'fastify';
import { CurrentUser } from '../common/auth/current-user.decorator.js';
import type { AuthenticatedUser } from '../common/auth/auth.service.js';
import { PDF_MAX_BYTES, ScorePdfService } from './score-pdf.service.js';

class StartQueryDto {
  @IsOptional() @IsIn(['guitar-tab', 'bass-tab', 'vocal-staff', 'keyboard', 'drums']) scoreType?:
    'guitar-tab' | 'bass-tab' | 'vocal-staff' | 'keyboard' | 'drums';
}
class RetryDto {
  @IsInt() @Min(1) @Max(40) page!: number;
  @IsOptional() @IsInt() @Min(1) @Max(32000) measure?: number;
}
class AnalyzeDto {
  @IsOptional() @IsBoolean() retry?: boolean;
}
class CleanupQueryDto {
  @IsOptional() @IsUUID() keepId?: string;
}
class MeasureTargetDto {
  @IsString() @MaxLength(40) part!: string;
  @IsInt() @Min(1) @Max(40) page!: number;
  @IsInt() @Min(1) @Max(32000) measure!: number;
}
class BatchRetryDto {
  @IsOptional() @IsBoolean() forceInference?: boolean;
  @IsArray()
  @ArrayMinSize(1)
  @ArrayMaxSize(128)
  @ValidateNested({ each: true })
  @Type(() => MeasureTargetDto)
  measures!: MeasureTargetDto[];
}
class StructureDto {
  @IsObject() structure!: object;
  @IsInt() @Min(1) revision!: number;
}
@ApiTags('Score PDF preparation')
@ApiBearerAuth()
@Controller('score-pdf/jobs')
export class ScorePdfController {
  constructor(private readonly service: ScorePdfService) {}
  @Get() list(@CurrentUser() user: AuthenticatedUser) {
    return this.service.list(user.id);
  }
  @Get(':id/source') source(@CurrentUser() user: AuthenticatedUser, @Param('id') id: string) {
    return this.service.source(user.id, id);
  }
  @Delete() clearInactive(@CurrentUser() user: AuthenticatedUser, @Query() query: CleanupQueryDto) {
    return this.service.clearInactive(user.id, query.keepId);
  }
  @Post() async start(
    @CurrentUser() user: AuthenticatedUser,
    @Req() req: FastifyRequest,
    @Query() query: StartQueryDto,
  ) {
    const file = await req.file({
      limits: { fileSize: PDF_MAX_BYTES, files: 1, fields: 0, parts: 1 },
    });
    if (!file) throw new BadRequestException('PDF 파일이 필요합니다.');
    const bytes = await file.toBuffer();
    return this.service.start(user.id, file.filename, bytes, query.scoreType ?? 'guitar-tab');
  }
  @Get(':id') status(@CurrentUser() user: AuthenticatedUser, @Param('id') id: string) {
    return this.service.status(user.id, id);
  }
  @Get(':id/result') result(@CurrentUser() user: AuthenticatedUser, @Param('id') id: string) {
    return this.service.result(user.id, id);
  }
  @Post(':id/analyze') analyze(
    @CurrentUser() user: AuthenticatedUser,
    @Param('id') id: string,
    @Body() body: AnalyzeDto,
  ) {
    return this.service.analyze(user.id, id, body.retry ?? false);
  }
  @Post(':id/reanalyze') retry(
    @CurrentUser() user: AuthenticatedUser,
    @Param('id') id: string,
    @Body() body: RetryDto,
  ) {
    return this.service.reanalyze(user.id, id, body.page, body.measure);
  }
  @Post(':id/reanalyze-batch') retryBatch(
    @CurrentUser() user: AuthenticatedUser,
    @Param('id') id: string,
    @Body() body: BatchRetryDto,
  ) {
    return this.service.reanalyzeBatch(user.id, id, body.measures, body.forceInference ?? false);
  }
  @Post(':id/structure/confirm') confirm(
    @CurrentUser() user: AuthenticatedUser,
    @Param('id') id: string,
    @Body() body: StructureDto,
  ) {
    return this.service.confirmStructure(user.id, id, body.structure, body.revision);
  }
  @Delete(':id') remove(@CurrentUser() user: AuthenticatedUser, @Param('id') id: string) {
    return this.service.remove(user.id, id);
  }
}
