import { createApplication } from '../dist/app.js';
import { DawProjectsService } from '../dist/workspaces/daw-projects.service.js';

const app = await createApplication();
try {
  console.log('DAW migration:', await app.get(DawProjectsService).migrate());
} catch (error) {
  console.error(
    'DAW migration failed:',
    error?.name,
    error?.code ?? '',
    'Fix the cause, then rerun. Original records are retained.',
  );
  process.exitCode = 1;
} finally {
  await app.close();
}
