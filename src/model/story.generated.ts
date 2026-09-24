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
export type Height =
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
 * via the `definition` "Asset".
 */
export type Asset = string;
/**
 * This interface was referenced by `StoryDocument`'s JSON-Schema
 * via the `definition` "MaskShape".
 */
export type MaskShape = EllipseMaskShape | RoundedRectMaskShape | PolygonMaskShape;

/**
 * Scrolltastic renderer contract 0.1 through 0.6. Unsupported capabilities are rejected.
 */
export interface StoryDocument {
  /**
   * Version 0.2 adds scroll reveals; version 0.3 adds shaped Mask Frames and pull-focus; version 0.4 adds static standard Cards; version 0.5 adds OUT + CROP; version 0.6 adds OUT + FIT.
   */
  version: "0.1" | "0.2" | "0.3" | "0.4" | "0.5" | "0.6";
  body: Body;
}
/**
 * This interface was referenced by `StoryDocument`'s JSON-Schema
 * via the `definition` "Body".
 */
export interface Body {
  id: string;
  title: string;
  orientation?: "portrait";
  motion?: {
    reducedMotion: "respect-system";
  };
  /**
   * @minItems 1
   */
  containers: [Container, ...Container[]];
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
}
/**
 * This interface was referenced by `StoryDocument`'s JSON-Schema
 * via the `definition` "Panel".
 */
export interface Panel {
  type: "panel";
  id: Id;
  height?: Height;
  /**
   * @minItems 1
   */
  frames: [Frame, ...Frame[]];
}
/**
 * This interface was referenced by `StoryDocument`'s JSON-Schema
 * via the `definition` "BackgroundFrame".
 */
export interface BackgroundFrame {
  id?: Id;
  flow?: "overlay";
  position?: Position;
  type: "background";
  asset: Asset;
  fit?: "cover" | "contain";
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
 * via the `definition` "ImageFrame".
 */
export interface ImageFrame {
  id?: Id;
  flow?: "normal" | "overlay" | "overflow";
  position?: Position;
  type: "image";
  asset: Asset;
  alt: string;
  aspectRatio: number;
  fit?: "contain" | "cover" | "width";
}
/**
 * This interface was referenced by `StoryDocument`'s JSON-Schema
 * via the `definition` "NarrativeFrame".
 */
export interface NarrativeFrame {
  id?: Id;
  flow?: "normal" | "overlay" | "overflow";
  position?: Position;
  type: "narrative";
  text: string;
  shape?: "oblong";
  scrollAnimation?: RevealAnimation;
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
  id?: Id;
  flow?: "normal" | "overlay" | "overflow";
  position?: Position;
  type: "dialogue";
  text: string;
  shape?: "fat-circle";
  scrollAnimation?: RevealAnimation;
}
/**
 * This interface was referenced by `StoryDocument`'s JSON-Schema
 * via the `definition` "MaskFrame".
 */
export interface MaskFrame {
  id?: Id;
  flow?: "overlay";
  position: Position;
  type: "mask";
  shape: MaskShape;
  content: {
    asset: Asset;
    alt: string;
    fit?: "cover" | "contain";
    focus?: {
      x: number;
      y: number;
    };
  };
  transition?: MaskFocusTransition;
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
  type: "pull-focus";
  /**
   * @minItems 2
   * @maxItems 2
   */
  range?: [number, number];
}
/**
 * This interface was referenced by `StoryDocument`'s JSON-Schema
 * via the `definition` "CardFrame".
 */
export interface CardFrame {
  id?: Id;
  flow?: "normal" | "overlay" | "overflow";
  position?: Position;
  type: "card";
  cardType: "standard";
  asset: Asset;
  alt: string;
  aspectRatio: number;
  cardGeometry: {
    artWindow: {
      x: number;
      y: number;
      width: number;
      height: number;
    };
  };
  artwork?: {
    transition: {
      direction: "out";
      presentation: "crop" | "fit";
      scrollMode?: "pin" | "flow";
      /**
       * @minItems 2
       * @maxItems 2
       */
      outRange?: [number, number];
      focus?: {
        x: number;
        y: number;
      };
    };
  };
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
