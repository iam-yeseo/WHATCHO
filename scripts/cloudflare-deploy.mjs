import { spawn } from 'node:child_process';
import { mkdtemp, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

const apiKey = process.env.TDATA_API_KEY?.trim();

if (!apiKey) {
  console.error('TDATA_API_KEY is missing from the Cloudflare build environment.');
  process.exit(1);
}

const temporaryDirectory = await mkdtemp(join(tmpdir(), 'whatcho-secrets-'));
const secretsFile = join(temporaryDirectory, 'secrets.json');

try {
  await writeFile(
    secretsFile,
    JSON.stringify({ TDATA_API_KEY: apiKey }),
    { mode: 0o600 },
  );

  const npx = process.platform === 'win32' ? 'npx.cmd' : 'npx';
  const child = spawn(
    npx,
    ['wrangler', 'deploy', '--secrets-file', secretsFile, ...process.argv.slice(2)],
    { env: process.env, stdio: 'inherit' },
  );

  const exitCode = await new Promise((resolve, reject) => {
    child.once('error', reject);
    child.once('exit', (code) => resolve(code ?? 1));
  });

  if (exitCode !== 0) process.exitCode = exitCode;
} finally {
  await rm(temporaryDirectory, { force: true, recursive: true });
}
