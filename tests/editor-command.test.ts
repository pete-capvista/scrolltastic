import { describe, expect, it } from 'vitest';
import { resolveEditorCommand } from '../src/authoring/client/editor';

describe('story editor commands', () => {
  it.each(['publish', 'Publish', 'publish story', 'publish this story', 'publsh', 'pubish'])(
    'recognizes %s as the reviewed publish command',
    input => expect(resolveEditorCommand(input)).toBe('publish'),
  );

  it('does not mistake an ordinary publishing question for a command', () => {
    expect(resolveEditorCommand('How does publishing work?')).toBeUndefined();
  });

  it.each(['accept', 'accept changes', 'accpet'])('recognizes %s as acceptance', input => {
    expect(resolveEditorCommand(input)).toBe('accept');
  });

  it.each(['discard', 'discard changes'])('recognizes %s as discard', input => {
    expect(resolveEditorCommand(input)).toBe('discard');
  });
});
