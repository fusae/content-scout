#!/usr/bin/env node
import { cpSync, mkdirSync, readdirSync } from 'fs';
import { join } from 'path';

const root = process.cwd();

copy('src/db/schema.sql', 'dist/db/schema.sql');
copy('src/data', 'dist/data', true);

const webDir = join(root, 'src/web');
for (const entry of readdirSync(webDir, { withFileTypes: true })) {
  if (entry.isFile() && entry.name.endsWith('.html')) {
    copy(`src/web/${entry.name}`, `dist/web/${entry.name}`);
  }
}

function copy(from, to, recursive = false) {
  const source = join(root, from);
  const destination = join(root, to);
  mkdirSync(join(destination, '..'), { recursive: true });
  cpSync(source, destination, { recursive, force: true });
}
