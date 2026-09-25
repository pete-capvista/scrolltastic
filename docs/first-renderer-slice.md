# First renderer slice

> Historical implementation notes. All current packages use Story Language V5;
> see [the executable contract](../scrolltastic_story_language_v5.md#47-executable-v5-contract)
> and [current README](../README.md) for authoring and verification.


Status: static renderer, scroll reveals, Mask Frames, pull-focus, static standard Cards, OUT + CROP, OUT + FIT, IN + FIT and BOTH + FIT, Beat resolution and Advance/Reverse controls are implemented through contract 0.14 (including keyboard, Flip, snapping, and tap-to-Advance).

The canonical language and hosting contract are in
[the design specification](../scrolltastic_design_spec_v4.md), especially
sections 29–40 and 55–71. This document records the implemented renderer
boundaries and the capabilities deferred to subsequent slices.

## Agreed scope

- Framework-independent TypeScript renderer, mounted into a supplied root.
- One Body per story; multiple stories hosted by the reader website.
- A separate folder per story, with `story.json` and relative assets.
- Permanent, random UUID v4 story URLs suitable for public QR access.
- Public reading without login; authenticated ownership for drafts and editing.
- Separate reader, creator, renderer and publication responsibilities.
- Static layout first, with three independently addressable local fixtures.
- Explicit `fixed` and `viewport` Panel heights are exact; `content` grows naturally.
- Meaningful Frames retain authored DOM order, with per-Frame wrappers where needed.
- Vercel-compatible hosting, with durable story storage separate from deployments.

These are initial decisions, not permanent constraints. Revisions must update
the specification, schema, fixtures and tests together. Changes affecting
published documents need an explicit compatibility or migration strategy.

## Module boundaries

| Module | Responsibility |
| --- | --- |
| `schema/` | Public JSON Schema, validation and document-path errors. |
| `model/` | Discriminated document types generated from the schema. |
| `parser/` | JSON parsing, semantic checks and pure default normalization. |
| `renderer/` | Structural DOM construction and element-reference registry. |
| `frames/` | Background, Image, Narrative, Dialogue, Mask and Card renderers. |
| `layout/` | Height, placement, clipping and batched layout invalidation. |
| `assets/` | Package-relative URLs, dimensions, readiness and failure handling. |
| `animation/` | Scrubbed timelines, responsive/reduced-motion lifecycle and numeric scroll ranges. |
| `beats/` | Coordinate resolution, stable ordering and an observable read-only Beat index. |
| `interaction/` | Input-independent Advance/Reverse actions and destination tracking. |
| `inputs/` | Accessible controls and interruption handling. |
| Reader host | Route resolution, configuration loading and renderer lifecycle. |

Tooling: Vite development host, Ajv runtime validation, unit
tests for language semantics and browser tests for layout. Avoid creating
empty animation, Beat or input frameworks ahead of their slices.

```text
reader URL → package location → load JSON
  → validate → normalize → render DOM → settle relevant layout
```

The engine boundary is `mountStory(root, document, { assetBaseUrl })`,
returning readiness and destruction handles. Invalid input yields useful
errors before mounting partial content. Destruction releases owned DOM,
listeners and observers. A route change cancels stale loading so an older
request cannot replace the newly selected story.

Reserve image geometry before loading. Readiness must not wait indefinitely
for offscreen lazy images. Later image or font changes invalidate layout.
Future animations attach after measurable layout; future Beat resolution
runs after completed ScrollTrigger refresh, not merely after requesting it.

## Language clarifications

The initial contract is now recorded in specification section 62 and
`src/schema/story.schema.json`. The following choices apply to contract 0.1.

| Topic | Contract 0.1 |
| --- | --- |
| Container | Use `flow`, not `panels`; reject older shapes with a migration diagnostic initially. |
| Seam | Canonical object form; initially implement only `seamless`, with explicit Space for pacing. |
| Panel height | Support `auto`, `content`, `viewport`, `fixed`; explicit modes mean exact height, not minimum height. Defer `artwork-fit`. |
| Position | Match the chosen anchor on Frame and Panel; percentage x/y offsets use Panel dimensions. Keep placement separate from future animation transforms. |
| Text | Add explicit plain-text `text` fields to Narrative and Dialogue; no authored HTML in this slice. |
| Images | Add `alt`; use the existing `aspectRatio` field to reserve Image geometry initially. Decorative Backgrounds are excluded from semantic reading content. |
| Defaults | Omitted Panel height means `auto`; Image and text default to normal flow, Background to overlay. Positioned overlay/overflow Frames require a position, except panel-filling Backgrounds. |
| Unsupported declarations | Fail clearly for unimplemented capabilities; never silently discard authored behaviour. Bleed support is deferred. |

Fixed heights use `{ "mode": "fixed", "value": "480px" }`. Supported units
are `px`, `rem`, `vw`, `vh`, `svh`, and `dvh`, plus unitless zero. Frame
dimensions/offsets also accept `%`. Tokens and CSS functions are deferred.

## DOM and reading-order decision

Preserve the conceptual separation between normal flow, clipped visuals
and unclipped overflow. The outer Panel must not clip overflow.

The specification's three physical layer wrappers can reorder meaningful
Frames when grouping children by flow. The implementation keeps
meaningful Images and text in authored DOM order, using per-Frame clipping
and positioning wrappers as needed; decorative surfaces may use dedicated
visual layers. This refinement of the illustrative Panel DOM strategy is
agreed for the initial implementation.

Do not duplicate narrative content into a hidden accessibility copy.
Test reading order, background placement, z-order within a Panel, and
overflow across adjacent Panels. Do not accidentally introduce stacking
contexts that prevent authored overlap.

## Build sequence

1. Record final language clarifications and create schema/types together.
2. Add the development host, parser and two story packages.
3. Render structural flow, heights and Background/Image Frames.
4. Add text Frames, positioning, clipping and overflow.
5. Complete readiness, failure handling and mount/unmount lifecycle.
6. Run language and browser acceptance checks and review the fixtures.

No accounts, database, storage provider, publishing backend or QR-generation
dependency is needed to prove this slice. Its boundaries must permit those
features without making the renderer aware of them.

For Vercel compatibility, the reader host must support direct navigation
to `/s/<story-id>` through an explicit route or scoped SPA rewrite. Missing
JSON/assets must not be rewritten to the HTML entry point. The initial
fixtures may ship as static build assets; future user-created stories live
in durable storage and publish independently of website deployments.

## Acceptance checks

- All three `/s/<story-id>` routes load their own configuration and assets,
  including when opened directly or refreshed.
- Relative asset resolution stays within the selected package; missing
  stories show a reader error rather than a different story or draft.
- Malformed JSON, duplicate explicit IDs, invalid combinations and
  unsupported features produce document-path diagnostics.
- A `content` Panel requires a normal-flow child capable of establishing height.
- Natural Image heights follow aspect ratios at narrow and wide viewports.
- Space retains its authored height when text overlaps it.
- Overlay/overflow Frames do not alter semantic Panel height.
- Mask Frames clip their image to ellipse, rounded-rectangle or polygon shapes;
  pull-focus expands the authored mask through the configured Panel range.
- Standard Cards render the complete authored front, reserve intrinsic geometry,
  expose normalized artwork-window metadata, and preserve alternative text.
- Overflow remains visible; adjacent image compositions have no accidental gap.
- Text is readable, authored reading order survives layering, and native
  scrolling works with reduced-motion preferences enabled.
- Image failures retain reserved geometry and meaningful alternative text.
- Route changes and repeated mount/destroy cycles leave no stale content,
  listeners or observers.

The first scroll reveal adds the version 0.2 `scrollAnimation` contract,
GSAP / ScrollTrigger setup after layout, media-query cleanup, and fixture
reveals. Browser inspection confirmed opacity scrubs in both directions,
text stays in the accessibility tree, and reduced motion shows content
fully. The production build and type checks pass. The automated test suites
were not rerun for this slice.

The Mask slice adds contract 0.3 shape geometry and the reversible
pull-focus transition. Its schema, parser, image rendering and GSAP setup
are covered by the production build and manual browser inspection.
Automated test suites were not run for this slice.

The trading-card slices add contract 0.4 static standard Card Frames,
contract 0.5 reversible OUT + CROP transitions, contract 0.6 OUT + FIT and
contract 0.7 IN + FIT.
They use complete card-front assets and normalized artwork-window geometry.
The three-card fixture demonstrates Lunora, Dravion and Volgarr in authored
order, with Lunora transitioning to full-width artwork while the following
Panels move up underneath the pinned story prefix as its content-sized Panel
contracts. FIT transitions introduced in 0.6 and 0.7 pin by default;
`scrollMode: "flow"` opts out.

Contract 0.11 adds scoped Arrow Down/Up input. Contract 0.12 adds touch Flip recognition on the story surface.

## Verification results

- 44 unit tests pass for parsing, validation, fixture assets and package URL resolution.
- 130 browser cases cover mobile-emulated and desktop Chromium, including
  scoped keyboard navigation, touch Flip, native drag arbitration and controls-only compatibility.
- Type checking, generated-type consistency and the production build pass.
- Visual inspection confirms the portrait fixture, overflow captions and homepage render.
- Valid story loads produce no browser console errors.

Browser automation covers the URL-to-configuration-to-assets-to-rendered-DOM
flow. It does not substitute for physical iOS Safari/Android testing.
Vercel routing is deployed and verified. Git pushes to `main` deploy production and
other branches create Preview deployments. Production loads the migrated packages
from Blob. Creator authentication and publishing remain the implementation contract
documented in `blob-publishing-workflow.md`.


Contract 0.8 adds BOTH + FIT as one scrubbed timeline with required IN,
hold and OUT ranges. The Guardians fixture now opens with Lunora's complete
artwork → Card → hold → artwork sequence; Dravion retains IN + FIT in flow
mode. The pinned BOTH sequence reserves real scroll distance across all
three phases. Reduced motion restores the static Cards.

The BOTH + FIT browser checks cover all phases in pin/flow modes, reverse
scrolling, resizing during the hold, live reduced-motion changes, route cleanup,
short-story reachability and downstream reveal refresh.


Contract 0.9 adds optional Element Beats to Panels/Frames and Timeline Beats
to Card/Mask transitions. `beats/` owns pure coordinate resolution and the
batched read-only index, while the animation layer publishes numeric ranges
after refresh. `handle.beats`, `onBeatsChange` and `story:beats` expose the
index to hosts without coupling it to an input adapter. The ridge fixture
exercises an overflow Frame Beat and Mask timeline; Guardians exercises the
pinned Card timeline. Reduced motion preserves IDs at Frame-center fallback
destinations. The renderer performs no assisted scrolling or focus changes.

Beat checks cover schema/version validation, ordering and clamping, pinned
coordinates, Mask/Card timeline destinations, responsive recalculation,
FIT layout updates, reduced-motion fallback, static embeds and teardown.


Contract 0.10 adds `body.interaction.advance` with explicit opt-in. The pure
`interaction/` controller selects destinations from the current scroll
position, while `animation/assisted-scroll.ts` moves real document scroll
and `inputs/controls.ts` supplies the reader's Previous/Next adapter. Hosts
can reuse the controller with injected drivers and independent inputs.
The reader reserves room for its control bar when resolving Element Beats.
No input handler prevents continuous manual scrolling or moves DOM focus.
Checks cover boundaries and coincident Beats, repeated/opposite requests,
manual interruption, reduced motion, native button keyboard access, resize,
route cleanup and Card timeline states.

## Keyboard input (0.11)

`advance.inputs` accepts controls alone or controls plus keyboard; omitted
input selection retains the 0.10 default. `inputs/keyboard.ts` shares the
controls adapter’s navigation controller and confines shortcuts to reader
focus. It preserves editable/widget keys, modifiers, composition, native
scrolling at boundaries, and focus during movement. Teardown restores the
host tabindex. Both Beat fixtures enable the adapter.

## Touch Flip (0.12)

`inputs/flip.ts` adapts short native-direction touch flicks to the same
Advance/Reverse actions. Pure threshold checks live in `flip-gesture.ts`.
It claims only eligible first moves; native drags and wheel scrolling stay
available. A captured fast start that becomes a long gesture falls back to
continuous document dragging. Tests use Chromium touch injection to exercise
actual default scrolling, plus validation and deterministic gesture checks.

The early touch arbitration follows the [Touch Events default-action contract](https://www.w3.org/TR/touch-events/#the-touchmove-event): canceling the first move can prevent scrolling for that gesture. Gestures already owned by native scrolling are left alone.


## Settled scroll snapping (0.13)

The ridge now opts into `interaction.scroll.snap: "beats"`, with Flip removed
from its input list. `inputs/scroll-snap.ts` observes native touch, wheel and
scroll-end events; it never cancels touch movement. Held contact prevents a
snap, momentum finishes first, and a new touch cancels assistance. The shared
controller's `snap()` selects the nearest Beat and tracks its ID. Tests cover
real browser dragging, paused contact, momentum, interruption, no self-snap
loops, reduced motion, opt-out and pinned Card timelines.

The native completion signal follows [document scrollend semantics](https://developer.mozilla.org/en-US/docs/Web/API/Document/scrollend_event).
An idle timer supports browsers without that event. Flip regression tests
now opt into the 0.12 policy explicitly instead of inheriting the ridge's
current interaction policy.

## Tap-to-Advance (0.14)

The ridge now selects free scrolling plus tap-to-Advance. `inputs/tap.ts`
observes short stationary primary-pointer contacts on noninteractive story
content and invokes the existing Advance action. It never prevents native
scrolling and ignores compatibility clicks, drags, long presses, selections
and contacts that interrupt movement. Snap and Flip stay available as
separately authored options; their regression fixtures select them explicitly.
