import { readFile, writeFile } from 'node:fs/promises';
import Ajv from 'ajv';
import standaloneCode from 'ajv/dist/standalone/index.js';
import schema from '../src/schema/story.schema.json' with { type: 'json' };

const output = new URL('../src/parser/story-validator.generated.js', import.meta.url);
const declaration = new URL('../src/parser/story-validator.generated.d.ts', import.meta.url);
const ajv = new Ajv({ allErrors: true, strict: true, discriminator: true, code: { source: true, esm: true } });
const code = standaloneCode(ajv, ajv.compile(schema));
const imports = [];
const runtimeBindings = [];
const generatedBody = code.replace(/const (\w+) = require\("ajv\/dist\/runtime\/([^\"]+)"\)\.default;/g, (_match, name, moduleName) => {
  imports.push(`import ${name}Module from 'ajv/dist/runtime/${moduleName}.js';`);
  runtimeBindings.push(`const ${name} = typeof ${name}Module === 'function' ? ${name}Module : ${name}Module.default;`);
  return '';
});
const generated = `${imports.join('\n')}\n${runtimeBindings.join('\n')}\n${generatedBody}\n`;
const types = `import type { ValidateFunction } from 'ajv';\nimport type { StoryDocument } from '../model/story.generated';\ndeclare const validate: ValidateFunction<StoryDocument>;\nexport { validate };\nexport default validate;\n`;

if (process.argv.includes('--check')) {
  const [current, currentTypes] = await Promise.all([readFile(output, 'utf8').catch(() => ''), readFile(declaration, 'utf8').catch(() => '')]);
  if (current !== generated || currentTypes !== types) {
    console.error('Generated standalone Story Language validator is out of date. Run npm run generate.');
    process.exitCode = 1;
  }
} else {
  await Promise.all([writeFile(output, generated), writeFile(declaration, types)]);
}
