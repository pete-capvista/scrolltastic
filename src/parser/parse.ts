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
  let pinnedCardTransitionCount = 0;
  if (['0.6', '0.7'].includes(document.version)) {
    document.body.containers.forEach((container, ci) => container.flow.forEach((item, pi) => {
      if (item.type !== 'panel') return;
      item.frames.forEach((frame, fi) => {
        if (frame.type === 'card' && frame.artwork?.transition && frame.artwork.transition.scrollMode !== 'flow') {
          pinnedCardTransitionCount++;
          if (pinnedCardTransitionCount > 1) {
            issues.push({
              path: `/body/containers/${ci}/flow/${pi}/frames/${fi}/artwork/transition/scrollMode`,
              message: 'Only one pinned Card transition per story is supported. Set scrollMode to "flow" on other transitions.',
            });
          }
        }
      });
    }));
  }
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
        const flow = frame.flow ?? (frame.type === 'background' || frame.type === 'mask' ? 'overlay' : 'normal');
        const issue = (field: string, message: string) => issues.push({ path: `${fp}/${field}`, message });
        if (frame.type === 'background' && frame.position) issue('position', 'Background fills its Panel; custom positioning is not supported in 0.1.');
        if ('scrollAnimation' in frame && frame.scrollAnimation) {
          if (document.version === '0.1') issue('scrollAnimation', 'Scroll reveals require document version 0.2 or later.');
          const starts = ['top bottom', 'top 90%', 'top 82%', 'top 70%', 'top 55%', 'top center'];
          const ends = ['top 90%', 'top 82%', 'top 70%', 'top 55%', 'top center', 'bottom top'];
          const start = starts.indexOf(frame.scrollAnimation.start ?? 'top 82%');
          const end = ends.indexOf(frame.scrollAnimation.end ?? 'top 55%') + 1;
          if (start >= end) issue('scrollAnimation/end', 'Reveal end must follow start during forward scroll.');
        }
        if (frame.type === 'mask') {
          if (document.version === '0.1' || document.version === '0.2') issue('type', 'Mask Frames require document version 0.3 or later.');
          if (flow !== 'overlay') issue('flow', 'Mask Frames must use overlay flow.');
          if (!frame.position.height || frame.position.height === 'auto') issue('position/height', 'Mask Frames require an explicit height.');
          if (frame.transition?.range && frame.transition.range[0] >= frame.transition.range[1]) {
            issue('transition/range', 'Pull-focus range start must be less than its end.');
          }
        }
        if (frame.type === 'card') {
          if (['0.1', '0.2', '0.3'].includes(document.version)) issue('type', 'Standard Card Frames require document version 0.4 or later.');
          const { artWindow } = frame.cardGeometry;
          if (artWindow.x + artWindow.width > 1 || artWindow.y + artWindow.height > 1) {
            issue('cardGeometry/artWindow', 'The artwork window must fit within the normalized card bounds.');
          }
          if (frame.artwork?.transition) {
            const transition = frame.artwork.transition;
            const presentation = transition.presentation;
            const direction = transition.direction;
            if (presentation === 'crop' && (direction !== 'out' || !['0.5', '0.6', '0.7'].includes(document.version))) issue('artwork/transition', 'Standard-card OUT + CROP requires document version 0.5 or later.');
            if (presentation === 'fit' && direction === 'out' && !['0.6', '0.7'].includes(document.version)) issue('artwork/transition', 'Standard-card OUT + FIT requires document version 0.6 or later.');
            if (presentation === 'fit' && direction === 'in' && document.version !== '0.7') issue('artwork/transition', 'Standard-card IN + FIT requires document version 0.7.');
            if (direction === 'in' && presentation !== 'fit') issue('artwork/transition', 'Only IN + FIT is supported; IN + CROP is not implemented.');
            if (!['0.6', '0.7'].includes(document.version) && transition.scrollMode) issue('artwork/transition/scrollMode', 'scrollMode requires document version 0.6 or later.');
            if (presentation === 'fit' && transition.focus) issue('artwork/transition/focus', 'FIT transitions do not accept a focus point.');
            if (direction === 'out' && transition.inRange) issue('artwork/transition/inRange', 'inRange is only valid for an IN transition.');
            if (direction === 'in' && transition.outRange) issue('artwork/transition/outRange', 'outRange is only valid for an OUT transition.');
            const range = direction === 'in' ? transition.inRange : transition.outRange;
            const [start, end] = range ?? (presentation === 'fit' ? [0.18, 0.68] : [0.18, 0.73]);
            if (start >= end) issue(`artwork/transition/${direction === 'in' ? 'inRange' : 'outRange'}`, `${direction.toUpperCase()} transition range start must be less than its end.`);
            if (presentation === 'fit' && !['auto', 'content'].includes(item.height?.mode ?? 'auto')) issue('artwork/transition', 'FIT transitions require a Panel with auto or content height.');
          }
        }
        if (frame.type !== 'background' && flow !== 'normal' && !frame.position) issue('position', 'Overlay and overflow Frames require a position.');
        if (flow === 'normal' && frame.position && (frame.position.anchor !== 'top-left' || [frame.position.x, frame.position.y].some(v => v !== undefined && parseFloat(v) !== 0))) {
          issue('position', 'Normal Frames use top-left with zero offsets; use overlay or overflow for anchoring.');
        }
        if (frame.type === 'image' && frame.fit === 'width' && frame.position?.height && frame.position.height !== 'auto') issue('position/height', 'Image fit=width requires automatic height.');
        if (frame.type === 'background' || frame.type === 'mask') return { ...frame, flow: 'overlay' };
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
