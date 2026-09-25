# AGENTS.md --- Scrolltastic

## Project

Scrolltastic is a mobile-first, JSON-driven scrollytelling render
engine.

The canonical product/design specification is:

-   `scrolltastic_story_language_v5.md` (section 47 defines the executable contract;
    `scrolltastic_design_spec_v4.md` is historical implementation context)

Read that specification before making architectural or schema changes.

The engine is intended to render authored story documents into a
continuous vertical experience using TypeScript, GSAP, ScrollTrigger,
and related browser technologies.

## Core principle

**The JSON document is the product language. The renderer implements the
language.**

Do not hard-code individual stories, layouts, comic pages, card
sequences, or one-off effects into the renderer.

When implementing a visual or interaction feature, ask:

> Can an author describe this behaviour declaratively in the
> Scrolltastic document?

If not, propose the required language extension before implementing a
special case.

## Canonical hierarchy

The visual hierarchy is:

    Body
      -> Container
          -> Panel
              -> Frame

A Container is a vertical composition region.

Its flow may contain both:

    Panel
    Space

`Space` is authored pacing, not merely CSS margin.

A Panel is the principal visual/story composition.

A Frame is a composable visual element within a Panel.

## Frame model

Current frame vocabulary includes:

-   Background
-   Image
-   Narrative
-   Dialogue
-   Character
-   Card
-   Effects
-   Title / Location
-   Mask

Prefer composition from Frames over creating specialised Panel types.

Do not introduce a new Frame type unless the behaviour cannot reasonably
be represented by an existing Frame plus configuration.

## Frame flow

Frames support:

    normal
    overlay
    overflow

### normal

Participates in document layout and may establish Panel height.

### overlay

Positioned over the Panel and does not establish layout height.

### overflow

May visually extend outside the Panel into surrounding Container flow or
Space.

Do not assume every Frame is absolutely positioned.

## Panel rendering layers

The conceptual Panel structure is:

    story-panel
      panel-flow
      panel-visual-viewport
      panel-frame-overlay

`panel-flow` contains normal-flow Frames.

`panel-visual-viewport` contains visual content that should be clipped
to the Panel.

`panel-frame-overlay` supports overflow content such as Narrative and
Dialogue Frames.

Preserve this separation unless there is a strong architectural reason
to change it.

## Positioning

Use the shared Frame positioning model rather than inventing positioning
properties for individual Frame types.

Conceptually:

``` json
{
  "position": {
    "anchor": "top-right",
    "x": "-5%",
    "y": "12%",
    "width": "42%",
    "height": "auto",
    "z": 20
  }
}
```

## Panel height

Supported concepts include:

    auto
    content
    viewport
    fixed
    artwork-fit

Do not assume Panels are viewport-height.

Long-form comic/scrollytelling compositions frequently use natural
content height.

## Background vs Image

These are intentionally different.

A Background is a visual surface that generally fills a Panel.

An Image Frame represents authored image content and may preserve
intrinsic aspect ratio and establish layout height.

Do not silently substitute one for the other.

## Bleed

Visual bleed is independent of layout sizing.

A Frame may visually bleed beyond selected edges without silently
changing semantic Panel height.

## Card Frames

Cards are a major Scrolltastic primitive.

Current card types include:

    standard
    full-art

### Standard cards

Standard cards have a discrete artwork window.

Supported transition concepts include:

    OUT + CROP
    OUT + FIT
    IN + FIT
    BOTH + FIT

FIT transitions may change Panel height so the artwork can become a
full-width scene while preserving its aspect ratio.

The following Panel should remain in normal document flow so it
naturally moves as the current Panel changes height.

### Full-art cards

Do not apply standard-card artwork-window behaviour to full-art cards.

Full-art transition vocabulary is intentionally not finalised.

Do not invent it without discussion.

## Mask Frames

A Mask Frame is a shaped viewport into another visual source.

It may use geometry such as:

    ellipse
    rounded rectangle
    polygon
    future SVG path

Masks may be positioned left/right or explicitly positioned.

A pull-focus transition may expand a Mask until it takes over the full
Panel.

Prefer CSS `clip-path` for straightforward geometry.

Use SVG masks/clip paths when genuinely required.

## Beats

Scrolltastic uses **Beats** as authored story moments.

Do not rename them to navigation stops.

A Beat may belong to:

-   a Panel
-   a Frame
-   a progress point inside a scroll-driven timeline

Two Beat categories therefore exist conceptually:

    Element Beat
    Timeline Beat

Timeline Beats resolve their progress to a real document scroll
coordinate.

## Interaction vocabulary

Keep these concepts separate:

**Beat**\
An authored story moment.

**Advance**\
Move to the next Beat.

**Reverse**\
Move to the previous Beat.

**Flip**\
An input gesture that invokes Advance or Reverse.

**Scroll**\
Continuous free movement through the story.

Flip is an input. Advance/Reverse are actions. Beats are destinations.

Do not couple the Beat system directly to a particular input device.

Possible input adapters include:

    flip
    keyboard
    visible controls
    future remote/controller/accessibility inputs

## Continuous scroll remains canonical

Scrolltastic is not a slide deck or page-turning system.

Beat navigation augments the continuous scroll model.

Readers must remain able to manually scroll through intermediate
animation states.

Assisted Beat movement should move the real document scroll position
rather than directly forcing GSAP animation state.

## GSAP architecture

Use GSAP and ScrollTrigger for scroll-driven animation.

General rules:

-   Render semantic DOM first.
-   Establish layout and image dimensions.
-   Attach animations after layout is measurable.
-   Prefer one coordinated GSAP timeline for a complex Panel/sequence.
-   Map scroll progress through ScrollTrigger.
-   Pin only where the design genuinely requires it.
-   Avoid independent competing ScrollTriggers for tightly coupled
    elements.
-   Call `ScrollTrigger.refresh(true)` after meaningful layout changes.
-   Responsive changes must recalculate Beat destinations.
-   Animation should be reversible through scroll.

For assisted movement between Beats, GSAP ScrollToPlugin may be used.

User interaction should be able to interrupt assisted scrolling.

## Responsive design

Portrait mobile is the canonical experience.

Do not sacrifice mobile width by unnecessarily clipping the principal
Panel.

Use Frames, masks, overlap, Space, composition, and motion to create
visual energy.

Use `gsap.matchMedia()` or an equivalent clean responsive architecture
for breakpoint-specific animation behaviour.

Landscape/desktop behaviour should gracefully adapt the portrait
composition rather than becoming a separate product unless explicitly
designed.

## Accessibility

Continuous scrolling must remain available when Beat navigation exists.

Do not make gestures the only navigation mechanism.

Respect:

    prefers-reduced-motion

Reduced-motion mode should preserve story meaning and Beat destinations
while removing or shortening unnecessary movement.

Do not automatically move DOM focus merely because the visual viewport
moves to another Beat.

Maintain semantic document reading order.

## Performance

Target modern mobile browsers first.

Prefer:

-   transforms
-   opacity
-   efficient clipping
-   image dimension metadata
-   lazy loading where appropriate
-   limited simultaneous expensive filters

Avoid unnecessary layout thrashing.

Be particularly careful when animating Panel height.

Batch layout reads/writes where practical.

## Schema and validation

Treat the Scrolltastic JSON schema as a real public language contract.

Invalid combinations should fail validation rather than being silently
ignored.

Examples:

-   standard-card artwork-window options must not be accepted for
    incompatible card types
-   Timeline Beat progress must be between 0 and 1
-   polygon masks require at least three valid points
-   overflow Frames require an appropriate positioning/rendering context
-   `content` height requires content capable of establishing height

Prefer discriminated TypeScript unions for Frame and transition types.

Keep runtime validation and TypeScript definitions aligned.

## Architecture expectations

Aim for clear separation between:

    document model
    schema / validation
    parser
    renderer
    layout
    animation
    Beat resolver
    interaction controller
    input adapters
    asset loading

Avoid a single monolithic renderer.

A likely direction is:

    src/
      model/
      schema/
      parser/
      renderer/
      frames/
      animation/
      beats/
      interaction/
      inputs/
      assets/

This is guidance, not an immutable folder structure. Propose
improvements when implementation evidence justifies them.

## Implementation strategy

Work vertically.

Prefer implementing a small end-to-end story slice over building every
abstraction before anything renders.

Recommended progression:

1.  Parse a minimal document.
2.  Render Body / Container / Panel / Space.
3.  Render Background and Image Frames.
4.  Add Narrative and Dialogue Frames.
5.  Implement normal / overlay / overflow flow.
6.  Add GSAP/ScrollTrigger animation declarations.
7.  Implement Mask Frame.
8.  Implement Standard Card transitions.
9.  Build Beat resolution.
10. Add Advance / Reverse.
11. Add explicit Next / Previous controls.
12. Add Flip gesture recognition after the semantic action system works.

Keep examples and tests alongside each capability.

## Testing

Test both language semantics and visual behaviour.

At minimum cover:

-   schema validation
-   JSON parsing
-   Panel natural-height layout
-   Space
-   overlay and overflow Frames
-   responsive recalculation
-   mask geometry
-   standard-card FIT transitions
-   Panel height changes
-   downstream ScrollTrigger refresh
-   Element Beats
-   Timeline Beats
-   Beat ordering
-   Advance / Reverse
-   manual interruption of assisted scrolling
-   reduced-motion behaviour

Use small deterministic fixtures.

A visual regression approach is encouraged once rendering stabilises.

## Reference fixture

Maintain at least one long-form vertical-comic-style fixture.

It should exercise:

-   natural-height images
-   white Space between compositions
-   Dialogue/Narrative overflow
-   seamless image transitions
-   varied Panel heights

Also maintain a cinematic Scrolltastic fixture exercising:

-   Card
-   Card -\> artwork transition
-   Mask pull-focus
-   Mask takeover
-   Beats inside timelines
-   assisted Advance / Reverse

Do not use copyrighted third-party comic artwork in committed test
fixtures unless appropriate rights exist. Use original or purpose-built
test assets.

## Documentation

Markdown is canonical for Scrolltastic documentation.

Do not generate DOCX versions unless explicitly requested.

When a design decision changes the language:

1.  update the specification
2.  update schema/types
3.  update examples
4.  update tests

Do not let implementation behaviour become undocumented language.

## Decision discipline

The design is still evolving.

Before making a significant change to:

-   the Body -\> Container -\> Panel -\> Frame hierarchy
-   Frame flow semantics
-   Panel height semantics
-   Card transition semantics
-   Beat semantics
-   interaction terminology
-   JSON structure

stop and explain the proposed change and its consequences.

Do not silently redesign the language while implementing it.

Small implementation details that do not alter authored semantics may be
decided normally.

## Coding style

Use TypeScript.

Prefer:

-   explicit types
-   small composable modules
-   discriminated unions
-   pure functions for document transformations
-   dependency injection where it improves testability
-   browser-native APIs where sufficient

Avoid speculative abstractions and unnecessary dependencies.

Keep GSAP-specific code behind a reasonably narrow animation layer so
the document model is not polluted with library implementation details.

## When starting a Codex session

First:

1.  Read this file.
2.  Read `scrolltastic_story_language_v5.md` (section 47 defines the executable contract;
    `scrolltastic_design_spec_v4.md` is historical implementation context).
3.  Inspect the existing repository before proposing new architecture.
4.  Identify what is implemented versus specification-only.
5.  Run existing tests/build if available.
6.  Report any important discrepancy between the code and specification.

Then proceed with the requested task.

If the task would materially change the Scrolltastic language, discuss
the design change before coding it.
