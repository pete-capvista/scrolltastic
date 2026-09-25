import validateSchema from './story-validator.generated.js';
import type { StoryDocument } from '../model/story.generated';
import type { ValidateFunction } from 'ajv';

export interface Diagnostic { path: string; message: string }
export class StoryValidationError extends Error {
  constructor(public readonly diagnostics: Diagnostic[]) {
    super(diagnostics.map(({ path, message }) => `${path || '/'}: ${message}`).join('\n'));
    this.name = 'StoryValidationError';
  }
}
export type { NormalizedStory, NormalizedFrame, NormalizedPanel } from '../model/normalized';
import type { NormalizedStory, NormalizedFrame, NormalizedContainer } from '../model/normalized';
const validate = validateSchema as ValidateFunction<StoryDocument>;

function parseValidatedStory(input: unknown): NormalizedStory {
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
  walk(document, (node, path) => {
    if (typeof node.language === 'string') {
      try { Intl.getCanonicalLocales(node.language); }
      catch { issues.push({ path: `${path}/language`, message: 'Expected a valid BCP 47 language tag.' }); }
    }
    if (node.decorative === true && typeof node.alt === 'string' && node.alt.trim()) {
      issues.push({ path: `${path}/alt`, message: 'Decorative media must not also declare meaningful alternative text.' });
    }
  });
  let beatCount = document.beats?.length ?? 0;
  const targets = new Set<string>();
  const interaction = document.body.interaction;
  if (interaction?.scroll?.snap === 'beats') {
    if (!interaction.advance.enabled) issues.push({ path: '/body/interaction/scroll/snap', message: 'Beat snapping requires enabled Beat navigation and visible controls.' });
    if (interaction.advance.inputs?.includes('flip')) issues.push({ path: '/body/interaction/scroll/snap', message: 'Beat snapping cannot be combined with Flip input.' });
  }
  let pinnedCardTransitionCount = 0;
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
  const checkId = (id: string | undefined, path: string) => {
    if (!id) return;
    if (ids.has(id)) issues.push({ path: `${path}/id`, message: `Duplicate ID: ${id}.` });
    ids.add(id);
  };
  const checkBeats = (beats: readonly { id: string }[] | undefined, path: string) => {
    if (!beats) return;
    beatCount += beats.length;
    beats.forEach((beat, index) => checkId(beat.id, `${path}/${index}`));
  };
  const checkElementBeat = (beat: { id: string } | undefined, path: string) => {
    if (!beat) return;
    beatCount++;
    checkId(beat.id, path);
  };
  checkId(document.id, '');
  const containers = document.body.containers.map((container, ci): NormalizedContainer => {
    const cp = `/body/containers/${ci}`;
    checkId(container.id, cp);
    return { ...container, seam: container.seam ?? { type: 'seamless' }, flow: container.flow.map((item, pi) => {
      if (item.type === 'space') return { ...item, background: item.background ?? '#ffffff' };
      const pp = `${cp}/flow/${pi}`;
      checkId(item.id, pp);
      targets.add(item.id);
      checkElementBeat(item.beat, `${pp}/beat`);
      const frames = item.frames.map((frame, fi): NormalizedFrame => {
        const fp = `${pp}/frames/${fi}`;
        checkId(frame.id, fp);
        if (frame.id) targets.add(frame.id);
        checkElementBeat(frame.beat, `${fp}/beat`);
        if (frame.type === 'mask') checkBeats(frame.transition?.beats, `${fp}/transition/beats`);
        if (frame.type === 'card') checkBeats(frame.artwork?.transition.beats, `${fp}/artwork/transition/beats`);
        const flow = frame.flow ?? (frame.type === 'background' || frame.type === 'mask' ? 'overlay' : 'normal');
        const issue = (field: string, message: string) => issues.push({ path: `${fp}/${field}`, message });
        if (frame.type === 'background' && frame.position) issue('position', 'Background fills its Panel; custom positioning is not supported.');
        if ('scrollAnimation' in frame && frame.scrollAnimation) {
          const starts = ['top bottom', 'top 90%', 'top 82%', 'top 70%', 'top 55%', 'top center'];
          const ends = ['top 90%', 'top 82%', 'top 70%', 'top 55%', 'top center', 'bottom top'];
          const start = starts.indexOf(frame.scrollAnimation.start ?? 'top 82%');
          const end = ends.indexOf(frame.scrollAnimation.end ?? 'top 55%') + 1;
          if (start >= end) issue('scrollAnimation/end', 'Reveal end must follow start during forward scroll.');
        }
        if (frame.type === 'mask') {
          if (flow !== 'overlay') issue('flow', 'Mask Frames must use overlay flow.');
          if (!frame.position.height || frame.position.height === 'auto') issue('position/height', 'Mask Frames require an explicit height.');
          if (frame.transition?.range && frame.transition.range[0] >= frame.transition.range[1]) {
            issue('transition/range', 'Pull-focus range start must be less than its end.');
          }
        }
        if (frame.type === 'card') {
          const artWindow = frame.cardGeometry?.artWindow;
          if (artWindow && (artWindow.x + artWindow.width > 1 || artWindow.y + artWindow.height > 1)) {
            issue('cardGeometry/artWindow', 'The artwork window must fit within the normalized card bounds.');
          }
          if (frame.artwork?.transition) {
            if (!frame.cardGeometry) issue('cardGeometry', 'Card transitions require an artwork window.');
            if (!frame.aspectRatio) issue('aspectRatio', 'Card transitions require an explicit aspect ratio.');
            const transition = frame.artwork.transition;
            const presentation = transition.presentation;
            const direction = transition.direction;
            if (direction === 'in' && presentation !== 'fit') issue('artwork/transition', 'Only IN + FIT is supported; IN + CROP is not implemented.');
            if (presentation === 'fit' && 'focus' in transition && transition.focus) issue('artwork/transition/focus', 'FIT transitions do not accept a focus point.');
            if (direction === 'out' && transition.inRange) issue('artwork/transition/inRange', 'inRange is only valid for an IN transition.');
            if (direction === 'in' && transition.outRange) issue('artwork/transition/outRange', 'outRange is only valid for an OUT transition.');
            if (direction === 'both') {
              const ranges = [transition.inRange, transition.holdRange, transition.outRange];
              for (const [index, name] of ['inRange', 'holdRange', 'outRange'].entries()) {
                if (ranges[index][0] >= ranges[index][1]) issue(`artwork/transition/${name}`, 'Phase range start must be less than its end.');
                if (index > 0 && ranges[index][0] < ranges[index - 1][1]) issue(`artwork/transition/${name}`, 'BOTH phase ranges must be ordered and non-overlapping.');
              }
            }
            const range = direction === 'in' ? transition.inRange : transition.outRange;
            const [start, end] = range ?? (presentation === 'fit' ? [0.18, 0.68] : [0.18, 0.73]);
            if (start >= end) issue(`artwork/transition/${direction === 'in' ? 'inRange' : 'outRange'}`, `${direction.toUpperCase()} transition range start must be less than its end.`);
            if (presentation === 'fit' && !['auto', 'content'].includes((typeof item.height === 'string' ? item.height : item.height?.mode) ?? 'auto')) issue('artwork/transition', 'FIT transitions require a Panel with auto or content height.');
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
      const height = typeof item.height === 'string' ? { mode: item.height } : item.height ?? { mode: 'auto' as const };
      if (['auto', 'content'].includes(height.mode) && !frames.some(frame => frame.flow === 'normal')) {
        issues.push({ path: `${pp}/height`, message: `${height.mode} height requires a normal-flow Image or text Frame.` });
      }
      return { ...item, height, frames };
    }) };
  });
  document.beats?.forEach((beat, index) => {
    checkId(beat.id, `/beats/${index}`);
    if (!targets.has(beat.target)) issues.push({ path: `/beats/${index}/target`, message: 'Beat target must identify a Panel or Frame.' });
  });
  if (document.body.interaction?.advance.enabled && beatCount === 0) {
    issues.push({ path: '/body/interaction/advance', message: 'Enabled Beat navigation requires at least one authored Beat.' });
  }
  if (issues.length) throw new StoryValidationError(issues);
  return { ...document, body: { ...document.body, containers } };
}

/** Visit authored objects without interpreting strings as code or markup. */
function walk(value: unknown, visit: (node: Record<string, unknown>, path: string, language?: string) => void, path = '', inheritedLanguage?: string): void {
  if (Array.isArray(value)) value.forEach((child, index) => walk(child, visit, `${path}/${index}`, inheritedLanguage));
  else if (value && typeof value === 'object') {
    const node = value as Record<string, unknown>;
    const language = typeof node.language === 'string' ? node.language : inheritedLanguage;
    visit(node, path, language);
    for (const [key, child] of Object.entries(node)) if (key !== 'metadata') walk(child, visit, `${path}/${key}`, language);
  }
}

export interface ValidationDiagnostic extends Diagnostic {
  code: string;
  severity: 'error' | 'warning';
  category: 'validation' | 'authoring' | 'accessibility' | 'compatibility';
}
export interface ValidationResult {
  document?: NormalizedStory;
  diagnostics: ValidationDiagnostic[];
}
export function validateStory(input: unknown): ValidationResult {
  let document: NormalizedStory;
  try { document = parseValidatedStory(input); }
  catch (error) {
    if (!(error instanceof StoryValidationError)) throw error;
    return { diagnostics: error.diagnostics.map(issue => ({ ...issue, code: 'invalid-story', severity: 'error', category: 'validation' })) };
  }
  const diagnostics: ValidationDiagnostic[] = [];
  walk(document, (node, path, language) => {
    if ('src' in node && node.type !== 'background' && node.decorative !== true && !(typeof node.alt === 'string' && node.alt.trim())) {
      diagnostics.push({ path: `${path}/alt`, message: 'Meaningful image has no alternative text.', code: 'missing-alt', severity: 'warning', category: 'accessibility' });
    }
    if (node.type === 'narrative' && typeof node.text === 'string') {
      const words = [...new Intl.Segmenter(language, { granularity: 'word' }).segment(node.text)].filter(part => part.isWordLike).length;
      if (words > 100) diagnostics.push({ path: `${path}/text`, message: `Narrative contains ${words} words. Consider splitting it across Beats.`, code: 'long-narrative', severity: 'warning', category: 'authoring' });
    }
  });
  return { document, diagnostics };
}

export function parseStory(input: unknown): NormalizedStory {
  const result = validateStory(input);
  if (!result.document) throw new StoryValidationError(result.diagnostics);
  return result.document;
}
