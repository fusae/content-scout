#!/usr/bin/env node
import { spawnSync } from 'child_process';
import { existsSync, readFileSync } from 'fs';
import { join } from 'path';

const root = process.cwd();
const pkg = JSON.parse(readFileSync(join(root, 'package.json'), 'utf8'));
const electronVersion = String(pkg.devDependencies?.electron || '').replace(/^[^\d]*/, '');
const args = process.argv.slice(2);
const wantsWindows = args.includes('--win') || args.includes('-w') || args.some((arg) => arg.startsWith('--windows'));

function bin(name) {
  const ext = process.platform === 'win32' ? '.cmd' : '';
  return join(root, 'node_modules', '.bin', `${name}${ext}`);
}

function run(command, commandArgs, options = {}) {
  const result = spawnSync(command, commandArgs, {
    cwd: root,
    stdio: 'inherit',
    shell: process.platform === 'win32',
    ...options,
  });

  if (result.status !== 0) {
    throw new Error(`${command} ${commandArgs.join(' ')} failed`);
  }
}

if (!electronVersion) {
  throw new Error('Cannot resolve Electron version from package.json');
}

if (!existsSync(bin('electron-rebuild')) || !existsSync(bin('electron-builder'))) {
  throw new Error('Desktop packaging dependencies are missing. Run npm install first.');
}

if (wantsWindows && process.platform !== 'win32') {
  throw new Error('Windows packages must be built on Windows because Spark uses native SQLite dependencies. Use Build-Windows.cmd or GitHub Actions.');
}

let failure;

try {
  run('npm', ['run', 'build']);
  run(bin('electron-rebuild'), ['-v', electronVersion, '-f', '-w', 'better-sqlite3']);
  run(bin('electron-builder'), args);
} catch (error) {
  failure = error;
} finally {
  try {
    run('npm', ['rebuild', 'better-sqlite3']);
  } catch (error) {
    if (!failure) {
      failure = error;
    }
  }
}

if (failure) {
  console.error(failure.message);
  process.exit(1);
}
