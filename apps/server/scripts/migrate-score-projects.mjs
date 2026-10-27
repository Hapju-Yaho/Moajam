import { createApplication } from '../dist/app.js';
import { ScoreProjectsService } from '../dist/workspaces/score-projects.service.js';
const app = await createApplication();
try {
  console.log('Score migration:', await app.get(ScoreProjectsService).migrate());
} catch (error) {
  console.error(
    'Score migration failed:',
    error?.name,
    error?.code ?? '',
    'Original records are retained. Fix the cause and rerun.',
  );
  process.exitCode = 1;
} finally {
  await app.close();
}
