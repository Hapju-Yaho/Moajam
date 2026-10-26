import {
  Body,
  Controller,
  Delete,
  Get,
  Param,
  ParseUUIDPipe,
  Patch,
  Post,
  Put,
} from '@nestjs/common';
import {
  IsInt,
  IsObject,
  IsOptional,
  IsString,
  MaxLength,
  Min,
  MinLength,
  ValidateIf,
} from 'class-validator';
import { ApiBearerAuth, ApiTags } from '@nestjs/swagger';
import { CurrentUser } from '../common/auth/current-user.decorator.js';
import type { AuthenticatedUser } from '../common/auth/auth.service.js';
import { DawProjectsService } from './daw-projects.service.js';

class CreateProjectDto {
  @IsString() @MinLength(1) @MaxLength(160) name!: string;
  @IsOptional() @IsObject() data?: Record<string, unknown>;
}
class RevisionDto {
  @IsInt() @Min(1) revision!: number;
}
class RenameProjectDto extends RevisionDto {
  @IsString() @MinLength(1) @MaxLength(160) name!: string;
}
class SaveProjectDto extends RevisionDto {
  @IsObject() value!: { data: unknown };
  @ValidateIf((_object, value) => value !== undefined)
  @IsString()
  @MinLength(1)
  @MaxLength(160)
  name?: string;
}

@ApiTags('DAW Projects')
@ApiBearerAuth()
@Controller('workspaces/:workspaceId')
export class DawProjectsController {
  constructor(private readonly projects: DawProjectsService) {}
  @Get('songs/:songId/daw-projects')
  list(
    @CurrentUser() user: AuthenticatedUser,
    @Param('workspaceId', ParseUUIDPipe) workspace: string,
    @Param('songId') song: string,
  ) {
    return this.projects.list(workspace, song, user.id);
  }
  @Post('songs/:songId/daw-projects')
  create(
    @CurrentUser() user: AuthenticatedUser,
    @Param('workspaceId', ParseUUIDPipe) workspace: string,
    @Param('songId') song: string,
    @Body() dto: CreateProjectDto,
  ) {
    return this.projects.create(workspace, song, dto.name, user.id, dto.data);
  }
  @Get('daw-projects/:id')
  async get(
    @CurrentUser() user: AuthenticatedUser,
    @Param('workspaceId', ParseUUIDPipe) workspace: string,
    @Param('id', ParseUUIDPipe) id: string,
  ) {
    const project = await this.projects.get(workspace, id, user.id);
    const { data, ...metadata } = project;
    return { ...metadata, value: { data } };
  }
  @Put('daw-projects/:id')
  async save(
    @CurrentUser() user: AuthenticatedUser,
    @Param('workspaceId', ParseUUIDPipe) workspace: string,
    @Param('id', ParseUUIDPipe) id: string,
    @Body() dto: SaveProjectDto,
  ) {
    const project = await this.projects.save(
      workspace,
      id,
      user.id,
      dto.revision,
      dto.value.data,
      dto.name,
    );
    const { data, ...metadata } = project;
    return { ...metadata, value: { data } };
  }
  @Patch('daw-projects/:id')
  rename(
    @CurrentUser() user: AuthenticatedUser,
    @Param('workspaceId', ParseUUIDPipe) workspace: string,
    @Param('id', ParseUUIDPipe) id: string,
    @Body() dto: RenameProjectDto,
  ) {
    return this.projects.rename(workspace, id, user.id, dto.name, dto.revision);
  }
  @Post('daw-projects/:id/duplicate')
  duplicate(
    @CurrentUser() user: AuthenticatedUser,
    @Param('workspaceId', ParseUUIDPipe) workspace: string,
    @Param('id', ParseUUIDPipe) id: string,
  ) {
    return this.projects.duplicate(workspace, id, user.id);
  }
  @Delete('daw-projects/:id')
  remove(
    @CurrentUser() user: AuthenticatedUser,
    @Param('workspaceId', ParseUUIDPipe) workspace: string,
    @Param('id', ParseUUIDPipe) id: string,
    @Body() dto: RevisionDto,
  ) {
    return this.projects.remove(workspace, id, user.id, dto.revision);
  }
}
