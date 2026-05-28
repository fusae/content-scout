import { cp, copyFile, mkdir, readdir } from 'node:fs/promises';
import { join } from 'node:path';

const copies = [
  ['src/db/schema.sql', 'dist/db/schema.sql', 'file'],
  ['src/data', 'dist/data', 'dir'],
  ['src/web', 'dist/web', 'html'],
];

for (const [from, to, type] of copies) {
  await mkdir(type === 'file' ? join(to, '..') : to, { recursive: true });

  if (type === 'file') {
    await copyFile(from, to);
  } else if (type === 'dir') {
    await cp(from, to, { recursive: true, force: true });
  } else {
    const files = await readdir(from);
    await Promise.all(
      files
        .filter((file) => file.endsWith('.html'))
        .map((file) => copyFile(join(from, file), join(to, file)))
    );
  }
}
