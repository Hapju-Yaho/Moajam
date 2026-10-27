import { Body, Controller, Delete, Get, Param, ParseUUIDPipe, Post, Put } from '@nestjs/common';
import { IsInt, IsObject, IsOptional, IsString, MaxLength, Min, MinLength } from 'class-validator';
import { CurrentUser } from '../common/auth/current-user.decorator.js';
import type { AuthenticatedUser } from '../common/auth/auth.service.js';
import { ScoreProjectsService } from './score-projects.service.js';
import { ApiBearerAuth, ApiTags } from '@nestjs/swagger';
class CreateDto {
  @IsString() @MinLength(1) @MaxLength(160) name!: string;
  @IsOptional() @IsObject() data?: Record<string, unknown>;
}
class RevisionDto {
  @IsInt() @Min(1) revision!: number;
}
class SaveDto extends RevisionDto {
  @IsObject() value!: { data: unknown };
  @IsOptional() @IsString() @MinLength(1) @MaxLength(160) name?: string;
}
@Controller('workspaces/:workspaceId')
@ApiTags('Score Projects')
@ApiBearerAuth()
export class ScoreProjectsController {
  constructor(private readonly projects: ScoreProjectsService) {}
  @Get('songs/:songId/score-projects') list(
    @CurrentUser() user: AuthenticatedUser,
    @Param('workspaceId', ParseUUIDPipe) workspace: string,
    @Param('songId') song: string,
  ) {
    return this.projects.list(workspace, song, user.id);
  }
  @Post('songs/:songId/score-projects') create(
    @CurrentUser() user: AuthenticatedUser,
    @Param('workspaceId', ParseUUIDPipe) workspace: string,
    @Param('songId') song: string,
    @Body() dto: CreateDto,
  ) {
    return this.projects.create(workspace, song, dto.name, user.id, dto.data);
  }
  @Get('score-projects/:id') async get(
    @CurrentUser() user: AuthenticatedUser,
    @Param('workspaceId', ParseUUIDPipe) workspace: string,
    @Param('id', ParseUUIDPipe) id: string,
  ) {
    const { data, ...metadata } = await this.projects.get(workspace, id, user.id);
    return { ...metadata, value: { data } };
  }
  @Put('score-projects/:id') async save(
    @CurrentUser() user: AuthenticatedUser,
    @Param('workspaceId', ParseUUIDPipe) workspace: string,
    @Param('id', ParseUUIDPipe) id: string,
    @Body() dto: SaveDto,
  ) {
    const { data, ...metadata } = await this.projects.save(
      workspace,
      id,
      user.id,
      dto.revision,
      dto.value.data,
      dto.name,
    );
    return { ...metadata, value: { data } };
  }
  @Delete('score-projects/:id') remove(
    @CurrentUser() user: AuthenticatedUser,
    @Param('workspaceId', ParseUUIDPipe) workspace: string,
    @Param('id', ParseUUIDPipe) id: string,
    @Body() dto: RevisionDto,
  ) {
    return this.projects.remove(workspace, id, user.id, dto.revision);
  }
}
