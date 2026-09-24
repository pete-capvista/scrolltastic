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
export type Frame = BackgroundFrame | ImageFrame | NarrativeFrame | DialogueFrame;
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
 * Scrolltastic static renderer contract 0.1. Unsupported capabilities are rejected.
 */
export interface StoryDocument {
  version: "0.1";
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
