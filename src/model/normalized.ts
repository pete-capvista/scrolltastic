import type { StoryDocument, Frame, Panel, Container } from './story.generated';

export type FrameFlow = 'normal' | 'overlay' | 'overflow';
export type NormalizedFrame = Frame & { flow: FrameFlow };
export type NormalizedPanel = Omit<Panel, 'frames' | 'height'> & {
  height: Exclude<NonNullable<Panel['height']>, string>; frames: NormalizedFrame[];
};
export type NormalizedContainer = Omit<Container, 'flow'> & {
  flow: (NormalizedPanel | Extract<Container['flow'][number], { type: 'space' }>)[];
};
export type NormalizedStory = Omit<StoryDocument, 'body'> & {
  body: Omit<StoryDocument['body'], 'containers'> & { containers: NormalizedContainer[] };
};
