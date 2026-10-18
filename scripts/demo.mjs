// npm run demo: dashboard with made-up data, no login, database or Google account needed
import { spawn } from 'node:child_process';

const child = spawn('npx', ['next', 'dev', '-p', '3002'], {
  stdio: 'inherit',
  shell: true,
  env: { ...process.env, DEMO_MODE: 'true' },
});
child.on('exit', (code) => process.exit(code ?? 0));
