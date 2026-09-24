Configurable Mobile Scrollytelling Design Specification & GSAP
Implementation Guide

Portrait-first • JSON-driven • Body → Container → Panel → Frame

Purpose: define a reusable visual grammar and implementation
architecture for a mobile-first scrollytelling engine. The system is
deliberately content-agnostic: stories are authored as JSON, rendered
into composable panels and frames, and animated with GSAP +
ScrollTrigger.

# 1. Core Design Model

# 2. Layout Principles

-   Portrait is the canonical experience. Panels should normally use the
    full available phone width; avoid decorative clipping that wastes
    horizontal space.

-   Comic-book energy comes from frame geometry, overlap, layering,
    masks and transitions rather than narrowing the main panel.

-   Container owns seams between adjacent panels: seamless, gutter,
    fade, or future composite layouts. This prevents neighbouring panels
    from fighting over border rules.

-   Panel height is a first-class animatable property. This is required
    for standard-card artwork transitions that preserve the full artwork
    aspect ratio.

-   Frames use independent z-order and may overlap other frames or panel
    boundaries when explicitly allowed.

# 3. Initial Frame Vocabulary

## Background frame

Full-bleed image/video/canvas; may support parallax and cinematic camera
motion.

## Narrative frame

Wide horizontal oblong, usually dark/semi-opaque with white text; may be
skewed or lightly irregular.

## Dialogue frame

Broad 'fat circle' / oval; optional subtle speaker pointer; deliberately
less cartoon-like than a classic speech balloon.

## Character frame

Foreground subject with anchor, depth, overlap, parallax and optional
breakout behaviour inside the panel composition.

## Card frame

Physical trading-card object. Central primitive with card-type-specific
transition capabilities.

## Effects frame

Particles, glow, fog, masks, foreground occlusion, light passes and
other non-semantic visual layers.

## Title/location frame

Compact title, chapter, location or date treatment.

# 4. Card Frame Model

Card frames are discriminated by cardType. The renderer must validate
behaviours by type rather than silently ignoring unsupported options.

## 4.1 Standard card

A standard card has a discrete artwork window. The artwork can be
isolated from the physical card and become panel content, or panel
artwork can condense into the card. This creates a reversible card ↔
artwork transition.

-   direction: none \| in \| out \| both

-   presentation: crop \| fit

-   crop focus: optional normalised x/y focal point

-   card presentation: scale, rotation, perspective, shadow,
    overlapNextPanel

-   transition phases should be scrubbed against scroll progress, not
    played as an independent timed animation.

## 4.2 Full-art card

A full-art card does not use the standard artwork-window extraction
options. Its future transition vocabulary is intentionally undefined.
Likely experiments include UI/text dissolve, border disappearance, art
extension, depth separation and parallax extraction, but these are not
part of v1.

# 5. Standard Card Transition Modes

# 6. JSON Configuration

Illustrative v1 structure (names may be refined when the formal JSON
Schema is produced):

    {

      "body": {

        "id": "story-01",

        "orientation": "portrait",

        "motion": { "reducedMotion": "respect-system" },

        "containers": [

          {

            "id": "c-card-sequence",

            "seam": "seamless",

            "panels": [

              {

                "id": "p-card",

                "height": { "mode": "viewport", "value": 1.0 },

                "frames": [

                  {

                    "id": "hero-card",

                    "type": "card",

                    "cardType": "standard",

                    "asset": "card-front.png",

                    "presentation": {

                      "scale": 0.9,

                      "rotation": -2,

                      "overlapNextPanel": 0.06

                    },

                    "artwork": {

                      "asset": "card-art.png",

                      "transition": {

                        "direction": "both",

                        "presentation": "fit",

                        "inRange":  [0.05, 0.30],

                        "holdRange":[0.30, 0.62],

                        "outRange": [0.62, 0.95]

                      }

                    }

                  }

                ]

              }

            ]

          }

        ]

      }

    }

# 7. Rendering Architecture

Render JSON into semantic DOM first, then attach animation controllers.
Keep content construction separate from GSAP setup so the same story can
render statically, support reduced motion, and be tested without
animation.

    <body class="story-body">

      <section class="story-container">

        <article class="story-panel" data-panel-id="p-card">

          <div class="frame frame--background"></div>



          <div class="frame frame--card" data-card-type="standard">

            <img class="card-front" src="card-front.png" alt="">

            <div class="card-art-mask">

              <img class="card-art" src="card-art.png" alt="">

            </div>

          </div>

        </article>



        <article class="story-panel story-panel--next">...</article>

      </section>

    </body>

# 8. GSAP + ScrollTrigger Foundation

Use one scrubbed GSAP timeline per complex panel or tightly coupled
container sequence. ScrollTrigger maps native scroll progress onto that
timeline. Pin only when the visual beat requires the panel to remain
stationary while internal frames transform; otherwise prefer normal
document flow.

    import gsap from "gsap";

    import { ScrollTrigger } from "gsap/ScrollTrigger";



    gsap.registerPlugin(ScrollTrigger);



    export function createPanelTimeline(panel, config) {

      const tl = gsap.timeline({

        defaults: { ease: "none" },

        scrollTrigger: {

          trigger: panel,

          start: "top top",

          end: () => `+=${panel.offsetHeight * 1.5}`,

          scrub: true,

          invalidateOnRefresh: true,

          // markers: true, // development only

        }

      });



      return tl;

    }

# 9. Component Implementation

## 9.1 Body

Body owns global initialization, responsive setup, reduced-motion
policy, asset readiness and final ScrollTrigger refresh. Use
gsap.matchMedia() for orientation/breakpoint-specific setup and
automatic cleanup.

    const mm = gsap.matchMedia();



    mm.add({

      portrait: "(orientation: portrait)",

      landscape: "(orientation: landscape)",

      reduceMotion: "(prefers-reduced-motion: reduce)"

    }, (context) => {

      const { portrait, landscape, reduceMotion } = context.conditions;



      if (reduceMotion) {

        document.documentElement.dataset.motion = "reduced";

        return;

      }



      if (portrait) initialisePortraitStory();

      if (landscape) initialiseLandscapeFallback();



      return () => teardownStory();

    });

## 9.2 Container

Container controls seams and coordinated transitions between panels. In
v1, keep panels in normal vertical document flow. For a fit transition,
animating the current panel's height naturally pulls the following panel
upward; avoid independently translating the next panel unless a specific
art direction requires it.

    .story-container { width: 100%; }

    .story-panel {

      position: relative;

      width: 100%;

      overflow: clip;

    }

    .story-container[data-seam="seamless"] .story-panel { margin: 0; }

## 9.3 Panel

Panel is the measurement boundary and clipping context. It should expose
CSS custom properties for height so GSAP can animate layout predictably.

    .story-panel {

      --panel-h: 100svh;

      min-height: var(--panel-h);

    }



    function setPanelHeight(panel, px) {

      gsap.set(panel, { "--panel-h": `${px}px` });

    }

## 9.4 Narrative frame

Animate opacity and a small y/scale offset. Avoid large lateral movement
on mobile. The oblong geometry should be CSS/SVG-driven, independent of
ScrollTrigger.

    tl.fromTo(narrative,

      { autoAlpha: 0, yPercent: 12, scale: 0.97 },

      { autoAlpha: 1, yPercent: 0, scale: 1, duration: 0.12 },

      0.08

    );

## 9.5 Dialogue frame

Use a broad oval/fat-circle frame. Reveal with opacity plus a restrained
scale. If a speaker pointer is used, make it a pseudo-element or SVG
path rather than part of the animation geometry.

    tl.fromTo(dialogue,

      { autoAlpha: 0, scale: 0.92 },

      { autoAlpha: 1, scale: 1, duration: 0.10 },

      0.45

    );

## 9.6 Character frame

Character depth is primarily z-index + transform. For parallax, map the
character to a smaller yPercent range than the background. Do not resize
the panel merely to create a breakout effect.

    tl.fromTo(character,

      { yPercent: 8, scale: 1.03 },

      { yPercent: -5, scale: 1.08, duration: 1 },

      0

    );

## 9.7 Card frame --- shared physical-card phase

Treat the physical card and artwork as separate layers from the start.
The artwork layer must be positioned so its mask can interpolate from
the card's artwork window to panel bounds.

    const card = panel.querySelector(".card-front");

    const mask = panel.querySelector(".card-art-mask");

    const art  = panel.querySelector(".card-art");



    gsap.set(card, { transformOrigin: "50% 50%" });

    gsap.set(mask, { overflow: "hidden" });

# 10. Standard Card: OUT + CROP

Keep panel height constant. Expand the artwork mask to panel bounds
while simultaneously fading the physical card chrome. Scale and
translate artwork according to the configured focus point so the
selected slice fills the portrait panel.

    function standardOutCrop(panel, cfg) {

      const card = panel.querySelector(".card-front");

      const mask = panel.querySelector(".card-art-mask");

      const art  = panel.querySelector(".card-art");



      const tl = createPanelTimeline(panel, cfg);



      tl.to(card, { autoAlpha: 0, duration: 0.35 }, 0.20)

        .to(mask, {

          inset: 0,

          borderRadius: 0,

          duration: 0.55

        }, 0.18)

        .to(art, {

          scale: () => computeCoverScale(art, panel),

          xPercent: () => focusX(cfg.artwork.transition.focus),

          yPercent: () => focusY(cfg.artwork.transition.focus),

          duration: 0.55

        }, 0.18);



      return tl;

    }

# 11. Standard Card: OUT + FIT

This is the key continuous-story transition. Compute the artwork's
displayed full-width height from its intrinsic aspect ratio. Animate the
panel from its card-scene height to that target height while the mask
expands and card chrome fades. Because the next panel remains in normal
flow, it rises naturally as the current panel contracts.

    function getFullWidthArtHeight(panel, art) {

      const ratio = art.naturalHeight / art.naturalWidth;

      return panel.clientWidth * ratio;

    }



    function standardOutFit(panel, cfg) {

      const card = panel.querySelector(".card-front");

      const mask = panel.querySelector(".card-art-mask");

      const art  = panel.querySelector(".card-art");



      const tl = createPanelTimeline(panel, cfg);



      tl.to(card, { autoAlpha: 0, duration: 0.30 }, 0.22)

        .to(mask, {

          inset: 0,

          borderRadius: 0,

          duration: 0.50

        }, 0.18)

        .to(panel, {

          minHeight: () => getFullWidthArtHeight(panel, art),

          duration: 0.50

        }, 0.18)

        .to(art, {

          width: "100%",

          height: "auto",

          x: 0,

          y: 0,

          scale: 1,

          duration: 0.50

        }, 0.18);



      return tl;

    }

# 12. Standard Card: IN + FIT

Reverse the spatial logic: begin with full-width artwork at
artwork-derived height, then expand panel height to the card scene while
contracting the mask to the card artwork window and revealing the
physical card.

    function standardInFit(panel, cfg) {

      const tl = standardOutFit(panel, cfg);

      tl.progress(1);

      tl.reverse(); // conceptual prototype



      // Production: build an explicit forward timeline for deterministic

      // scroll direction, refresh measurements and nested effects.

      return tl;

    }

# 13. Standard Card: BOTH + FIT

Use one timeline with three semantic phases: artwork-in, card-hold,
artwork-out. The JSON ranges define how much scroll distance each phase
receives. Do not create two independent ScrollTriggers for the same
panel; a single timeline prevents conflicting transforms and makes
reverse scrolling deterministic.

    function standardBothFit(panel, cfg) {

      const t = cfg.artwork.transition;

      const tl = createPanelTimeline(panel, cfg);



      addArtworkToCardPhase(tl, panel, cfg, t.inRange);

      addCardHoldPhase(tl, panel, cfg, t.holdRange);

      addCardToArtworkPhase(tl, panel, cfg, t.outRange);



      return tl;

    }

# 14. Card Mask Geometry

The hardest implementation detail is mapping the card artwork window to
panel coordinates. Prefer explicit metadata for each card asset
(normalised artwork-window x/y/width/height) rather than image analysis
at runtime.

    "cardGeometry": {

      "artWindow": {

        "x": 0.075,

        "y": 0.155,

        "width": 0.850,

        "height": 0.395

      }

    }

At runtime, multiply these normalised values by the rendered card
dimensions and transform them into panel coordinates. Animate mask
position/size from that rectangle to the target panel rectangle. CSS
clip-path: inset(...) is a good first implementation; SVG masks are
preferable later if irregular artwork windows or shaped reveals are
required.

# 15. ScrollTrigger Strategy

-   Use scrubbed timelines for transitions whose visual state must
    exactly follow scroll position.

-   Use pinning sparingly. A card transformation may pin its panel
    during the card-focused beat, but FIT transitions should ultimately
    return to normal document flow so neighbouring panels participate
    naturally.

-   Use function-based start/end and geometry values when measurements
    depend on viewport/card dimensions; set invalidateOnRefresh: true.

-   Call ScrollTrigger.refresh(true) after images/fonts load or after
    DOM changes that alter layout.

-   Use development markers while tuning start/end positions, then
    disable them in production.

-   Prefer gsap.matchMedia() over the older ScrollTrigger.matchMedia()
    API for responsive setup.

# 16. Mobile Viewport and Refresh

Mobile browser chrome can change viewport height while scrolling. Prefer
svh/dvh thoughtfully and test on iOS Safari and Android Chrome. Start
with native scrolling. ScrollTrigger.normalizeScroll() can be evaluated
only if real-device testing reveals unacceptable address-bar/jitter
behaviour; GSAP documents it as an opt-in/experimental technique rather
than a default.

    window.addEventListener("load", () => ScrollTrigger.refresh(true));



    document.fonts?.ready.then(() => ScrollTrigger.refresh(true));



    for (const img of document.images) {

      if (!img.complete) {

        img.addEventListener("load", () => ScrollTrigger.refresh(true), { once: true });

      }

    }

# 17. Reduced Motion and Accessibility

-   Respect prefers-reduced-motion. Render the same semantic content
    with transitions collapsed to stable end states.

-   Do not make essential narrative text exist only inside animation
    frames that are inaccessible to assistive technology.

-   Decorative card/background images may use empty alt text; meaningful
    images need story-appropriate alt text.

-   Keep native vertical scrolling and avoid gesture hijacking.

-   Narrative/dialogue frames require sufficient contrast and readable
    font sizes on narrow devices.

# 18. Performance Rules

-   Animate transform and opacity where possible. Panel-height animation
    necessarily causes layout; constrain it to the small number of FIT
    transitions where it is narratively valuable.

-   Pre-size images with intrinsic dimensions/aspect-ratio to avoid
    cumulative layout shift.

-   Preload card artwork needed for the next transition.

-   Use will-change only around active complex transitions; remove it
    afterwards rather than applying it globally.

-   Avoid per-scroll DOM reads. Measure geometry on setup/refresh, cache
    it, and let GSAP interpolate.

-   Prefer one timeline per coupled panel sequence over many competing
    triggers.

# 19. Validation Rules for the JSON Schema

-   frame.type = card requires cardType.

-   cardType = standard may specify artwork.transition.

-   cardType = full-art must reject standard artwork-window transition
    properties in v1.

-   presentation = crop may specify focus; fit does not require focus.

-   direction = both requires valid inRange, holdRange and outRange with
    monotonically increasing non-overlapping progress ranges.

-   FIT transitions require artwork intrinsic dimensions or explicit
    aspectRatio metadata.

-   All referenced assets must declare dimensions before animation
    initialization.

# 20. Recommended Build Order

1.  Implement static JSON renderer for Body → Container → Panel → Frame.

2.  Implement frame layering and the
    background/narrative/dialogue/character primitives without
    ScrollTrigger.

3.  Implement physical standard-card frame and explicit artwork-window
    geometry.

4.  Build OUT + CROP first: it validates masking without layout
    animation.

5.  Build OUT + FIT: add measured panel-height interpolation and verify
    next-panel pull-up.

6.  Build IN + FIT using explicit forward timeline logic.

7.  Build BOTH + FIT as one scrubbed timeline with configurable progress
    ranges.

8.  Add responsive/reduced-motion lifecycle with gsap.matchMedia().

9.  Real-device QA: iOS Safari and Android Chrome, slow/fast scroll,
    reverse scroll, orientation changes.

10. Only then define and prototype the separate full-art transition
    vocabulary.

# 21. Acceptance Tests

-   Scrolling forward and backward is visually reversible with no jumps.

-   OUT + CROP never changes panel height.

-   OUT + FIT preserves the complete artwork and visibly pulls the next
    panel upward as height contracts.

-   IN + FIT starts as full-width artwork and resolves cleanly into the
    physical card.

-   BOTH + FIT passes through a stable card-focused hold phase and
    returns to artwork.

-   Resizing/orientation change recalculates geometry without stale
    masks or trigger positions.

-   Full-art cards cannot accidentally invoke standard-card artwork
    extraction.

-   Reduced-motion mode remains understandable and fully navigable.

# 22. GSAP Reference Notes

Implementation assumptions were checked against current GSAP
documentation: ScrollTrigger supports scrub, pin, responsive setups,
function-based start/end positions, callbacks and automatic resize
recalculation. gsap.matchMedia() provides responsive setup/cleanup;
ScrollTrigger.refresh(true) provides a safe recalculation after layout
changes; scrollerProxy() is only needed for third-party custom
scrollers; normalizeScroll() is optional.

Official documentation: gsap.com/docs/v3/Plugins/ScrollTrigger/ and
gsap.com/docs/v3/GSAP/gsap.matchMedia()/

# Appendix A --- Suggested TypeScript Shape

    type CardType = "standard" | "full-art";

    type ArtDirection = "none" | "in" | "out" | "both";

    type ArtPresentation = "crop" | "fit";



    interface StoryBody {

      id: string;

      containers: StoryContainer[];

    }



    interface StoryContainer {

      id: string;

      seam?: "seamless" | "gutter" | "fade";

      panels: StoryPanel[];

    }



    interface StoryPanel {

      id: string;

      height?: PanelHeight;

      frames: StoryFrame[];

    }



    type StoryFrame =

      | BackgroundFrame

      | NarrativeFrame

      | DialogueFrame

      | CharacterFrame

      | CardFrame

      | EffectsFrame;



    interface StandardCardFrame {

      type: "card";

      cardType: "standard";

      asset: string;

      cardGeometry: {

        artWindow: NormalizedRect;

      };

      presentation?: CardPresentation;

      artwork?: {

        asset: string;

        aspectRatio?: number;

        transition?: StandardArtTransition;

      };

    }



    interface FullArtCardFrame {

      type: "card";

      cardType: "full-art";

      asset: string;

      presentation?: CardPresentation;

      fullArt?: Record<string, never>; // intentionally reserved in v1

    }



    type CardFrame = StandardCardFrame | FullArtCardFrame;

# 23. Extended Panel Composition: Space, Overflow and Focus Masks

Three related primitives extend the visual grammar: container-owned
whitespace between panels, frames that may extend into or beyond that
space, and shaped Mask Frames used to pull visual focus to a secondary
view.

## 23.1 Container whitespace / gutter

Whitespace between panels is structural content owned by the Container,
not a border painted by either neighbouring panel. It participates in
normal document flow and can create pacing, breathing room and a surface
into which overlay frames may extend.

    {

      "seam": {

        "type": "space",

        "size": "10vh",

        "background": "#ffffff"

      }

    }

-   Initial seam types: seamless \| space \| fade.

-   Whitespace remains part of the Container even when a
    narrative/dialogue frame overlaps it.

-   Do not implement shared whitespace as arbitrary margins on
    individual panels.

## 23.2 Frame overflow and external anchoring

Narrative, dialogue, title and selected foreground frames may
intentionally extend outside the panel. The panel remains full-width
while the frame is anchored to an edge and offset into the surrounding
Container space.

    {

      "type": "narrative",

      "shape": "oblong",

      "anchor": "top",

      "offset": { "x": "0%", "y": "-55%" },

      "overflow": "visible",

      "zIndex": 20

    }

    .story-panel { position: relative; }



    .panel-visual-viewport {

      position: absolute;

      inset: 0;

      overflow: clip;

    }



    .panel-frame-overlay {

      position: absolute;

      inset: 0;

      overflow: visible;

      pointer-events: none;

    }

## 23.3 GSAP treatment for overflow text

Overflow text should use restrained motion. Its configured anchor/offset
is the stable composition; GSAP normally adds only opacity and a small
transform.

    gsap.fromTo(frame,

      { autoAlpha: 0, yPercent: 8 },

      {

        autoAlpha: 1,

        yPercent: 0,

        ease: "none",

        scrollTrigger: {

          trigger: panel,

          start: "top 82%",

          end: "top 55%",

          scrub: true

        }

      }

    );

# 24. Mask Frame

A Mask Frame is a shaped viewport onto visual content. Unlike a
Character Frame, which places an object over the scene, a Mask Frame
reveals a second view through geometry. A common use is a pull-focus
shot: the base panel remains a wide scene while a left- or
right-positioned mask reveals a closer crop, alternate angle, character
detail or object of interest.

## 24.1 Configuration

    {

      "id": "focus-01",

      "type": "mask",

      "position": {

        "side": "left",

        "x": "4vw",

        "y": "18%",

        "width": "58%"

      },

      "shape": {

        "type": "polygon",

        "points": [

          [0.00, 0.08],

          [0.88, 0.00],

          [1.00, 0.82],

          [0.12, 1.00]

        ]

      },

      "content": {

        "type": "image",

        "asset": "character-closeup.jpg",

        "focus": { "x": 0.55, "y": 0.32 }

      },

      "transition": {

        "type": "pull-focus",

        "direction": "expand",

        "range": [0.20, 0.65]

      }

    }

## 24.2 Initial mask geometries

-   ellipse - soft portrait/detail focus.

-   rounded-rect - restrained editorial inset.

-   polygon - preferred comic/cinematic geometry; points use normalised
    0..1 coordinates.

-   path - future SVG path support for authored irregular masks.

## 24.3 Pull-focus behaviour with GSAP

Pull-focus may combine mask expansion, a small source-image push, subtle
base-scene dim/defocus and optional final takeover. All states must
remain reversible under scroll.

    function createPullFocus(panel, cfg) {

      const mask = panel.querySelector(`[data-frame-id="${cfg.id}"]`);

      const source = mask.querySelector(".mask-content");

      const base = panel.querySelector(".frame--background");



      const tl = gsap.timeline({

        scrollTrigger: {

          trigger: panel,

          start: "top top",

          end: "+=80%",

          scrub: true,

          invalidateOnRefresh: true

        }

      });



      tl.fromTo(mask,

          { clipPath: initialClip(cfg.shape), scale: 0.94, autoAlpha: 0 },

          { clipPath: expandedClip(cfg.shape), scale: 1, autoAlpha: 1,

            duration: 0.55, ease: "none" }, 0.15)

        .fromTo(source,

          { scale: 1.10 },

          { scale: 1.00, duration: 0.55, ease: "none" }, 0.15)

        .to(base,

          { filter: "brightness(0.82) blur(1.5px)",

            duration: 0.35, ease: "none" }, 0.28);



      return tl;

    }

## 24.4 Mask takeover

A Mask Frame may optionally expand until it becomes the full panel. At
completion the geometry resolves to the panel rectangle, the base scene
can fade away, and the mask content becomes the new cinematic background
state.

    "transition": {

      "type": "pull-focus",

      "direction": "expand",

      "takeover": true,

      "range": [0.18, 0.72]

    }

# 25. Updated Frame Placement Model

-   clip - frame is constrained to the panel visual viewport.

-   visible - frame may extend beyond the panel into Container
    whitespace.

-   overlap-top - frame crosses the preceding seam.

-   overlap-bottom - frame crosses the following seam/panel
    relationship.

-   takeover - mask/card-style transition resolves into full panel
    content.

# 26. Updated Validation Rules

-   Container seam type space requires a size and may define a
    background.

-   A frame with overflow visible must render in an unclipped overlay
    layer.

-   Mask Frames require shape, position and content.

-   Polygon points must be normalised coordinate pairs and contain at
    least three points.

-   Pull-focus takeover requires content capable of filling the panel.

-   Z-order must keep overflow narrative/dialogue frames visible across
    neighbouring panel boundaries.

# 27. Composition Patterns

-   Breathing beat: Panel -\> white-space seam -\> next Panel.

-   Narrative bridge: oblong narrative frame sits partly in whitespace
    and partly over the next Panel.

-   Dialogue bridge: fat-circle dialogue frame extends above a character
    Panel.

-   Pull focus left/right: full-width establishing shot plus shaped
    close-detail mask.

-   Focus takeover: shaped mask expands to full panel and becomes the
    next cinematic view.

-   Card + narrative bridge: physical card overlaps a lower edge while
    narrative text occupies whitespace before the next scene.

# 28. Revised Panel Layering

The Panel should expose at least two rendering layers: a clipped visual
viewport and an unclipped frame overlay. This preserves full-width
imagery and card/art masks while allowing narrative, dialogue and
selected foreground frames to cross panel boundaries.

    .story-panel

      |-- .panel-visual-viewport   // clipped

      |     |-- background

      |     |-- card/artwork

      |     |-- mask frame

      |     `-- visual effects

      |

      `-- .panel-frame-overlay    // unclipped

            |-- narrative

            |-- dialogue

            |-- title/location

            `-- selected foreground frames

# 29. Vertical-Comic Stress Test: Language Refinements

Testing the language against a long-form vertical comic reader exposes
several requirements that are useful beyond comics. The key refinement
is to distinguish authored vertical flow from visual overlays. A
Container is therefore a vertical composition region whose flow may
contain Panels and explicit Space elements.

## 29.1 Revised hierarchy

    BODY

      `-- CONTAINER

           |-- PANEL

           |    |-- normal-flow frames

           |    `-- overlay/overflow frames

           |-- SPACE

           |-- PANEL

           `-- SPACE

A source image slice is not automatically a Panel. Panel boundaries
describe the intended visual/narrative composition, regardless of how
many assets are used to render it.

# 30. Space as an Authored Flow Element

A small seam/gutter and a large dramatic pause are different concepts.
Container.seam remains the immediate boundary treatment, while Space
becomes a first-class element in Container.flow.

    {

      "type": "container",

      "seam": "seamless",

      "flow": [

        { "type": "panel", "id": "p1" },

        {

          "type": "space",

          "height": "42vh",

          "background": "#ffffff"

        },

        { "type": "panel", "id": "p2" }

      ]

    }

-   Space participates in normal document flow.

-   Space may be fixed, responsive, token-based or viewport-relative.

-   Overflow frames from adjacent Panels may visually occupy Space
    without removing its layout height.

-   Space can later support background texture, subtle effects or
    chapter pacing without becoming a Panel.

# 31. Panel Height Modes

Panel height becomes an explicit strategy rather than an incidental CSS
value.

    "height": {

      "mode": "content"

    }

-   content - natural height is established by normal-flow content,
    commonly an authored image.

-   viewport - height derives from the viewport, e.g. 100svh.

-   fixed - explicit design-system length.

-   artwork-fit - height derives from a card/artwork aspect ratio and
    may animate during a transition.

-   auto - renderer chooses the natural layout result when no special
    sizing behaviour is required.

# 32. Image Frame

Image is now distinct from Background. A Background is a panel-filling
visual surface; an Image Frame preserves an authored composition and may
itself determine panel height.

    {

      "type": "image",

      "asset": "scene-023.webp",

      "flow": "normal",

      "width": "100%",

      "fit": "contain",

      "bleed": {

        "top": false,

        "bottom": true

      }

    }

-   Background normally uses cover/fill semantics and does not establish
    document height.

-   Image may use contain/intrinsic semantics and can establish height
    when flow=normal.

-   Image Frames are appropriate for authored comic compositions,
    illustrations, maps, diagrams and static story beats.

# 33. Frame Flow Model

Every Frame receives a flow mode. This removes the assumption that all
Frames are absolutely positioned.

    "flow": "normal"     // participates in panel layout

    "flow": "overlay"    // positioned over panel; does not affect height

    "flow": "overflow"   // overlay that may extend beyond panel bounds

-   normal - suitable for image/text content that should establish
    vertical layout.

-   overlay - suitable for dialogue, characters, cards, effects and
    masks placed over a visual scene.

-   overflow - suitable for narrative/dialogue/title frames that
    intentionally cross into surrounding Space or neighbouring
    composition.

# 34. Unified Frame Positioning

All positioned Frames use the same position object. Individual Frame
types should not invent separate left/right/offset vocabularies.

    "position": {

      "anchor": "top-right",

      "x": "-5%",

      "y": "12%",

      "width": "42%",

      "height": "auto",

      "z": 20

    }

-   anchor defines the reference point: top-left, top, top-right, left,
    center, right, bottom-left, bottom, bottom-right.

-   x/y are offsets from the anchor and accept design tokens or
    CSS-compatible lengths.

-   width/height define the rendered box where relevant.

-   z maps to the composition's z-order rather than requiring authors to
    manage raw CSS selectors.

# 35. Bleed

Bleed controls whether visual content visually continues beyond its
nominal composition edge. It is independent of Frame flow and Container
Space.

    "bleed": {

      "top": false,

      "right": false,

      "bottom": true,

      "left": false

    }

The renderer may implement bleed by expanding the visual box or allowing
the relevant visual viewport edge to remain unclipped. Bleed must not
silently alter semantic panel height.

# 36. Updated Container Schema

    {

      "id": "chapter-01",

      "type": "container",

      "seam": {

        "type": "seamless"

      },

      "flow": [

        {

          "type": "panel",

          "id": "establishing",

          "height": { "mode": "content" },

          "frames": [

            {

              "type": "image",

              "asset": "wide-scene.webp",

              "flow": "normal",

              "width": "100%",

              "fit": "contain"

            },

            {

              "type": "dialogue",

              "flow": "overlay",

              "shape": "fat-circle",

              "position": {

                "anchor": "top-right",

                "x": "-6%",

                "y": "10%",

                "width": "38%",

                "z": 20

              }

            }

          ]

        },

        {

          "type": "space",

          "height": "30vh",

          "background": "#ffffff"

        },

        {

          "type": "panel",

          "id": "focus",

          "height": { "mode": "viewport", "value": 0.9 },

          "frames": [

            {

              "type": "background",

              "asset": "environment.webp",

              "fit": "cover"

            },

            {

              "type": "mask",

              "flow": "overlay",

              "position": {

                "anchor": "left",

                "x": "4vw",

                "y": "0%",

                "width": "58%",

                "z": 10

              },

              "shape": {

                "type": "polygon",

                "points": [[0,0.08],[0.88,0],[1,0.82],[0.12,1]]

              },

              "content": {

                "type": "image",

                "asset": "close-detail.webp"

              }

            }

          ]

        }

      ]

    }

# 37. Renderer DOM Strategy for Flow + Overlay

A Panel should contain a normal-flow layer plus the existing clipped
visual and unclipped overlay layers. This allows natural-height comic
panels and cinematic overlays to coexist.

    <article class="story-panel">

      <div class="panel-flow">

        <!-- normal-flow image/text frames establish height -->

      </div>



      <div class="panel-visual-viewport">

        <!-- clipped backgrounds, cards, masks, effects -->

      </div>



      <div class="panel-frame-overlay">

        <!-- dialogue, narrative, titles, selected foreground -->

      </div>

    </article>

    .story-panel {

      position: relative;

      width: 100%;

    }



    .panel-flow {

      position: relative;

      width: 100%;

    }



    .panel-visual-viewport {

      position: absolute;

      inset: 0;

      overflow: clip;

    }



    .panel-frame-overlay {

      position: absolute;

      inset: 0;

      overflow: visible;

      pointer-events: none;

    }

# 38. GSAP / ScrollTrigger Implications

Normal-flow content should not require ScrollTrigger merely to exist.
ScrollTrigger is attached only when a Frame or Panel declares scroll
behaviour. When flow elements or responsive images change measured
positions, the renderer must refresh ScrollTrigger after layout settles.

    async function initialiseStory(root, story) {

      renderStory(root, story);



      await document.fonts?.ready;

      await waitForStoryImages(root);



      buildDeclaredAnimations(root, story);



      // Recalculate start/end positions after the final document flow exists.

      ScrollTrigger.refresh(true);

    }

This is especially important when upstream content changes height,
because downstream ScrollTrigger start/end positions depend on document
geometry. GSAP documents ScrollTrigger.refresh() as the mechanism for
recalculating those positions; a safe refresh may be requested with
refresh(true).

# 39. Validation Additions

-   Container.flow accepts Panel and Space elements.

-   Space requires height; it must not contain ordinary Panel Frames in
    v1.

-   Panel height mode content requires at least one normal-flow child
    capable of establishing height, or other intrinsic content.

-   Frame flow must be one of normal \| overlay \| overflow.

-   overflow Frames require a positioning context and must render in the
    unclipped overlay layer.

-   Image Frames require asset dimensions or an aspectRatio before
    animation setup.

-   Background and Image are distinct Frame types and must not be
    silently substituted.

-   Bleed values are visual edge permissions and must not implicitly
    change document-flow measurements.

-   Position anchors and x/y/width/height values are shared across all
    positionable Frame types.

# 40. Updated TypeScript Model

    type FrameFlow = "normal" | "overlay" | "overflow";

    type PanelHeightMode =

      | "auto"

      | "content"

      | "viewport"

      | "fixed"

      | "artwork-fit";



    interface StoryContainer {

      id: string;

      seam?: Seam;

      flow: ContainerFlowItem[];

    }



    type ContainerFlowItem = StoryPanel | StorySpace;



    interface StorySpace {

      type: "space";

      height: string;

      background?: string;

    }



    interface StoryPanel {

      type: "panel";

      id: string;

      height?: PanelHeight;

      frames: StoryFrame[];

    }



    interface FramePosition {

      anchor:

        | "top-left" | "top" | "top-right"

        | "left" | "center" | "right"

        | "bottom-left" | "bottom" | "bottom-right";

      x?: string;

      y?: string;

      width?: string;

      height?: string;

      z?: number;

    }



    interface FrameBase {

      id?: string;

      flow?: FrameFlow;

      position?: FramePosition;

      bleed?: {

        top?: boolean;

        right?: boolean;

        bottom?: boolean;

        left?: boolean;

      };

    }



    interface ImageFrame extends FrameBase {

      type: "image";

      asset: string;

      fit?: "contain" | "cover" | "width" | "intrinsic";

      aspectRatio?: number;

    }

# 41. Language Capability Check

With these refinements the same language can describe a static long-form
vertical comic, a cinematic scroll sequence, and card-driven
transformations without creating separate rendering systems. A
conventional sequence can be expressed as Image -\> Space -\> Image +
Dialogue -\> Space -\> Image, while the same Container may later
introduce Card -\> Artwork, Mask/Pull-Focus, cinematic Panels and
overflow Narrative Frames.

# 42. Revised Build Priorities

-   Refactor Container from panels\[\] to flow\[\] while retaining a
    migration path for existing documents.

-   Add Space as a first-class flow element.

-   Add Panel height modes content and auto.

-   Add Image Frame and preserve the distinction from Background.

-   Implement Frame flow: normal, overlay, overflow.

-   Centralise positioning in FramePosition.

-   Implement bleed independently from layout sizing.

-   Update Panel DOM to three layers: normal flow, clipped visual
    viewport, unclipped overlay.

-   Run ScrollTrigger.refresh(true) only after assets/layout and
    declared animations are ready.

-   Regression-test existing standard-card FIT transitions to ensure
    normal-flow changes do not break next-panel pull-up.

# 43. Interaction Primitives

Scrolltastic assumes continuous smooth scrolling as its baseline
interaction. Interaction primitives augment that model rather than
replacing it. The first primitive is beat-driven advancement: authors
mark meaningful story moments as Beats, and readers may move directly
between them using an Advance or Reverse action.

## 43.1 Terminology

-   Beat - an authored story moment at which the experience can settle.

-   Advance - move to the next Beat.

-   Reverse - move to the previous Beat.

-   Flip - an input gesture that invokes Advance or Reverse.

-   Scroll - continuous free movement through the story.

This separation is intentional: Beat describes story semantics,
Advance/Reverse describe actions, and Flip describes one possible input.
Other inputs can invoke the same actions without changing story content.

# 44. Beats

Beats are optional. A document containing no Beats remains a normal
continuous scrollytelling experience. A Beat may be associated with a
Panel, a Frame, or a meaningful progress position inside a scroll-driven
timeline.

## 44.1 Element Beat

    {

      "id": "card-hero",

      "type": "card",

      "beat": {

        "id": "card-reveal",

        "align": "center"

      }

    }

An Element Beat resolves to a document scroll position derived from the
owning Panel or Frame.

## 44.2 Beat alignment

    "beat": {

      "id": "character-reveal",

      "align": "start",

      "offset": "8svh"

    }

-   start - settle the Beat near the start/top of the viewport.

-   center - centre the Beat's target composition in the viewport.

-   end - settle the target near the end/bottom of the viewport.

-   offset - optional adjustment after alignment has been resolved.

## 44.3 Timeline Beats

A Beat does not have to correspond to a separate DOM element. Complex
scroll-driven Panels may declare Beats at meaningful timeline progress
positions.

    {

      "id": "card-transition",

      "beats": [

        { "id": "card", "progress": 0.00 },

        { "id": "reveal", "progress": 0.45 },

        { "id": "artwork", "progress": 1.00 }

      ]

    }

The renderer converts timeline progress into the corresponding document
scroll position. This lets a single Flip move between authored states
inside a pinned or scrubbed cinematic sequence.

# 45. Advance and Reverse Actions

Advance and Reverse operate on the ordered Beat graph produced by the
rendered story. They do not directly manipulate Panels or Frames.

    {

      "interaction": {

        "advance": {

          "enabled": true,

          "mode": "beats"

        }

      }

    }

At runtime, Advance resolves the next Beat after the reader's current
effective position; Reverse resolves the previous Beat. Manual scrolling
remains available at all times unless a future interaction mode
explicitly changes that behaviour.

# 46. Flip Input

Flip is an optional low-effort gesture intended to reduce scroll
fatigue. A downward/forward Flip invokes Advance; an upward/backward
Flip invokes Reverse. The exact gesture recogniser is an input adapter
and is not encoded into individual Frames.

    {

      "body": {

        "interaction": {

          "scroll": {

            "enabled": true,

            "mode": "continuous"

          },

          "advance": {

            "enabled": true,

            "mode": "beats",

            "motion": {

              "duration": 0.55,

              "ease": "power2.inOut"

            },

            "inputs": [

              "flip",

              "keyboard",

              "controls"

            ]

          }

        }

      }

    }

# 47. Beat Resolver

During rendering, all Beats are normalised into a single ordered runtime
index. Element Beats resolve from layout geometry; Timeline Beats
resolve from ScrollTrigger start/end positions and declared progress.

    interface ResolvedBeat {

      id: string;

      source: "element" | "timeline";

      scrollY: number;

      order: number;

      element?: HTMLElement;

      progress?: number;

    }

The resolver must be rerun whenever responsive layout changes invalidate
Beat positions, using the same lifecycle that refreshes ScrollTrigger.

# 48. GSAP Beat Navigation

Beat navigation should animate the document scroll position rather than
directly forcing animation states. Existing ScrollTrigger timelines then
naturally update while the page moves through the same scroll space used
by manual interaction.

    function advance(direction) {

      const destination =

        direction === "forward"

          ? beats.next(currentScrollPosition())

          : beats.previous(currentScrollPosition());



      if (!destination) return;



      gsap.to(window, {

        scrollTo: { y: destination.scrollY, autoKill: true },

        duration: 0.55,

        ease: "power2.inOut"

      });

    }

The implementation may use GSAP ScrollToPlugin. If the user manually
scrolls or otherwise takes control during an assisted move, the movement
should yield rather than fight the reader.

# 49. Input Adapter Model

Input mechanisms are adapters over semantic actions. This allows the
same story to support touch gestures, keyboard input and explicit UI
controls.

    INPUT                  ACTION

    --------------------------------

    flip down / forward -> Advance

    flip up / backward  -> Reverse

    ArrowDown           -> Advance

    ArrowUp             -> Reverse

    Next control        -> Advance

    Previous control    -> Reverse

    wheel / touch drag  -> Continuous Scroll

Future inputs such as remote controls or accessibility switches can
invoke Advance/Reverse without changing the authored document.

# 50. Interaction Arbitration

-   Continuous manual scroll is the baseline and must remain functional
    when Beat navigation is enabled.

-   An active assisted Advance/Reverse should be cancellable by
    deliberate reader scroll/touch input.

-   Repeated Flip input during an active transition should be debounced
    or queued according to the interaction controller policy.

-   The reader's effective Beat should be recalculated after manual
    scrolling rather than assuming the last programmatically visited
    Beat.

-   Beat navigation must not trap the reader at the first or last Beat.

-   Pinned ScrollTrigger sections and Timeline Beats must resolve to
    real scroll coordinates before navigation begins.

# 51. Accessibility and Reduced Motion

-   Advance and Reverse must be available through explicit accessible
    controls when Flip is enabled; gesture-only navigation is
    insufficient.

-   Keyboard mappings should apply only when the story experience has
    appropriate focus and must not hijack editable controls.

-   With prefers-reduced-motion, Beat navigation should use immediate or
    substantially shortened movement while preserving the same
    destination.

-   Focus should not automatically jump merely because the viewport
    moves to a Beat; DOM focus and visual scroll position are separate
    concerns.

-   Beat identifiers may later support labels for assistive navigation,
    but visible narrative semantics should remain in ordinary document
    content.

# 52. Updated TypeScript Interaction Model

    interface Beat {

      id: string;

      align?: "start" | "center" | "end";

      offset?: string;

      progress?: number;

    }



    interface AdvanceMotion {

      duration?: number;

      ease?: string;

    }



    type AdvanceInput =

      | "flip"

      | "keyboard"

      | "controls";



    interface StoryInteraction {

      scroll?: {

        enabled: boolean;

        mode: "continuous";

      };



      advance?: {

        enabled: boolean;

        mode: "beats";

        motion?: AdvanceMotion;

        inputs?: AdvanceInput[];

      };

    }

# 53. Design Principle: Beat-Driven Scrollytelling

Beats do not turn Scrolltastic into a slide or page-turning system. They
provide authored resting points over the same continuous scroll space. A
reader can freely scroll through every intermediate state or use
Advance/Reverse to move from meaningful moment to meaningful moment.
This creates a beat-driven scrollytelling model while preserving the
fluidity of the underlying experience.

# 54. Interaction Implementation Priorities

-   Add Beat definitions to Panel, Frame and timeline schemas.

-   Build a runtime Beat resolver that produces ordered scroll
    coordinates.

-   Implement semantic Advance and Reverse actions.

-   Implement explicit next/previous controls first as the reference
    input adapter.

-   Add keyboard adapter and accessibility behaviour.

-   Prototype Flip gesture recognition separately from story rendering.

-   Use GSAP ScrollToPlugin or equivalent assisted scrolling while
    allowing user interruption.

-   Re-resolve Beats after responsive layout changes and ScrollTrigger
    refresh.

-   Test Timeline Beats inside card, mask and pinned cinematic
    transitions.

-   Test long stories to confirm Beat advancement meaningfully reduces
    repetitive scrolling without interfering with continuous scroll.

# 55. Hosted Stories and Product Boundaries

Scrolltastic is an embeddable renderer within a multi-user website,
for example scrolltastic.com. Each Body is one story. The website hosts
multiple independently addressable stories and provides a creator
experience for constructing, previewing and publishing them.

The responsibilities are separated as follows:

| Component | Responsibility |
| --- | --- |
| Renderer | Validate and render one Body and its assets inside a supplied root element. |
| Reader host | Resolve the public story URL, load the published document, supply its asset base URL and mount the renderer. |
| Creator host | Authenticate creators, enforce ownership, edit documents, upload assets, preview and publish stories. |
| Publication service | Validate complete releases and manage the published-release pointer. |

Reader and creator experiences may share a website. The renderer does
not own application routing, accounts, database access or publishing.
Creator preview uses the same renderer as the reader host.

# 56. Story Folder Contract

Every story has its own folder containing its configuration and assets.
A portable development or export package has this shape:

```text
stories/
  <story-id>/
    story.json
    assets/
      establishing.webp
      character.webp
```

`story.json` contains one Body. Asset references are relative to the
package root, for example `assets/character.webp`. The host supplies the
package base URL; the renderer must not hard-code the site's domain or
storage location. Packaged assets must resolve within that package.

A hosted folder may be a logical prefix in object storage rather than
a directory on a persistent web server. Provider selection is deferred.
The portable package does not contain account credentials or ownership
records.

# 57. Public URLs and QR Access

Published stories are unlisted and public: anyone with the URL can read
them without logging in. Each story receives a randomly generated UUID
v4 public identifier, generated using a cryptographically secure source.
Identifiers must not be sequential or derived from story titles.

```text
https://scrolltastic.com/s/<story-id>
```

QR codes encode this permanent reader URL, not a storage path, draft
URL or release URL. Publishing updates preserves the public identifier
and URL. A difficult-to-guess URL is a discovery deterrent, not an
authorization boundary; recipients can share it.

Published stories are excluded from public listings and sitemaps, and
the reader host requests no search indexing. Drafts and creator actions
require authenticated ownership checks enforced by the server. Knowing
a story identifier must never grant draft, editing or publishing access.

# 58. Drafts and Published Releases

Hosted storage separates editable drafts from immutable, self-contained
published releases:

```text
stories/
  <story-id>/
    draft/
      story.json
      assets/
    releases/
      <release-id>/
        story.json
        assets/
```

Publishing validates the document and referenced assets, creates a
complete release, then atomically changes the story's published-release
pointer. A failed publication leaves the previous release available.
The reader resolves one release per load and uses that release's base
URL for all assets, avoiding mixtures of configuration and asset versions.
Existing readers may finish reading their resolved release.

The stable reader URL must resolve the current published release through
a revalidated lookup. Immutable release files can be cached separately.
Rollback changes the pointer to an existing complete release. Release
retention and deletion policies are deferred.

Database records own users, story ownership, public identifiers, draft
locations, publication history and the current published-release pointer.
The JSON document owns authored story content. Unpublished or unknown
public URLs must not expose drafts or storage listings.

# 59. First Renderer Slice

The agreed first slice is a static, framework-independent TypeScript
renderer with a minimal reader host and two independent story packages.
It proves JSON-driven layout before adding scroll animation.

It covers Body, Container.flow, Panel, Space, Background, Image,
Narrative, Dialogue, normal/overlay/overflow flow, shared positioning and
natural versus explicit Panel heights. One fixture is a long-form comic
using original assets, authored Space, overflow text and seamless image
joins. The other proves that routing and asset resolution are not tied
to one story.

The local host demonstrates `/s/<story-id>` and supplies a package base
URL. It is not a production account or publishing implementation.
Authentication, hosted persistence and the creator editor follow later.
Masks are added by contract 0.3 in section 64. Static standard Cards are
added by contract 0.4 in section 65. The first Card-to-art transition is
added by contract 0.5 in section 66. OUT + FIT is added by contract 0.6 in
section 67, and IN + FIT by contract 0.7 in section 68. Other transitions,
Beats and further GSAP animation types are subsequent slices.

The implementation plan and remaining language decisions are recorded
in [the first-slice plan](docs/first-renderer-slice.md). Proposed details
there do not silently supersede the language in this specification.

# 60. Initial Layout Decisions and Evolution

Explicit `fixed` and `viewport` Panel heights are exact heights, not
minimum heights. Use `content` for natural growth. Overlay and overflow
Frames do not enlarge semantic Panel height.

Preserve normal flow, clipped visuals and unclipped overflow as distinct
rendering responsibilities. Meaningful Images and text must retain
authored DOM order. Where grouping children into three physical layer
wrappers would reorder meaningful content, use per-Frame clipping and
positioning wrappers; decorative surfaces may retain dedicated visual
layers. This refines the illustrative DOM in section 37 without changing
Frame flow semantics. Do not duplicate semantic content into hidden copies.

These decisions may evolve. Internal renderer changes should preserve the
document contract. Language changes must update this specification,
schema/types, examples and tests together. Before changing the meaning of
existing published documents, define a versioning or migration strategy;
do not silently reinterpret them. The initial version-field syntax is
defined in section 62; later language additions increment it.

# 61. Vercel-Compatible Hosting

The website is expected to use a managed host such as Vercel. Keep the
renderer independent of that provider and of the website framework.
The initial Vite reader host remains suitable; Vercel hosting does not
require changing the renderer to Next.js.

- Website code and initial test fixtures may be deployed as build assets.
- User-created story packages belong in durable object storage; account,
  ownership and publication records belong in a database.
- Story folders are storage prefixes. Never depend on writable deployment
  files or temporary function files for persistent content.
- Server endpoints handle authenticated creator operations and publication.
  Provider credentials remain server-side.
- Publishing a story does not rebuild or redeploy the website. Conversely,
  a website deployment does not overwrite drafts or published releases.
- Configure direct requests to `/s/<story-id>` to reach the reader host.
  Scope SPA rewrites so missing assets, configuration and API requests
  retain their proper error responses.
- QR codes use the stable production domain, never an ephemeral preview URL.
- Development and preview deployments must not modify production stories.
- Database and storage providers remain undecided; select them when the
  creator and publishing backend is implemented.

Deployment acceptance includes opening and refreshing a story deep link,
loading its relative assets, and showing a useful missing-story response.

Platform references: [Vite on Vercel](https://vercel.com/docs/frameworks/frontend/vite),
[function runtimes](https://vercel.com/docs/functions/runtimes), and
[storage overview](https://vercel.com/docs/storage).

# 62. Static Document Contract 0.1

The first executable contract is `src/schema/story.schema.json` (JSON
Schema draft-07). Version 0.1 documents declare one `body` with UUID v4
`id`, nonempty `title`, and `containers`; sections 63–68 define additive
version 0.2 scroll reveals, version 0.3 Mask Frames, version 0.4 static
standard Card Frames, version 0.5 OUT + CROP, version 0.6 OUT + FIT and
version 0.7 IN + FIT. Generated
TypeScript comes from that schema.
The parser additionally checks cross-document
IDs and layout combinations; it never coerces values or strips unknown
properties. This contract is a supported subset of the wider design,
not a claim that every v4 feature is implemented.

- Containers require `type: "container"`, `id`, and `flow`. The only
  implemented seam is `{ "type": "seamless" }`, also the default.
- Panels require `type: "panel"`, `id`, and nonempty `frames`.
- Height defaults to `{ "mode": "auto" }`. `auto` and `content` require
  at least one normal-flow, height-producing Frame. Viewport height is
  `{ "mode": "viewport", "value": 1 }`, measured in multiples of
  `100svh`; value defaults to 1. Fixed height is
  `{ "mode": "fixed", "value": "480px" }`.
- Space requires `type: "space"` and `height`. Its optional `background`
  is a six-digit hex colour, defaulting to white.
- Supported lengths are nonnegative numbers with `px`, `rem`, `vw`,
  `vh`, `svh`, or `dvh`, plus unitless `0`. Frame dimensions also accept
  `%`; offsets additionally accept negative values. Tokens, CSS functions
  and percentages for Panel/Space height are deferred.
- Background requires `asset`; it is a decorative, panel-filling overlay
  with `fit: "cover"` by default (`contain` is also supported). Custom
  Background position and normal/overflow Background flow are deferred.
- Image requires `asset`, `alt`, and positive `aspectRatio` (width/height).
  It defaults to normal flow, full width, and `fit: "contain"`.
  `cover` and `width` are also supported. `width` preserves the declared
  aspect ratio and requires automatic height. Empty alt means decorative.
- Narrative and Dialogue require nonblank plain `text`. Narrative uses
  `oblong`; Dialogue uses `fat-circle`. Both default to normal flow.
  Plain text is inserted as text, never interpreted as HTML.
- Every positioned overlay/overflow Frame requires `position.anchor`.
  Matching anchor points on the Panel and Frame coincide before x/y
  offsets; percent offsets refer to Panel dimensions. Width defaults to
  `100%`, height to `auto`, offsets to zero. `z` is an integer 0–1000.
  Default z-order is Background 0, normal 1, overlay 10, overflow 20.
- Normal Frames may use position width/height/z but must use `top-left`
  with zero or omitted x/y; anchoring out of flow requires overlay/overflow.
- All explicit IDs are unique within a document. Optional Frame IDs are
  not synthesized into the public language.
- Assets are package-relative paths under `assets/`, with alphanumeric,
  underscore or hyphen path segments and SVG/PNG/JPEG/WebP/AVIF extensions.
  External URLs, traversal, query strings and encoded paths are rejected.
  Packaged SVG fixture artwork is original; this does not define a future
  upload sanitization policy.
- Unknown fields and unsupported features (including IN + CROP/BOTH Card transitions,
  full-art Cards, Beats,
  animation in version 0.1, bleed and legacy `panels`) fail with a diagnostic.
  Version 0.2 adds only the reveal described in section 63; version 0.3
  adds only Masks described in section 64; version 0.4 adds static standard
  Cards described in section 65; version 0.5 adds OUT + CROP described in
  section 66; version 0.6 adds OUT + FIT described in section 67; version 0.7
  adds IN + FIT described in section 68. A legacy
  `panels` document must migrate to `flow` before rendering.

The Body title is rendered once as the story heading. Meaningful Frames
follow authored order, even across flow modes. A mount owns its root's
content until destroyed; destruction releases its observers, event
listeners and DOM. Image geometry is reserved before loading. Readiness
means relevant fonts and layout have settled, bounded by a timeout; it
never waits for offscreen lazy images. Image errors retain geometry and
alternative text. Layout notifications are batched for future animation
and Beat integrations.

Normal-flow content remains measurable at its natural size inside an
exact-height Panel, but is visually clipped to the Panel bounds using
per-Frame clipping. Only explicit overflow Frames may cross those bounds.
Clipping is recomputed on layout changes, with reads and writes batched.

# 63. Scroll Reveal Slice 0.2

Version 0.2 adds an optional `scrollAnimation` declaration to Narrative
and Dialogue Frames. Version 0.1 remains valid and static. The first
supported declaration is a reversible, scrubbed `reveal` effect:

```json
{
  "type": "narrative",
  "text": "The mountain sent a signal.",
  "scrollAnimation": {
    "type": "reveal",
    "start": "top 82%",
    "end": "top 55%",
    "from": { "opacity": 0, "yPercent": 8, "scale": 0.97 }
  }
}
```

`start` and `end` use a bounded ScrollTrigger position vocabulary. Start
must resolve before end during forward document scroll. Defaults are `top
82%` and `top 55%`. `from` values are optional and default to opacity 0,
yPercent 8 and scale .97; opacity is bounded to 0..1, yPercent to -12..12,
and scale to .9..1.1. The destination is visible at the declared end.
Scrubbing is always enabled, with no pinning. The renderer creates one
ScrollTrigger per declared reveal and destroys it with the story mount.

Reveal transforms apply to the Frame content wrapper, leaving the
positioning wrapper's anchor transform intact. Semantic text remains in
the DOM and exposed to assistive technology at every animation state; the
reveal changes opacity only. When
`prefers-reduced-motion: reduce` is active, the renderer creates no reveal
animations and displays all content. Changing the preference while the
story is mounted updates the animation setup. Animation initialization
follows measurable layout; ScrollTrigger recalculates trigger positions
when responsive layout changes.

`scrollAnimation` on other Frame types, unknown animation types, arbitrary
GSAP property names, non-scrubbed timing and pin settings are unsupported in
0.2 and fail validation. This bounded language surface keeps authored
documents declarative and safe to validate while leaving later animation
types open for design.

# 64. Mask Frame Slice 0.3

Version 0.3 adds shaped Mask Frames and an optional reversible pull-focus
transition. Version 0.1 and 0.2 documents remain valid. A Mask is an
overlay Frame positioned within a Panel; it does not establish or change
Panel height. Its `position` requires an explicit non-auto `height` so
the opening has stable geometry at responsive sizes. Width and height use
the shared Frame dimensions, with percentages relative to the Panel.

`shape` is one of `ellipse`, `rounded-rect`, or `polygon`. Polygon points
are at least three normalized `[x, y]` coordinate pairs within 0..1 and
define a closed clip. SVG paths remain future work. `content` identifies a
package-relative image, meaningful `alt` text, optional `cover`/`contain`
fit, and optional normalized focal coordinates; the default focus is
center. The image is clipped to the shape and remains in authored DOM
order.

The only transition in 0.3 is `pull-focus`. Its optional normalized range
defaults to `[0.20, 0.65]` and must satisfy `0 <= start < end <= 1`. The
renderer maps that range onto a scrubbed ScrollTrigger spanning the Panel's
entry through exit in the document. During the range, the Mask's positioned
box expands to Panel bounds while its clip interpolates to a rectangle.
There is no pinning; ordinary scroll remains canonical and reversing
scroll reverses the effect. On reduced-motion settings the transition is
omitted and the authored shaped viewport remains visible. Mask takeover is
therefore the pull-focus end state; separate base-scene fade, blur, source
push and timing controls are deferred.

Mask Frames require version 0.3 or later and overlay flow. A pull-focus range with
equal or reversed endpoints is invalid. The fixture demonstrates a polygon
opening over a background scene and expanding to a full-Panel view.

# 65. Static Standard Card Slice 0.4

Version 0.4 adds the static standard Card Frame. Versions 0.1–0.3 remain
valid. A standard Card references the complete card-front image, meaningful
`alt` text, its width/height `aspectRatio`, and a normalized `cardGeometry`
`artWindow` rectangle (`x`, `y`, `width`, `height`). The art window must fit
inside the normalized card bounds. Its purpose is to preserve authored card
geometry for later artwork extraction; this slice renders the full card
front and does not crop or animate that window.

Standard Cards default to normal flow and may establish natural Panel height.
Their rendered width is responsive and centered, capped for larger screens;
the image retains its declared ratio before loading. Overlay/overflow cards
use the shared Frame positioning contract. Cards preserve authored reading
order and expose the full image through alternative text.

Only `cardType: "standard"` is supported in 0.4. Full-art Cards, separate
artwork sources, presentation transforms, overlap, and card-to-art transitions
remain unsupported in 0.4. A Card Frame requires document version 0.4 or
later. The fixture uses three complete card-front assets and records the
approximate artwork window for each.

# 66. Standard Card OUT + CROP Slice 0.5

Version 0.5 adds the first reversible standard Card transition. It keeps the
physical card front and its artwork as separate visual layers, using the
Frame's `cardGeometry.artWindow` to reveal the art already present in the
card image; a separate artwork asset is not required. The physical card fades
while a clipped copy of the full image grows from the artwork window to the
Panel bounds and scales/crops to cover the Panel. Optional normalized `focus`
coordinates select the point of the art aligned toward the Panel center;
focus defaults to `{ "x": 0.5, "y": 0.5 }`.

The supported OUT + CROP declaration is:

```json
{
  "artwork": {
    "transition": {
      "direction": "out",
      "presentation": "crop",
      "outRange": [0.18, 0.73],
      "focus": { "x": 0.5, "y": 0.5 }
    }
  }
}
```

`outRange` is optional, normalized to Panel entry/exit progress, defaults to
`[0.18, 0.73]`, and must satisfy `0 <= start < end <= 1`. The card chrome
fades during the early part of that same range. One scrubbed ScrollTrigger
maps the Panel's clamped entry-to-exit interval to a linear timeline. The
transition does not pin or change Panel height; scrolling backward restores
the original card. The expanding crop stays inside the Panel transition
viewport. With reduced motion the transition layer is not attached and the
static, accessible full Card Frame remains visible. Other directions and
FIT/BOTH presentations fail validation in 0.5.

# 67. Standard Card OUT + FIT Slice 0.6

Version 0.6 adds standard-card OUT + FIT. It uses the same complete card-front
asset and normalized `cardGeometry.artWindow` as OUT + CROP, but scales the
source so the full artwork window spans the Panel width and height. The art
window's ratio is derived from the Card's declared `aspectRatio` and the
normalized art-window dimensions. The card chrome fades while the art grows
out of its window around the art-window center, which stays anchored at its
screen position for the duration of the zoom. The content-sized Panel
contracts from its natural scene height to the artwork's full-width height.
Following Panels move upward
through ordinary document flow beneath the pinned story prefix.

```json
{
  "artwork": {
    "transition": {
      "direction": "out",
      "presentation": "fit",
      "outRange": [0.18, 0.68]
    }
  }
}
```

`outRange` is optional, normalized to Panel entry/exit progress, defaults to
`[0.18, 0.68]`, and must satisfy `0 <= start < end <= 1`. A `focus` property
is not accepted because FIT preserves the complete artwork window. The
owning Panel must use `auto` or `content` height; fixed and viewport heights
would conflict with the animated contraction. New Card transitions pin the
story prefix through the active Card by default for the duration of the
transition. This holds the visible body above the Card in place while later
Panels continue moving underneath it. Set `"scrollMode": "flow"` to opt out
of pinning. Only one pinned Card transition is supported per story; other
transitions must explicitly use `scrollMode: "flow"` to avoid nested pin
wrappers. Contract 0.5 stories retain their unpinned behavior. The pin
trigger uses no added pin spacing, and a scrubbed trigger drives the reversible
visual transition; reduced motion leaves the static, accessible full Card
Frame visible. OUT + CROP remains supported from 0.5; IN and BOTH directions
remain unsupported in 0.6.

# 68. Standard Card IN + FIT Slice 0.7

Version 0.7 adds IN + FIT. It begins with the full artwork at its
artwork-derived height and resolves into the physical standard Card. It uses
the existing complete card-front asset and normalized `cardGeometry.artWindow`:
the renderer expands the clip from the Panel bounds into the card artwork
window, transforms the source back to its card dimensions, grows the Panel to
its natural scene height, and reveals the physical Card Frame. One scrubbed
timeline drives the complete transition and reverses naturally with scrolling.

```json
{
  "artwork": {
    "transition": {
      "direction": "in",
      "presentation": "fit",
      "inRange": [0.18, 0.68]
    }
  }
}
```

`inRange` is optional, normalized to Panel entry/exit progress, defaults to
`[0.18, 0.68]`, and must satisfy `0 <= start < end <= 1`. `outRange` is not
valid for IN; `focus` is not accepted because FIT preserves the full artwork.
The Panel must use `auto` or `content` height. IN + FIT pins the story prefix
through the active Card by default and reserves the authored range as native
scroll distance, so the reader can complete the transition even near the end
of a short story. `scrollMode: "flow"` opts out of pinning and that reserved
distance. OUT + FIT retains its zero-spacing pin behavior. A story can have
one pinned Card transition; other transitions must set `scrollMode: "flow"`.
At the start of the range the full-width artwork is visible; after the range
the physical card is visible. Reduced-motion mode leaves the accessible
static Card Frame visible. IN + CROP and BOTH transitions remain unsupported.
