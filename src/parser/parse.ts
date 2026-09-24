import Ajv from 'ajv';
import schema from '../schema/story.schema.json';
import type { StoryDocument, Frame, Panel, Container } from '../model/story.generated';

export interface Diagnostic { path: string; message: string }
export class StoryValidationError extends Error {
  constructor(public readonly diagnostics: Diagnostic[]) {
    super(diagnostics.map(({ path, message }) => `${path || '/'}: ${message}`).join('\n'));
    this.name = 'StoryValidationError';
  }
}
export type FrameFlow = 'normal' | 'overlay' | 'overflow';
export type NormalizedFrame = Frame & { flow: FrameFlow };
export type NormalizedPanel = Omit<Panel, 'frames' | 'height'> & {
  height: NonNullable<Panel['height']>; frames: NormalizedFrame[];
};
export type NormalizedContainer = Omit<Container, 'flow'> & {
  flow: (NormalizedPanel | Extract<Container['flow'][number], { type: 'space' }>)[];
};
export type NormalizedStory = Omit<StoryDocument, 'body'> & {
  body: Omit<StoryDocument['body'], 'containers'> & { containers: NormalizedContainer[] };
};
const validate = new Ajv({ allErrors: true, strict: true, discriminator: true }).compile<StoryDocument>(schema);

export function parseStory(input: unknown): NormalizedStory {
  let value = input;
  if (typeof input === 'string') {
    try { value = JSON.parse(input); }
    catch { throw new StoryValidationError([{ path: '/', message: 'Malformed JSON.' }]); }
  }
  if (!validate(value)) {
    const diagnostics = (validate.errors ?? [])
      .filter(error => error.keyword !== 'oneOf')
      .map(error => ({
        path: `${error.instancePath}${error.keyword === 'discriminator' ? '/' + error.params.tag : error.keyword === 'additionalProperties' ? '/' + error.params.additionalProperty : error.keyword === 'required' ? '/' + error.params.missingProperty : ''}`,
        message: error.keyword === 'discriminator' ? `Unsupported or missing ${error.params.tag}: ${String(error.params.tagValue ?? '')}.` : error.keyword === 'additionalProperties'
          ? error.params.additionalProperty === 'panels'
            ? 'Legacy panels is unsupported; migrate to Container.flow with typed Panel entries.'
            : `Unsupported property: ${error.params.additionalProperty}.`
          : error.message ?? 'Invalid value.',
      }));
    throw new StoryValidationError(diagnostics.length ? diagnostics : [{ path: '/', message: 'Unsupported document version or declaration.' }]);
  }
  const document = structuredClone(value);
  const issues: Diagnostic[] = [];
  const ids = new Set<string>();
  const checkId = (id: string | undefined, path: string) => {
    if (!id) return;
    if (ids.has(id)) issues.push({ path: `${path}/id`, message: `Duplicate ID: ${id}.` });
    ids.add(id);
  };
  checkId(document.body.id, '/body');
  const containers = document.body.containers.map((container, ci): NormalizedContainer => {
    const cp = `/body/containers/${ci}`;
    checkId(container.id, cp);
    return { ...container, seam: container.seam ?? { type: 'seamless' }, flow: container.flow.map((item, pi) => {
      if (item.type === 'space') return { ...item, background: item.background ?? '#ffffff' };
      const pp = `${cp}/flow/${pi}`;
      checkId(item.id, pp);
      const frames = item.frames.map((frame, fi): NormalizedFrame => {
        const fp = `${pp}/frames/${fi}`;
        checkId(frame.id, fp);
        const flow = frame.flow ?? (frame.type === 'background' ? 'overlay' : 'normal');
        const issue = (field: string, message: string) => issues.push({ path: `${fp}/${field}`, message });
        if (frame.type === 'background' && frame.position) issue('position', 'Background fills its Panel; custom positioning is not supported in 0.1.');
        if (frame.type !== 'background' && flow !== 'normal' && !frame.position) issue('position', 'Overlay and overflow Frames require a position.');
        if (flow === 'normal' && frame.position && (frame.position.anchor !== 'top-left' || [frame.position.x, frame.position.y].some(v => v !== undefined && parseFloat(v) !== 0))) {
          issue('position', 'Normal Frames use top-left with zero offsets; use overlay or overflow for anchoring.');
        }
        if (frame.type === 'image' && frame.fit === 'width' && frame.position?.height && frame.position.height !== 'auto') issue('position/height', 'Image fit=width requires automatic height.');
        if (frame.type === 'background') return { ...frame, flow: 'overlay' };
        return { ...frame, flow };
      });
      const height = item.height ?? { mode: 'auto' as const };
      if (['auto', 'content'].includes(height.mode) && !frames.some(frame => frame.flow === 'normal')) {
        issues.push({ path: `${pp}/height`, message: `${height.mode} height requires a normal-flow Image or text Frame.` });
      }
      return { ...item, height, frames };
    }) };
  });
  if (issues.length) throw new StoryValidationError(issues);
  return { ...document, body: { ...document.body, containers } };
}
