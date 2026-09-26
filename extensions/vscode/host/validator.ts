import { validateStory } from '../../../src/parser/parse';

export function validateStoryForPublish(source: string) {
  const result = validateStory(source);
  return {
    valid: Boolean(result.document),
    diagnostics: result.diagnostics.map(({ path, code, severity, category, message }) => ({ path, code, severity, category, message })),
  };
}
