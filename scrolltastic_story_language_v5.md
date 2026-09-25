# Scrolltastic Story Language Specification --- Version 5

**Status:** Draft\
**Canonical format:** Markdown\
**Language format:** JSON\
**Specification name:** Scrolltastic Story Language (SSL)\
**Version:** 5

------------------------------------------------------------------------

## 1. Purpose

The **Scrolltastic Story Language** is a declarative JSON language for
describing immersive, scroll-driven visual stories.

Its purpose is not to reproduce HTML, CSS, or a general-purpose
page-layout system.

> **Scrolltastic describes a story, not a web page.**

A story author should primarily think about:

-   narrative structure;
-   visual composition;
-   story beats;
-   characters and dialogue;
-   artwork and cards;
-   pacing;
-   reveals and transitions;
-   reader interaction.

The renderer is responsible for translating those intentions into
accessible, responsive web output.

V5 consolidates the existing Scrolltastic model and establishes the
architectural foundation for future capabilities including motion,
audio, camera movement and richer effects.

------------------------------------------------------------------------

## 2. Design principles

### 2.1 Story first

Story Language concepts SHOULD correspond to concepts meaningful to a
storyteller.

We SHOULD prefer:

``` json
{
  "type": "dialogue",
  "speaker": "Cyrus",
  "text": "At last."
}
```

over a collection of low-level visual elements whose only purpose is to
recreate the same result.

### 2.2 Declarative

A story describes **what should happen**, not JavaScript instructions
for how the renderer should implement it.

### 2.3 Opinionated rather than general purpose

Scrolltastic is intentionally constrained.

It is not intended to replace:

-   HTML;
-   CSS;
-   SVG;
-   Canvas APIs;
-   animation libraries;
-   general application frameworks.

Constraints allow stories to remain portable across renderer
implementations.

### 2.4 Progressive complexity

Simple stories MUST remain simple to author.

Advanced capabilities SHOULD be optional.

### 2.5 Semantic intent

Where practical, the Story Language SHOULD describe intent rather than
presentation.

Examples include:

-   `dialogue`
-   `narrative`
-   `decorative`
-   `beat`
-   `speaker`

rather than only visual formatting instructions.

### 2.6 Accessible by design

Accessibility is a property of the Story Language and renderer, not an
optional layer applied afterwards.

### 2.7 International by design

The language MUST make no fundamental assumption that story text is
English, Latin-script or left-to-right.

------------------------------------------------------------------------

# 3. Architecture

Scrolltastic consists conceptually of four separate concerns.

``` text
┌─────────────────────────────────────┐
│          STORY LANGUAGE             │
│     JSON describing the story       │
└──────────────────┬──────────────────┘
                   │
                   ▼
┌─────────────────────────────────────┐
│             RENDERER                │
│ Interprets Story Language and       │
│ produces the interactive experience │
└──────────────────┬──────────────────┘
                   │
                   ▼
┌─────────────────────────────────────┐
│          STORY PACKAGE              │
│ manifest + artwork + media/assets   │
└──────────────────┬──────────────────┘
                   │
                   ▼
┌─────────────────────────────────────┐
│       HOSTING / DEPLOYMENT          │
│ local, Vercel, object storage, etc. │
└─────────────────────────────────────┘
```

The Story Language MUST NOT depend upon a particular hosting platform.

------------------------------------------------------------------------

# 4. Compatibility classification

V5 documentation uses the following classifications.

  -----------------------------------------------------------------------
  Classification                      Meaning
  ----------------------------------- -----------------------------------
  **Existing**                        Behaviour already established by
                                      earlier Scrolltastic work

  **Extended**                        Existing concept clarified or
                                      expanded by V5

  **New**                             New V5 Story Language capability

  **Future**                          Reserved direction; not required
                                      for V5 conformance
  -----------------------------------------------------------------------

A V5 implementation SHOULD preserve established V4 behaviour unless V5
explicitly states otherwise.

------------------------------------------------------------------------

# 5. Story hierarchy

The principal composition hierarchy is:

``` text
Story
 ├── Body
 │    └── Container
 │         └── Panel
 │              └── Frame
 └── Beats
```

Conceptually:

``` text
BODY
┌────────────────────────────────────────────┐
│                                            │
│  CONTAINER                                 │
│  ┌──────────────────────────────────────┐  │
│  │                                      │  │
│  │ PANEL                                │  │
│  │ ┌──────────────────────────────────┐ │  │
│  │ │                                  │ │  │
│  │ │ FRAME                            │ │  │
│  │ │ narrative / dialogue / card /   │ │  │
│  │ │ artwork / media                 │ │  │
│  │ │                                  │ │  │
│  │ └──────────────────────────────────┘ │  │
│  │                                      │  │
│  └──────────────────────────────────────┘  │
│                                            │
└────────────────────────────────────────────┘
```

These objects have different responsibilities.

**Body** establishes story-wide defaults and environment.

**Container** groups related visual/story material.

**Panel** defines a significant visual region or scene.

**Frame** contains the semantic content being presented.

**Beat** identifies a meaningful moment or destination in the narrative.

------------------------------------------------------------------------

# 6. Story document

**Classification: Extended**

A Story document is the root Story Language object.

Example:

``` json
{
  "storyLanguage": "5",
  "id": "50b19320-50ae-4b77-a449-e3f409cfaef8",
  "title": "The Red Chain",
  "language": "en-NZ",
  "body": {},
  "beats": []
}
```

Recommended root properties:

  Property          Type                 Required Purpose
  ----------------- --------------- ------------- ------------------------------------
  `storyLanguage`   string                    yes Story Language version
  `id`              UUID/string               yes Stable story identifier
  `title`           string                    yes Human-readable story title
  `language`        BCP 47 string     recommended Default language
  `direction`       enum                       no `ltr`, `rtl`, `auto`
  `body`            object                    yes Story body
  `beats`           array                      no Story beats
  `accessibility`   object                     no Story-level accessibility metadata
  `metadata`        object                     no Non-rendering descriptive metadata

Unknown properties SHOULD produce validation feedback.

------------------------------------------------------------------------

# 7. Body

**Classification: Existing / Extended**

The Body is the root visual and narrative environment of a story.

It establishes defaults inherited by descendants.

``` text
BODY
┌──────────────────────────────────────────────┐
│ background                                   │
│                                              │
│   default typography                        │
│   language/direction                        │
│                                              │
│   ┌──────── container ───────────────────┐   │
│   │                                     │   │
│   └─────────────────────────────────────┘   │
│                                              │
└──────────────────────────────────────────────┘
```

Example:

``` json
{
  "body": {
    "background": "#090b12",
    "typography": {
      "font": "story-sans",
      "size": "medium"
    },
    "containers": []
  }
}
```

Body MAY define:

-   background;
-   default typography;
-   text colour;
-   language;
-   direction;
-   accessibility defaults;
-   containers.

Presentation inherited from Body MAY be overridden by lower-level
primitives where the specification allows.

------------------------------------------------------------------------

# 8. Container

**Classification: Existing / Extended**

A Container groups related Panels.

Containers provide narrative and compositional grouping rather than
arbitrary HTML-style nesting.

``` text
CONTAINER
┌──────────────────────────────────────────────┐
│                                              │
│  PANEL 1                                     │
│  ┌────────────────────────────────────────┐  │
│  │                                        │  │
│  └────────────────────────────────────────┘  │
│                                              │
│  PANEL 2                                     │
│  ┌────────────────────────────────────────┐  │
│  │                                        │  │
│  └────────────────────────────────────────┘  │
│                                              │
└──────────────────────────────────────────────┘
```

A Container SHOULD be used when Panels form a meaningful story grouping.

Example:

``` json
{
  "id": "spear-pillar",
  "type": "container",
  "flow": []
}
```

The Story Language SHOULD avoid turning Container into a generic `div`.

------------------------------------------------------------------------

# 9. Panel

**Classification: Existing / Extended**

A Panel is a major visual composition region.

Panels commonly correspond to:

-   scenes;
-   dramatic visual moments;
-   full-screen compositions;
-   groups of related frames.

## 9.1 Panel anatomy

``` text
            panel boundary
     ┌─────────────────────────────┐
     │◄────── padding ───────────►│
     │                             │
     │   ┌─────────────────────┐   │
     │   │       FRAME         │   │
     │   └─────────────────────┘   │
     │                             │
     └─────────────────────────────┘
       ▲                         ▲
       │                         │
    border                    radius
```

Panel visual properties MAY include:

  Property       Purpose
  -------------- ------------------------------
  `background`   colour/image/reference
  `border`       panel boundary
  `radius`       corner treatment
  `padding`      internal spacing
  `gap`          spacing between child frames
  `overflow`     clipping behaviour
  `opacity`      panel opacity
  `height`       panel height strategy
  `align`        child alignment

Example:

``` json
{
  "type": "panel",
  "height": "viewport",
  "background": "#11131c",
  "padding": "medium",
  "radius": "large",
  "overflow": "hidden",
  "frames": []
}
```

## 9.2 Height

V5 SHOULD favour semantic height values over arbitrary CSS.

Examples:

``` json
"height": "content"
```

``` json
"height": "viewport"
```

Explicit numeric sizing MAY be supported where genuinely required.

## 9.3 Overflow

Recommended values:

``` text
visible
hidden
```

Clipping is particularly useful for artwork transitions and horizontal
card movement.

------------------------------------------------------------------------

# 10. Frame

**Classification: Existing / Extended**

A Frame is the principal semantic content primitive.

A Frame answers:

> **What is being presented at this moment?**

rather than merely:

> Where should a rectangle appear?

Typical Frame types include:

``` text
narrative
dialogue
artwork
card
image
```

Future Frame types MAY include:

``` text
video
audio
interactive
```

Example:

``` json
{
  "type": "narrative",
  "text": "At Spear Pillar, Cyrus finally completes the Red Chain."
}
```

Frames MAY inherit typography and language settings.

Frames SHOULD remain semantically meaningful.

------------------------------------------------------------------------

# 11. Narrative frame

**Classification: Existing / Extended**

Narrative is prose spoken by the storyteller rather than a character.

``` text
┌─────────────────────────────────────────┐
│                                         │
│  At Spear Pillar, the air begins        │
│  to distort around the ancient ruins.   │
│                                         │
└─────────────────────────────────────────┘
```

Example:

``` json
{
  "type": "narrative",
  "shape": "rectangle",
  "text": "At Spear Pillar, the air begins to distort around the ancient ruins."
}
```

Narrative `shape` is optional and defaults to `rectangle`. The executable
catalogue is `rectangle`, `parallelogram`, and `torn-ribbon`. Shape changes
presentation, not the semantic role or reading order of the text.

Narrative SHOULD normally be concise.

As an **authoring guideline**, approximately 20--30 words is a useful
target for a single narrative beat.

This is not a validation limit.

Different languages require different amounts of space and different
sentence structures.

------------------------------------------------------------------------

# 12. Dialogue frame

**Classification: Existing / Extended**

Dialogue represents speech attributable to a character or speaker.

``` text
             CYRUS
               │
               ▼
       ╭──────────────────────╮
       │ At last.             │
       │ The world I sought   │
       │ will become reality. │
       ╰──────────────────────╯
```

Example:

``` json
{
  "type": "dialogue",
  "speaker": "Cyrus",
  "dialogueStyle": "spoken",
  "bubble": { "shape": "oval" },
  "tail": { "direction": "bottom-right", "style": "triangle" },
  "text": "At last."
}
```

The renderer SHOULD expose speaker attribution semantically to assistive
technology.

A screen reader should effectively perceive:

> Cyrus: At last.

rather than unrelated visual fragments.

Dialogue `dialogueStyle` is `spoken` or `thought` and defaults to `spoken`.
Spoken Dialogue uses an `oval` bubble and `triangle` tail. Thought Dialogue
uses a `cloud` bubble and `circle-chain` tail. A tail may be disabled and may
use a physical eight-way direction. Automatic target-based tail orientation
is deferred until the language has targetable character geometry.

Separate, adjacent Dialogue Frames in the same Panel may form a chain:

``` json
{
  "id": "dialogue-01",
  "type": "dialogue",
  "speaker": "Cyrus",
  "text": "I've seen this place before.",
  "chain": { "next": "dialogue-02", "connector": "bridge" }
}
```

The target must be the next authored Frame and must itself be Dialogue. Initial
connector styles are `bridge`, `line`, `bubble-chain`, and `none`. Each statement
remains a separate semantic text unit. Intermediate chained bubbles have no tail
by default; an author may explicitly enable one.

## 12.1 Sound Effect frame

Sound Effect represents visualised sound as accessible text and uses the
`sound-effect` discriminator. It is not Dialogue and is not an audio source.

``` json
{
  "type": "sound-effect",
  "text": "KRRRRAK!",
  "style": "impact"
}
```

The initial style catalogue is `burst`, `impact`, `motion`, `rumble`,
`electronic`, and `ambient`; omitted style defaults to `impact`. Styles provide
renderer-owned static treatments. Sound Effect otherwise uses shared Frame
flow, positioning, typography, language, Beat, and reveal declarations.
Arbitrary transforms, supplied font URLs, and generic motion remain deferred.

------------------------------------------------------------------------

# 13. Artwork and image frames

**Classification: Existing / Extended**

Visual media MUST distinguish meaningful content from decoration.

Example:

``` json
{
  "type": "image",
  "src": "assets/spear-pillar.webp",
  "alt": "Spear Pillar beneath a turbulent night sky."
}
```

Decorative image:

``` json
{
  "type": "image",
  "src": "assets/mist.webp",
  "decorative": true
}
```

An image SHOULD provide either:

-   meaningful alternative text; or
-   `decorative: true`.

It SHOULD NOT require both.

------------------------------------------------------------------------

# 14. Card frame

**Classification: Existing / Extended**

Cards are first-class storytelling objects.

A Card is not merely an image because Scrolltastic stories may:

-   reveal card artwork;
-   transition between artwork and complete card;
-   zoom into artwork;
-   associate narrative with the card;
-   use the card as a visual story source.

Conceptually:

``` text
       CARD
┌──────────────────────┐
│ name / metadata      │
│ ┌──────────────────┐ │
│ │                  │ │
│ │     ARTWORK      │ │
│ │                  │ │
│ └──────────────────┘ │
│                      │
│ card text / details  │
│                      │
└──────────────────────┘
```

Example:

``` json
{
  "type": "card",
  "src": "cards/example-card.webp",
  "alt": "A trading card showing a legendary Pokémon above a mountain."
}
```

Card-specific artwork regions MAY be identified where the renderer
supports artwork extraction or transitions.

------------------------------------------------------------------------

# 15. Masks

**Classification: Existing**

Masks allow visual material to be selectively revealed or constrained.

Typical uses include:

-   isolating card artwork;
-   character cut-outs;
-   artwork-to-card transitions;
-   scene reveals.

Masks are a visual capability and SHOULD NOT alter semantic reading
order.

Accessibility MUST be determined by the underlying content rather than
the mask geometry.

------------------------------------------------------------------------

# 16. Beats

**Classification: Existing / Extended**

A **Beat** is a meaningful story moment.

This is one of the defining concepts of Scrolltastic.

A Beat is not simply a scroll coordinate.

``` text
SCROLL DIRECTION
      │
      ▼

──────●────────────●────────────●────────────●──────
    Beat A        Beat B       Beat C       Beat D

  arrival       reveal       dialogue      handover
```

A Beat MAY represent:

-   a reveal;
-   a line of dialogue;
-   a visual composition becoming complete;
-   a card arriving;
-   a narrative transition;
-   an interaction destination.

Example:

``` json
{
  "id": "cyrus-reveal",
  "target": "cyrus-panel",
  "label": "Cyrus revealed"
}
```

The renderer maps Beats to physical scroll positions.

The Story Language describes their narrative significance.

------------------------------------------------------------------------

# 17. Continuous scroll

**Classification: Existing**

Continuous scrolling remains the fundamental navigation model.

Users MUST be able to progress naturally through a story by scrolling.

Optional interaction mechanisms MUST NOT make ordinary scrolling
unusable.

------------------------------------------------------------------------

# 18. Advance and reverse

**Classification: Existing / Extended**

Scrolltastic MAY provide discrete navigation between Beats.

Conceptually:

``` text
       reverse                 advance
          ◄                       ►

Beat 1  ●──────────●──────────●  Beat 4
              Beat 2   Beat 3
```

Advance moves toward the next Beat.

Reverse moves toward the previous Beat.

Input methods MAY include:

-   keyboard;
-   tap;
-   pointer gesture;
-   flip gesture;
-   accessibility controls.

All methods SHOULD resolve through the same Beat model.

------------------------------------------------------------------------

# 19. Flip interaction

**Classification: Existing**

Flip provides a low-effort method of progressing through a continuously
scrolling story.

The renderer translates a Flip into Beat navigation.

Flip MUST remain optional.

The story MUST still function without it.

------------------------------------------------------------------------

# 20. Snapping

**Classification: Existing**

Snapping MAY gently settle the story onto a nearby Beat.

Snapping SHOULD support the narrative rather than make scrolling feel
trapped.

Implementations SHOULD avoid aggressive snapping that prevents normal
reader control.

------------------------------------------------------------------------

# 21. Typography

**Classification: New**

Typography is a first-class Story Language concern because typography
contributes directly to narrative tone.

However, V5 intentionally avoids exposing the complete CSS typography
model.

## 21.1 Inheritance

Typography SHOULD cascade conceptually:

``` text
BODY DEFAULT
     │
     ▼
CONTAINER override
     │
     ▼
PANEL override
     │
     ▼
FRAME override
```

Lower levels MAY override higher-level defaults.

## 21.2 Curated fonts

V5 SHOULD begin with a curated renderer-provided font catalogue.

Example identifiers might include:

``` text
story-sans
story-serif
comic
handwritten
dramatic
technical
```

These identifiers describe renderer-supported choices rather than
requiring authors to supply arbitrary font files.

Example:

``` json
{
  "typography": {
    "font": "comic",
    "size": "large"
  }
}
```

The exact initial catalogue SHOULD be defined and tested by the renderer
project.

The catalogue SHOULD prioritise:

-   readability;
-   storytelling usefulness;
-   broad character coverage;
-   reliable browser rendering;
-   appropriate licensing.

## 21.3 Semantic text tone

Future renderer profiles MAY provide semantic styles such as:

``` text
whisper
shout
thought
caption
ominous
excited
```

Example:

``` json
{
  "type": "dialogue",
  "speaker": "Cyrus",
  "tone": "ominous",
  "text": "Everything will begin again."
}
```

The renderer determines the visual interpretation.

## 21.4 Overrides

V5 SHOULD still permit controlled presentation overrides where
necessary.

Possible properties include:

``` text
font
size
weight
style
align
lineHeight
letterSpacing
```

The language SHOULD resist exposing arbitrary CSS.

------------------------------------------------------------------------

# 22. Text model

**Classification: New**

Story text MUST remain actual text.

Narrative or dialogue MUST NOT be baked into images as the only
representation.

Story Language strings MUST support Unicode.

Implementations SHOULD correctly preserve:

-   accented characters;
-   punctuation;
-   emoji where supported;
-   Japanese;
-   Chinese;
-   Korean;
-   Arabic;
-   Hebrew;
-   other Unicode scripts.

Example:

``` json
{
  "type": "narrative",
  "language": "ja",
  "text": "物語はここから始まる。"
}
```

------------------------------------------------------------------------

# 23. Language and direction

**Classification: New**

Stories MAY declare language using BCP 47 language tags.

Examples:

``` json
"language": "en-NZ"
```

``` json
"language": "ja"
```

``` json
"language": "ar"
```

Direction MAY be:

``` text
ltr
rtl
auto
```

Example:

``` json
{
  "language": "ar",
  "direction": "rtl"
}
```

Language and direction SHOULD be inheritable and overridable for
individual Frames.

The renderer SHOULD use native platform/browser internationalisation
behaviour wherever practical rather than recreating language layout
itself.

------------------------------------------------------------------------

# 24. Accessibility baseline

**Classification: New / Cross-cutting**

A conforming Scrolltastic renderer SHOULD satisfy the following
baseline.

### 24.1 Semantic reading order

Assistive technology MUST encounter content in narrative order.

Visual layering, absolute positioning and animation MUST NOT determine
semantic reading order.

### 24.2 Text remains text

Narrative and dialogue MUST remain accessible text.

### 24.3 Images

Meaningful images SHOULD provide alternative text.

Decorative images SHOULD be identified as decorative.

### 24.4 Dialogue attribution

Dialogue SHOULD expose the speaker and speech as one understandable
semantic unit.

### 24.5 Keyboard parity

Any action required to progress through the story MUST have a
keyboard-accessible equivalent.

### 24.6 Reduced motion

The renderer MUST respect the user's reduced-motion preference.

Reduced motion SHOULD preserve narrative meaning while removing
unnecessary movement.

For example:

``` text
Normal:
card flies from right → settles → artwork zooms

Reduced motion:
card appears → artwork changes state
```

### 24.7 No interaction trap

Readers MUST be able to leave or move through interactive story regions
using ordinary accessibility navigation.

------------------------------------------------------------------------

# 25. Screen-reader narrative test

**Classification: New / Required benchmark**

V5 establishes a human accessibility benchmark:

> **A reference Scrolltastic story should remain understandable when
> experienced with a screen reader and without relying on its visuals.**

The test SHOULD verify:

-   narrative order;
-   dialogue attribution;
-   meaningful alternative text;
-   decorative image suppression;
-   Beat navigation controls;
-   labels;
-   absence of meaningless implementation noise.

Bad output:

``` text
image
graphic
frame 17
button
image
```

Desired experience:

``` text
At Spear Pillar, the sky begins to distort.

Cyrus: At last.

Image: Dialga and Palkia appear above the ruins.

The Red Chain begins to glow.
```

Automated accessibility tests SHOULD supplement, but MUST NOT replace,
periodic real screen-reader testing.

------------------------------------------------------------------------

# 26. Responsive behaviour

**Classification: Extended**

A story MUST NOT assume one fixed screen size.

The Story Language SHOULD express compositional intent.

The renderer SHOULD determine appropriate responsive geometry.

Authors SHOULD NOT need separate stories for:

-   phone;
-   tablet;
-   desktop.

Where visual compositions fundamentally differ, future responsive
overrides MAY be introduced deliberately.

------------------------------------------------------------------------

# 27. Story package

**Classification: New architectural definition**

A story SHOULD be distributable independently of renderer source code.

Recommended package structure:

``` text
<story-guid>/
│
├── story.json
│
├── assets/
│   ├── background.webp
│   ├── cyrus.webp
│   └── mist.webp
│
├── cards/
│   ├── card-001.webp
│   └── card-002.webp
│
└── media/
```

Example:

``` text
50b19320-50ae-4b77-a449-e3f409cfaef8/
```

The GUID provides a stable story namespace.

Asset references SHOULD normally be relative to the story package.

Example:

``` json
"src": "assets/cyrus.webp"
```

This makes the story portable between local development and remote
object storage.

------------------------------------------------------------------------

# 28. Story resolution

**Classification: New architectural definition**

The renderer SHOULD be capable of resolving stories from a configurable
story root.

Conceptually:

``` text
STORY_ROOT
    │
    ├── GUID-A/
    │    └── story.json
    │
    ├── GUID-B/
    │    └── story.json
    │
    └── GUID-C/
         └── story.json
```

A runtime may therefore resolve:

``` text
/story/{GUID}
```

into:

``` text
{STORY_ROOT}/{GUID}/story.json
```

The method used to configure `STORY_ROOT` is a runtime concern rather
than part of the Story Language.

Environment variables are one valid implementation.

A central story registry is therefore **not required** for basic story
resolution.

------------------------------------------------------------------------

# 29. Local-first authoring workflow

**Classification: Architecture guidance**

The recommended development loop is:

``` text
┌─────────────────┐
│ Scrolltastic    │
│ renderer source │
└───────┬─────────┘
        │ run locally
        ▼
┌─────────────────┐
│ Local renderer  │◄──────────────┐
└───────┬─────────┘               │
        │                         │
        ▼                         │ edit
┌─────────────────┐               │
│ Local stories/  │───────────────┘
│ GUID/story.json │
│ assets...       │
└───────┬─────────┘
        │
        │ publish/sync
        ▼
┌─────────────────┐
│ Remote story    │
│ object storage  │
└─────────────────┘
```

This gives authors a tight:

``` text
edit → refresh → inspect
```

loop without deploying either application code or unfinished story
content.

------------------------------------------------------------------------

# 30. Independent code and content deployment

**Classification: Architecture guidance**

Code and content SHOULD have independent lifecycles.

``` text
CODE PIPELINE

Git repository
      │
      ▼
application deployment
      │
      ▼
Scrolltastic renderer


CONTENT PIPELINE

local story package
      │
      ▼
story publish/sync
      │
      ▼
story object storage
```

They meet only at runtime.

This means publishing a new story SHOULD NOT require rebuilding the
renderer.

Updating renderer code SHOULD NOT require republishing every story.

Vercel plus object storage is one possible implementation, but this
architecture is intentionally platform-neutral.

------------------------------------------------------------------------

# 31. Content publishing

**Classification: Future tooling**

A future Scrolltastic CLI could provide:

``` text
scrolltastic validate ./stories/<guid>

scrolltastic serve ./stories/<guid>

scrolltastic push ./stories/<guid>
```

Possible additional commands:

``` text
scrolltastic new
scrolltastic preview
scrolltastic inspect
```

These commands are tooling and are NOT Story Language primitives.

------------------------------------------------------------------------

# 32. Validation

**Classification: Extended**

Story documents SHOULD be validated before rendering or publishing.

Validation SHOULD distinguish:

### Error

Story cannot be interpreted reliably.

Example:

``` text
Dialogue frame is missing "text".
```

### Warning

Story is valid but potentially problematic.

Example:

``` text
Narrative frame contains 184 words.
Consider splitting it across Beats.
```

### Accessibility warning

Example:

``` text
Meaningful image has no alternative text.
```

### Compatibility warning

Example:

``` text
Story uses a capability unsupported by this renderer.
```

Validation messages SHOULD reference the Story Language path of the
offending object.

------------------------------------------------------------------------

# 33. Error handling

**Classification: New**

A malformed story MUST NOT result in an unexplained blank page.

Development renderers SHOULD provide useful diagnostics.

Example:

``` text
Scrolltastic Story Error

Panel: spear-pillar
Frame: cyrus-dialogue

Property "text" is required for a dialogue frame.
```

Production behaviour MAY be less verbose but SHOULD fail gracefully.

------------------------------------------------------------------------

# 34. Versioning

**Classification: New**

Every story MUST identify its Story Language version.

``` json
{
  "storyLanguage": "5"
}
```

Renderers SHOULD declare which Story Language versions they support.

Breaking language changes require a new major Story Language version.

Adding optional backwards-compatible capabilities MAY occur within a
versioned schema revision.

The language version MUST describe the Story Language, not the renderer
implementation version.

------------------------------------------------------------------------

# 35. Security boundary

**Classification: New architectural requirement**

Story content MUST be treated as untrusted input.

A renderer MUST NOT interpret arbitrary Story Language strings as
executable JavaScript.

Story packages SHOULD NOT be able to inject:

-   scripts;
-   arbitrary HTML;
-   arbitrary event handlers;
-   executable URLs.

Remote asset handling SHOULD apply appropriate origin and content
restrictions.

This separation is particularly important once stories can be uploaded
independently of application deployment.

------------------------------------------------------------------------

# 36. Performance principles

**Classification: New / Cross-cutting**

Storytelling quality depends on smooth interaction.

Renderers SHOULD:

-   lazy-load media where appropriate;
-   avoid loading every high-resolution asset immediately;
-   minimise layout thrashing;
-   optimise images;
-   preserve smooth scrolling;
-   avoid animation work for off-screen content;
-   respect reduced-motion preferences.

Future specification work MAY establish recommended story performance
budgets.

------------------------------------------------------------------------

# 37. Visual reference requirement

**Classification: New specification rule**

Every significant Story Language primitive SHOULD include a visual
explanation in the specification.

A primitive definition should ideally contain:

1.  purpose;
2.  anatomy diagram;
3.  properties;
4.  JSON example;
5.  validation rules;
6.  accessibility considerations;
7.  renderer expectations.

Example:

``` text
PANEL

┌─────────────────────────────────────┐
│ ← padding                           │
│   ┌─────────────────────────────┐   │
│   │ frame                       │   │
│   └─────────────────────────────┘   │
│                           padding → │
└─────────────────────────────────────┘
 ↑ border                     radius ↗
```

These diagrams act as both documentation and informal visual test
oracles.

------------------------------------------------------------------------

# 38. Deliberately deferred capabilities

The following capabilities are important but are intentionally not fully
specified in V5.

## 38.1 Motion

**Classification: Future**

A generic motion model should eventually describe how Story Language
objects change between Beats.

Conceptually:

``` text
Beat A                          Beat B

 card                            card
   ┌───┐                           ┌───┐
   │   │ ───────────────────────► │   │
   └───┘                           └───┘
```

Potential concepts include:

-   enter;
-   exit;
-   translate;
-   scale;
-   rotate;
-   opacity;
-   parallax.

V5 MUST NOT prematurely expose the complete animation-library API.

## 38.2 Camera

**Classification: Future**

Camera semantics may eventually include:

-   focus;
-   pan;
-   zoom;
-   track;
-   reveal.

Camera describes the reader's visual viewpoint rather than movement of
an individual object.

## 38.3 Audio

**Classification: Future**

Audio may eventually include:

-   ambient tracks;
-   music;
-   sound effects;
-   character/Pokémon cries;
-   Beat-triggered audio.

Audio should probably be associated with narrative time/Beats rather
than arbitrary DOM events.

Accessibility and autoplay restrictions must be considered before
defining the contract.

## 38.4 Video

**Classification: Future**

Video requires explicit contracts for:

-   playback;
-   scroll relationship;
-   accessibility;
-   captions;
-   reduced data;
-   fallback imagery.

## 38.5 Effects

**Classification: Future**

Possible effects include:

-   glow;
-   mist;
-   particles;
-   distortion;
-   lighting;
-   portal effects.

Effects SHOULD be semantic presets where practical rather than embedded
shader/programming APIs.

------------------------------------------------------------------------

# 39. What Scrolltastic Story Language is not

The following are explicit non-goals.

Scrolltastic Story Language is **not**:

-   HTML encoded as JSON;
-   CSS encoded as JSON;
-   a React component description;
-   an animation-library configuration file;
-   a general website builder;
-   an unrestricted scene graph;
-   a programming language.

Whenever a proposed primitive moves the language toward one of these,
the design SHOULD be reconsidered.

The preferred question is:

> **What story intention are we trying to express?**

------------------------------------------------------------------------

# 40. JSON, YAML and XML

V5 standardises JSON as the canonical Story Language representation.

## JSON

**Decision: canonical format**

Advantages:

-   deterministic;
-   ubiquitous tooling;
-   straightforward schema validation;
-   natural browser/runtime support;
-   predictable parsing.

## YAML

**Decision: not canonical; possible future authoring format**

YAML may eventually be accepted by authoring tools and converted into
canonical Story Language JSON.

It SHOULD NOT define different semantics.

## XML

**Decision: not adopted**

XML provides little benefit for the current Scrolltastic model relative
to its additional authoring complexity.

This is a conscious design decision rather than an accidental omission.

------------------------------------------------------------------------

# 41. Conformance

A V5-compatible renderer SHOULD demonstrate:

### Structure

-   Story document parsing;
-   Body;
-   Container;
-   Panel;
-   Frame.

### Narrative

-   narrative frames;
-   dialogue frames;
-   semantic speaker attribution.

### Visual

-   images/artwork;
-   cards;
-   masks where supported;
-   panel presentation.

### Navigation

-   continuous scrolling;
-   Beats;
-   advance;
-   reverse;
-   keyboard operation.

### Typography

-   renderer-supported curated fonts;
-   inheritance;
-   Unicode-safe text rendering.

### Accessibility

-   semantic reading order;
-   alt/decorative image behaviour;
-   keyboard parity;
-   reduced motion;
-   screen-reader narrative test.

### Packaging

-   relative asset resolution;
-   GUID story namespace;
-   configurable story root.

### Robustness

-   schema validation;
-   useful development errors;
-   version checking;
-   safe treatment of story input.

------------------------------------------------------------------------

# 42. Reference story

The project SHOULD maintain a small canonical V5 reference story.

It should deliberately exercise:

``` text
Body
 └── Container
      ├── Panel
      │    ├── Narrative
      │    └── Artwork
      │
      ├── Panel
      │    └── Dialogue
      │
      └── Panel
           └── Card

Beats:
  arrival
  reveal
  dialogue
  card
  departure
```

The reference story becomes the baseline for:

-   schema validation;
-   renderer regression tests;
-   visual regression tests;
-   keyboard navigation;
-   reduced-motion behaviour;
-   screen-reader testing;
-   internationalisation tests.

A second reference story SHOULD use a non-Latin script.

A third SHOULD eventually exercise right-to-left text.

------------------------------------------------------------------------

# 43. Implementation sequence after V5

V5 suggests the following implementation order.

``` text
1. Freeze V5 core vocabulary
          │
          ▼
2. Align JSON Schema
          │
          ▼
3. Align renderer
          │
          ▼
4. Build reference story
          │
          ▼
5. Add typography
          │
          ▼
6. Accessibility benchmark
          │
          ▼
7. Story package/local root
          │
          ▼
8. Content publish workflow
          │
          ▼
9. Generic motion design
```

Motion should be designed **after** the underlying story objects have
stable semantics.

------------------------------------------------------------------------

# 44. Architectural test

Before adding any new Story Language property or primitive, ask:

### Test 1 --- Is it about the story?

If not, it may belong in the renderer or tooling.

### Test 2 --- Is it semantic?

Prefer:

``` text
dialogue
```

over:

``` text
positioned text box
```

### Test 3 --- Are we recreating HTML/CSS?

If yes, reconsider the abstraction.

### Test 4 --- Can it remain accessible?

If the primitive only makes sense visually, define its semantic
fallback.

### Test 5 --- Can it work internationally?

Do not assume English word lengths, Latin glyphs or left-to-right
layout.

### Test 6 --- Can another renderer interpret it?

Avoid leaking implementation-specific concepts into the language.

------------------------------------------------------------------------

# 45. V5 design statement

The Scrolltastic Story Language exists to let creators express:

> **what happens in a visual story, what the reader encounters, and when
> meaningful moments occur.**

The renderer determines how those intentions become a responsive,
accessible interactive experience.

The fundamental model is therefore:

``` text
              STORY

                │
                ▼
        ┌───────────────┐
        │ COMPOSITION   │
        │ Body          │
        │ Container     │
        │ Panel         │
        │ Frame         │
        └───────┬───────┘
                │
                ▼
        ┌───────────────┐
        │ NARRATIVE     │
        │ Narrative     │
        │ Dialogue      │
        │ Card / Art    │
        └───────┬───────┘
                │
                ▼
        ┌───────────────┐
        │ TIME          │
        │ Beats         │
        │ Advance       │
        │ Reverse       │
        └───────┬───────┘
                │
                ▼
        ┌───────────────┐
        │ EXPERIENCE    │
        │ Typography    │
        │ Accessibility │
        │ Language      │
        └───────────────┘
```

Future capabilities such as motion, camera, audio and effects should
extend this model rather than undermine it.

------------------------------------------------------------------------

# 46. Core principle

> ## Scrolltastic describes a story, not a web page.

That principle is the primary test for every future addition to the
Scrolltastic Story Language.

# 47. Executable V5 contract

This section resolves illustrative ambiguities above for the current renderer.
It takes precedence over earlier examples and V4's historical 0.x contracts.
All project-owned documents migrate directly; no legacy parser is retained.

- A story requires `storyLanguage: "5"`, root UUID v4 `id`, nonblank `title`
  and `body`. Body has no separate ID/title. `/s/<id>` remains the reader route.
- Containers use `flow`, containing typed Panels and first-class `Space`.
  `panels` is not accepted. Space retains its existing explicit height semantics.
- Frame `normal`, `overlay`, `overflow` and shared physical anchors retain their
  meaning. RTL text does not mirror artwork coordinates. IDs share one namespace.
- Height accepts `auto`, `content`, `viewport`, or the existing bounded object
  forms. Default is auto; fixed/viewport are exact heights. Auto/content require
  normal-flow content. There is no independent `artwork-fit` height mode yet.
- Media references use `src`, including Mask content. Paths are confined to
  `assets/` or `cards/` in the package, with existing safe path/extension rules.
  Background stays a decorative, Panel-filling surface; Image is authored content.
  `artwork` is descriptive vocabulary, not a separate Frame discriminator.
- Static Image/Card aspect ratios are optional. Without metadata, images establish
  natural height when loaded; until then a 1:1 placeholder reserves space. Authors
  should supply `aspectRatio` to prevent shifts. Failed images retain that reserve.
  Card transitions require explicit ratio and standard artwork-window geometry.
  A static Card needs neither geometry nor `cardType`; omitted type means standard.
  Full-art Cards and full-art transitions remain unsupported.
- `decorative: true` suppresses media from assistive technology and produces empty
  alt text. Nonempty alt with decorative true is an error. Missing/blank meaningful
  alt produces an accessibility warning and an explicit missing-description fallback,
  never silent decoration. Backgrounds are always decorative. Mask semantics come
  from their content. Dialogue may declare a nonblank `speaker`; speaker and speech
  are rendered together as ordinary text in authored order.
- `language` and `direction` (`ltr`, `rtl`, `auto`) inherit from Story through Body,
  Container, Panel and Frame, with local overrides. Language tags must be accepted
  by the platform's BCP 47 locale parser. Text is never interpreted as markup.
- Typography inherits property by property from Body through Container/Panel/Frame.
  The initial renderer catalogue is `story-sans`, `story-serif`, `comic`,
  `handwritten`, `dramatic`, `technical`, using system font stacks with fallbacks.
  No story-provided font URLs are accepted. Sizes are small/medium/large/x-large;
  weight normal/bold; style normal/italic; align start/center/end; lineHeight
  compact/normal/relaxed; letterSpacing normal/wide. Semantic tones remain future.
- Narrative `shape` defaults to `rectangle` and accepts `rectangle`,
  `parallelogram`, or `torn-ribbon`. Dialogue defaults to `spoken`, uses an
  `oval` bubble and a bottom `triangle` tail; `thought` uses a `cloud` bubble
  and `circle-chain` tail. `fat-circle` is unsupported. Manual tails accept
  eight physical directions and may be disabled. Adjacent Dialogue Frames in
  one Panel may form an acyclic forward chain with `bridge`, `line`,
  `bubble-chain`, or `none`; chain targets must be the next authored Dialogue.
  Intermediate bubbles have no tail by default.
- `sound-effect` is accessible visualised sound text. Its renderer-owned static
  styles are `burst`, `impact`, `motion`, `rumble`, `electronic`, and `ambient`,
  defaulting to `impact`. It uses shared Frame flow, positioning, typography,
  locale, Element Beats, and reveal animation. It does not accept arbitrary
  transforms, font families, audio, or target-driven motion.
- Body/Panel `background` and inherited `color` accept six-digit hex colours.
  Panel padding/gap/radius accept none/small/medium/large. Border requires a colour
  and optional thin/medium/thick width. Opacity is 0–1. Align is start/center/end
  and applies to normal-flow children. Gap does not separate overlay Frames.
  Panel padding defines its normal-flow content inset; physical overlay coordinates
  and Card takeover bounds remain relative to the full Panel. FIT height includes
  padding and border so downstream Panels remain in flow.
- Panel overflow defaults to hidden for ordinary visuals. `visible` permits ordinary
  visuals to extend; explicit overflow Frames always retain their escape context.
  Radius clips ordinary visual content, not overflow Frames. FIT extraction keeps
  its own moving artwork viewport, preserving the complete art rather than applying
  a second Panel clip to its anchored stage. Reading order remains
  authored order using per-Frame clipping, not regrouped semantic layers.
- Root `beats` declare Element Beats with required `id`/`target`, optional label,
  align and offset. Targets must be explicit Panel/Frame IDs. Existing embedded
  Element and Card/Mask Timeline Beats remain supported and can carry labels.
  Multiple distinct Beats may target the same element. IDs cannot repeat anywhere.
  Coordinate sorting is authoritative. Ties follow composition traversal: embedded
  Element Beat, root Beats targeting that element in root-array order, then its
  Timeline Beats. Root timeline syntax is deferred. No automatic focus movement.
- Existing bounded reveals, Card phases, pin defaults, one-pinned-Card limit,
  Timeline Beat fallbacks and all input policies remain. Inputs require controls;
  snap and Flip cannot compete. Generic motion remains future.
- Root `accessibility.summary` is optional introductory plain text, rendered once
  after the title. No other accessibility-default fields are defined yet. `metadata`
  is non-rendering: at most 32 scalar values, strings at most 2000 characters.
- Validation errors block rendering. Nonfatal diagnostics distinguish authoring,
  accessibility and compatibility categories and retain authored JSON paths.
  Unsupported properties/capabilities are errors, not silently dropped warnings.
  Narrative-length advice is locale-aware, nonfatal and not a hard word limit.
- Hosts may configure a story-root HTTP(S) URL independently of the renderer.
  Documents and assets remain package-relative, restricted to that trusted root's
  origin and package prefix. Document fetches reject redirects; asset requests use
  native image loading from the trusted package host. JSON endpoints must
  return JSON, not an HTML fallback. Story content never supplies the trusted root.

The small V5 reference packages and the existing comic/cinematic packages serve
as conformance fixtures. Browser checks supplement, but do not replace, the real
screen-reader and physical mobile benchmark in sections 25 and 41.
