import { createApplication } from '../dist/app.js';
import { BandPhotoService } from '../dist/workspaces/band-photo.service.js';

const app = await createApplication();
try {
  const result = await app.get(BandPhotoService).migrateLegacy();
  console.log('Band photo migration:', result);
} catch (error) {
  // Keep image data, storage credentials and database URLs out of logs.
  console.error('Band photo migration failed:', error?.name, error?.code ?? '');
  process.exitCode = 1;
} finally {
  await app.close();
}
