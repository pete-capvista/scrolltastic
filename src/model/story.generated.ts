/* Generated from story.schema.json. Run npm run generate; do not edit. */

/**
 * This interface was referenced by `StoryDocument`'s JSON-Schema
 * via the `definition` "Id".
 */
export type Id = string;
/**
 * This interface was referenced by `StoryDocument`'s JSON-Schema
 * via the `definition` "Height".
 */
export type Height = ("auto" | "content" | "viewport") | HeightObject;
/**
 * This interface was referenced by `StoryDocument`'s JSON-Schema
 * via the `definition` "HeightObject".
 */
export type HeightObject =
  | {
      mode: "auto";
    }
  | {
      mode: "content";
    }
  | {
      mode: "viewport";
      value?: number;
    }
  | {
      mode: "fixed";
      value: Length;
    };
/**
 * This interface was referenced by `StoryDocument`'s JSON-Schema
 * via the `definition` "Length".
 */
export type Length = string;
/**
 * This interface was referenced by `StoryDocument`'s JSON-Schema
 * via the `definition` "Frame".
 */
export type Frame = BackgroundFrame | ImageFrame | NarrativeFrame | DialogueFrame | MaskFrame | CardFrame;
/**
 * This interface was referenced by `StoryDocument`'s JSON-Schema
 * via the `definition` "Offset".
 */
export type Offset = string;
/**
 * This interface was referenced by `StoryDocument`'s JSON-Schema
 * via the `definition` "Size".
 */
export type Size = string;
/**
 * This interface was referenced by `StoryDocument`'s JSON-Schema
 * via the `definition` "Colour".
 */
export type Colour = string;
/**
 * This interface was referenced by `StoryDocument`'s JSON-Schema
 * via the `definition` "Asset".
 */
export type Asset = string;
/**
 * This interface was referenced by `StoryDocument`'s JSON-Schema
 * via the `definition` "MaskShape".
 */
export type MaskShape = EllipseMaskShape | RoundedRectMaskShape | PolygonMaskShape;
/**
 * @minItems 1
 *
 * This interface was referenced by `StoryDocument`'s JSON-Schema
 * via the `definition` "TimelineBeats".
 */
export type TimelineBeats = [TimelineBeat, ...TimelineBeat[]];

/**
 * Scrolltastic Story Language 5. Unsupported capabilities are rejected.
 */
export interface StoryDocument {
  body: Body;
  storyLanguage: "5";
  id: string;
  title: string;
  language?: string;
  direction?: "ltr" | "rtl" | "auto";
  beats?: RootBeat[];
  metadata?: {
    [k: string]: string | number | boolean | null;
  };
  accessibility?: {
    summary?: string;
  };
}
/**
 * This interface was referenced by `StoryDocument`'s JSON-Schema
 * via the `definition` "Body".
 */
export interface Body {
  interaction?: {
    advance: {
      enabled: boolean;
      mode: "beats";
      /**
       * Defaults to controls only. Visible controls are required; keyboard, Flip and tap are optional.
       *
       * @minItems 1
       */
      inputs?: ["controls" | "keyboard" | "flip" | "tap", ...("controls" | "keyboard" | "flip" | "tap")[]];
    };
    scroll?: {
      snap: "none" | "beats";
    };
  };
  orientation?: "portrait";
  motion?: {
    reducedMotion: "respect-system";
  };
  /**
   * @minItems 1
   */
  containers: [Container, ...Container[]];
  language?: string;
  direction?: "ltr" | "rtl" | "auto";
  typography?: Typography;
  color?: Colour;
  background?: Colour;
}
/**
 * This interface was referenced by `StoryDocument`'s JSON-Schema
 * via the `definition` "Container".
 */
export interface Container {
  type: "container";
  id: Id;
  seam?: {
    type: "seamless";
  };
  /**
   * @minItems 1
   */
  flow: [Panel | Space, ...(Panel | Space)[]];
  language?: string;
  direction?: "ltr" | "rtl" | "auto";
  typography?: Typography;
  color?: Colour;
}
/**
 * This interface was referenced by `StoryDocument`'s JSON-Schema
 * via the `definition` "Panel".
 */
export interface Panel {
  beat?: ElementBeat;
  type: "panel";
  id: Id;
  height?: Height;
  /**
   * @minItems 1
   */
  frames: [Frame, ...Frame[]];
  language?: string;
  direction?: "ltr" | "rtl" | "auto";
  typography?: Typography;
  color?: Colour;
  background?: Colour;
  padding?: "none" | "small" | "medium" | "large";
  gap?: "none" | "small" | "medium" | "large";
  radius?: "none" | "small" | "medium" | "large";
  border?: {
    color: Colour;
    width?: "thin" | "medium" | "thick";
  };
  opacity?: number;
  align?: "start" | "center" | "end";
  overflow?: "visible" | "hidden";
}
/**
 * This interface was referenced by `StoryDocument`'s JSON-Schema
 * via the `definition` "ElementBeat".
 */
export interface ElementBeat {
  id: Id;
  align?: "start" | "center" | "end";
  offset?: string;
  label?: string;
}
/**
 * This interface was referenced by `StoryDocument`'s JSON-Schema
 * via the `definition` "BackgroundFrame".
 */
export interface BackgroundFrame {
  beat?: ElementBeat;
  id?: Id;
  flow?: "overlay";
  position?: Position;
  type: "background";
  fit?: "cover" | "contain";
  language?: string;
  direction?: "ltr" | "rtl" | "auto";
  typography?: Typography;
  color?: Colour;
  src: Asset;
}
/**
 * This interface was referenced by `StoryDocument`'s JSON-Schema
 * via the `definition` "Position".
 */
export interface Position {
  anchor: "top-left" | "top" | "top-right" | "left" | "center" | "right" | "bottom-left" | "bottom" | "bottom-right";
  x?: Offset;
  y?: Offset;
  width?: Size;
  height?: Size | "auto";
  z?: number;
}
/**
 * This interface was referenced by `StoryDocument`'s JSON-Schema
 * via the `definition` "Typography".
 */
export interface Typography {
  font?: "story-sans" | "story-serif" | "comic" | "handwritten" | "dramatic" | "technical";
  size?: "small" | "medium" | "large" | "x-large";
  weight?: "normal" | "bold";
  style?: "normal" | "italic";
  align?: "start" | "center" | "end";
  lineHeight?: "compact" | "normal" | "relaxed";
  letterSpacing?: "normal" | "wide";
}
/**
 * This interface was referenced by `StoryDocument`'s JSON-Schema
 * via the `definition` "ImageFrame".
 */
export interface ImageFrame {
  beat?: ElementBeat;
  id?: Id;
  flow?: "normal" | "overlay" | "overflow";
  position?: Position;
  type: "image";
  alt?: string;
  aspectRatio?: number;
  fit?: "contain" | "cover" | "width";
  language?: string;
  direction?: "ltr" | "rtl" | "auto";
  typography?: Typography;
  color?: Colour;
  src: Asset;
  decorative?: boolean;
}
/**
 * This interface was referenced by `StoryDocument`'s JSON-Schema
 * via the `definition` "NarrativeFrame".
 */
export interface NarrativeFrame {
  beat?: ElementBeat;
  id?: Id;
  flow?: "normal" | "overlay" | "overflow";
  position?: Position;
  type: "narrative";
  text: string;
  shape?: "oblong";
  scrollAnimation?: RevealAnimation;
  language?: string;
  direction?: "ltr" | "rtl" | "auto";
  typography?: Typography;
  color?: Colour;
}
/**
 * This interface was referenced by `StoryDocument`'s JSON-Schema
 * via the `definition` "RevealAnimation".
 */
export interface RevealAnimation {
  type: "reveal";
  start?: "top bottom" | "top 90%" | "top 82%" | "top 70%" | "top 55%" | "top center";
  end?: "top 90%" | "top 82%" | "top 70%" | "top 55%" | "top center" | "bottom top";
  from?: {
    opacity?: number;
    yPercent?: number;
    scale?: number;
  };
}
/**
 * This interface was referenced by `StoryDocument`'s JSON-Schema
 * via the `definition` "DialogueFrame".
 */
export interface DialogueFrame {
  beat?: ElementBeat;
  id?: Id;
  flow?: "normal" | "overlay" | "overflow";
  position?: Position;
  type: "dialogue";
  text: string;
  shape?: "fat-circle";
  scrollAnimation?: RevealAnimation;
  language?: string;
  direction?: "ltr" | "rtl" | "auto";
  typography?: Typography;
  color?: Colour;
  speaker?: string;
}
/**
 * This interface was referenced by `StoryDocument`'s JSON-Schema
 * via the `definition` "MaskFrame".
 */
export interface MaskFrame {
  beat?: ElementBeat;
  id?: Id;
  flow?: "overlay";
  position: Position;
  type: "mask";
  shape: MaskShape;
  content: {
    alt?: string;
    fit?: "cover" | "contain";
    focus?: {
      x: number;
      y: number;
    };
    src: Asset;
    decorative?: boolean;
  };
  transition?: MaskFocusTransition;
  language?: string;
  direction?: "ltr" | "rtl" | "auto";
  typography?: Typography;
  color?: Colour;
}
/**
 * This interface was referenced by `StoryDocument`'s JSON-Schema
 * via the `definition` "EllipseMaskShape".
 */
export interface EllipseMaskShape {
  type: "ellipse";
}
/**
 * This interface was referenced by `StoryDocument`'s JSON-Schema
 * via the `definition` "RoundedRectMaskShape".
 */
export interface RoundedRectMaskShape {
  type: "rounded-rect";
}
/**
 * This interface was referenced by `StoryDocument`'s JSON-Schema
 * via the `definition` "PolygonMaskShape".
 */
export interface PolygonMaskShape {
  type: "polygon";
  /**
   * @minItems 3
   */
  points: [[number, number], [number, number], [number, number], ...[number, number][]];
}
/**
 * This interface was referenced by `StoryDocument`'s JSON-Schema
 * via the `definition` "MaskFocusTransition".
 */
export interface MaskFocusTransition {
  beats?: TimelineBeats;
  type: "pull-focus";
  /**
   * @minItems 2
   * @maxItems 2
   */
  range?: [number, number];
}
/**
 * This interface was referenced by `StoryDocument`'s JSON-Schema
 * via the `definition` "TimelineBeat".
 */
export interface TimelineBeat {
  id: Id;
  progress: number;
  label?: string;
}
/**
 * This interface was referenced by `StoryDocument`'s JSON-Schema
 * via the `definition` "CardFrame".
 */
export interface CardFrame {
  beat?: ElementBeat;
  id?: Id;
  flow?: "normal" | "overlay" | "overflow";
  position?: Position;
  type: "card";
  cardType?: "standard";
  alt?: string;
  aspectRatio?: number;
  cardGeometry?: {
    artWindow: {
      x: number;
      y: number;
      width: number;
      height: number;
    };
  };
  artwork?: {
    transition:
      | {
          beats?: TimelineBeats;
          direction: "out" | "in";
          presentation: "crop" | "fit";
          scrollMode?: "pin" | "flow";
          /**
           * @minItems 2
           * @maxItems 2
           */
          outRange?: [number, number];
          /**
           * @minItems 2
           * @maxItems 2
           */
          inRange?: [number, number];
          focus?: {
            x: number;
            y: number;
          };
        }
      | BothFitTransition;
  };
  language?: string;
  direction?: "ltr" | "rtl" | "auto";
  typography?: Typography;
  color?: Colour;
  src: Asset;
  decorative?: boolean;
}
export interface BothFitTransition {
  beats?: TimelineBeats;
  direction: "both";
  presentation: "fit";
  scrollMode?: "pin" | "flow";
  /**
   * @minItems 2
   * @maxItems 2
   */
  inRange: [number, number];
  /**
   * @minItems 2
   * @maxItems 2
   */
  holdRange: [number, number];
  /**
   * @minItems 2
   * @maxItems 2
   */
  outRange: [number, number];
}
/**
 * This interface was referenced by `StoryDocument`'s JSON-Schema
 * via the `definition` "Space".
 */
export interface Space {
  type: "space";
  height: Length;
  background?: string;
}
/**
 * This interface was referenced by `StoryDocument`'s JSON-Schema
 * via the `definition` "RootBeat".
 */
export interface RootBeat {
  id: Id;
  align?: "start" | "center" | "end";
  offset?: string;
  label?: string;
  target: Id;
}
