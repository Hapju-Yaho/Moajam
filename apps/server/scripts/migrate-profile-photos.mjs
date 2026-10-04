import { createApplication } from '../dist/app.js';
import { ProfilePhotoService } from '../dist/personal/profile-photo.service.js';

const app = await createApplication();
try {
  const result = await app.get(ProfilePhotoService).migrateLegacy();
  console.log('Profile photo migration:', result);
} catch (error) {
  // Do not expose data URLs, storage credentials or database connection strings.
  console.error('Profile photo migration failed:', error?.name, error?.code ?? '');
  process.exitCode = 1;
} finally {
  await app.close();
}
