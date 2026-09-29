import ts from 'typescript';
import { spawn } from 'node:child_process';
let child;
const host = ts.createWatchCompilerHost(
  'tsconfig.build.json',
  {},
  ts.sys,
  ts.createEmitAndSemanticDiagnosticsBuilderProgram,
  (diagnostic) => console.error(ts.flattenDiagnosticMessageText(diagnostic.messageText, '\n')),
  () => {},
);
const original = host.afterProgramCreate;
host.afterProgramCreate = (program) => {
  original?.(program);
  if (
    ts
      .getPreEmitDiagnostics(program.getProgram())
      .some((d) => d.category === ts.DiagnosticCategory.Error)
  )
    return;
  const start = () => {
    child = spawn(process.execPath, ['dist/main.js'], { stdio: 'inherit', windowsHide: true });
  };
  if (child && child.exitCode === null) {
    child.once('exit', start);
    child.kill();
  } else start();
};
const watcher = ts.createWatchProgram(host);
process.on('SIGINT', () => {
  watcher.close();
  child?.kill();
  process.exit();
});
process.on('SIGTERM', () => {
  watcher.close();
  child?.kill();
  process.exit();
});
