import { Module } from '@nestjs/common';
import { ConfigModule } from '@nestjs/config';
import { AuthModule } from './common/auth/auth.module.js';
import { DatabaseModule } from './common/database/database.module.js';
import { validateEnvironment } from './config/environment.js';
import { HealthController } from './health/health.controller.js';
import { WorkspacesController } from './workspaces/workspaces.controller.js';
import { MediaController } from './media/media.controller.js';
import { StorageService } from './media/storage.service.js';
import { SeparationService } from './media/separation.service.js';
import { ClientConfigController } from './config/client-config.controller.js';
import { PersonalController } from './personal/personal.controller.js';
import { ProfilePhotoController } from './personal/profile-photo.controller.js';
import { ProfilePhotoService } from './personal/profile-photo.service.js';
import { WorkspaceSyncController } from './workspaces/workspace-sync.controller.js';
import { LocalFilesController } from './media/local-files.controller.js';
import { YouTubeController } from './media/youtube.controller.js';

@Module({
  imports: [
    ConfigModule.forRoot({
      cache: true,
      isGlobal: true,
      envFilePath: ['.env.local', '.env'],
      validate: validateEnvironment,
    }),
    AuthModule,
    DatabaseModule,
  ],
  controllers: [
    HealthController,
    WorkspacesController,
    MediaController,
    ClientConfigController,
    PersonalController,
    ProfilePhotoController,
    WorkspaceSyncController,
    LocalFilesController,
    YouTubeController,
  ],
  providers: [StorageService, SeparationService, ProfilePhotoService],
})
export class AppModule {}
