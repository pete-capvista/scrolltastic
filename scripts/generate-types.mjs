import { compileFromFile } from 'json-schema-to-typescript';
import { readFile, writeFile } from 'node:fs/promises';
const target = new URL('../src/model/story.generated.ts', import.meta.url);
const output = await compileFromFile('src/schema/story.schema.json', {
  bannerComment: '/* Generated from story.schema.json. Run npm run generate; do not edit. */',
  unreachableDefinitions: true,
});
if (process.argv.includes('--check')) {
  if (await readFile(target, 'utf8') !== output) {
    throw new Error('Generated types are stale. Run npm run generate.');
  }
} else {
  await writeFile(target, output);
}
