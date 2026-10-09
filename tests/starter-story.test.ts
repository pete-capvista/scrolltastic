import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import { validateStory } from '../src/parser/parse';

const STORY_ID = '78222451-dd4b-4a67-b927-89dd832c7bf7';

describe('production starter story', () => {
  it('is a valid AI-authorable V5 package', () => {
    const source = readFileSync(`public/stories/${STORY_ID}/story.json`, 'utf8');
    const result = validateStory(source);
    expect(result.diagnostics).toEqual([]);
    expect(result.document).toMatchObject({
      id: STORY_ID,
      storyLanguage: '5',
      authoring: { ai: { enabled: true } },
    });
  });
});
