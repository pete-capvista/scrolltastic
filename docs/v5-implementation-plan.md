# V5 analysis and implementation plan

Status: implemented core, 2026-09-25. The direct V5 migration and phases 1–5
are implemented, with automated conformance fixtures from phase 6. Nothing was
live, so all project-owned packages migrated together without legacy schemas or
version dispatch. Section 47 of the V5 specification records the concrete language
decisions below. Human screen-reader and physical-device verification remain open;
see [verification evidence](v5-verification.md).

Sources: [V5 draft](../scrolltastic_story_language_v5.md),
[V4 specification and implemented contracts](../scrolltastic_design_spec_v4.md),
and the current repository. V5 is the target; V4 sections 60–75 describe
important executable semantics that V5 says to preserve unless explicitly changed.

## Assessment

V5 consolidates Scrolltastic into a portable story language and adds semantic
text, presentation, internationalisation, accessibility and packaging requirements.
It does not require rebuilding the scrolling engine. Its largest risk is that
illustrative JSON differs from the implemented contract without fully defining
replacement semantics. Freeze those differences before changing the schema.

The document is still marked Draft. Its “Existing” classification means previously
established design, not necessarily implemented functionality. “MAY”, “SHOULD”,
examples and explicitly future concepts should not all become mandatory features.

## Repository baseline

| Area | Implemented | V5 gap |
| --- | --- | --- |
| Document contract | AJV JSON Schema, generated TypeScript, versions 0.1–0.14, path diagnostics | `storyLanguage: "5"`, root identity/title/locale, diagnostic categories |
| Composition | Body, Container.flow, Panel, Space, three Frame flows, shared positioning | Body defaults, Panel presentation, agreed simplified height syntax |
| Text | Plain Unicode strings inserted using `textContent`, authored DOM order | Speaker, inheritable typography, language/direction, text colour |
| Media | Background, Image, Mask, standard Card; explicit aspect ratios | `src`, explicit decorative flag, simple static Card contract, optional intrinsic sizing policy |
| Animation | Text reveals, mask pull-focus/takeover, OUT+CROP, OUT/IN/BOTH+FIT | Preserve behavior; V5 does not specify a replacement motion API |
| Beats/input | Element/Timeline Beats, coordinate resolution, controls, keyboard, Flip, snap, tap, interruption | Root target references, Beat labels, coexistence/order rules |
| Accessibility | Text DOM, alt text, reading order, native buttons, reduced-motion fallback | Speaker semantics, locale inheritance, explicit decorative intent, real screen-reader benchmark |
| Packages | UUID v4 `/s/<id>`, isolated relative assets, cancellable loading | Configurable story root; `cards/` paths; content independent of the build |
| Robustness | Strict property rejection, safe text insertion, package containment, useful development errors | Nonfatal warnings, supported-version declaration, remote-source policy |

Relevant implementation: `src/schema/story.schema.json`, `src/parser/parse.ts`,
`src/renderer/mount.ts`, `src/frames/render.ts`, `src/renderer/story.css`,
`src/layout/lifecycle.ts`, `src/beats/`, `src/interaction/`, `src/inputs/`,
`src/assets/resolve.ts`, and `src/reader/main.ts`.

Existing limits must remain explicit: one pinned Card transition per story;
four implemented Panel height modes; standard Cards only; no authored bleed,
full-art transitions, Character/Effects/Title frames or separate artwork sources.
`artwork-fit` is a wider V4 concept, not an implemented height mode.
The renderer already uses per-Frame wrappers to preserve semantic order, as
agreed in V4 section 60; restoring three physically grouped layers would regress it.

Verification for this analysis: `npm test` passed 44 tests in four files;
`npm run build` passed generated-type consistency, TypeScript and Vite build.
The existing Playwright suites were inspected but not run for this planning task.

## Design decisions (resolved in V5 section 47)

The following records the original recommendations. Section 47 now supplies the
implemented choices, including defaults and the boundaries of unsupported features.

| Decision | Recommendation and consequence |
| --- | --- |
| `Container.panels` versus `flow` | Retain `flow` as canonical, including first-class `Space`; correct the V5 example. Do not maintain two competing child lists. |
| Root identity | V5 owns `id` and `title` at the root. Move existing Body identity and title to the root in every fixture. Specify whether Body may have a separate element ID and whether story IDs remain UUID v4; the draft says UUID/string while packaging says GUID. |
| Height syntax | Accept semantic `auto`, `content`, `viewport` shorthand and retain a bounded object form for fixed/viewport sizing. Define exact versus minimum height explicitly; preserve existing exact-height behavior. |
| Root Beats | Add root Element Beats with `target` and optional `label`; retain embedded Element/Timeline Beats initially. Define a single ID namespace, target eligibility, tie ordering and duplicate-declaration rejection. Root array order must not silently override physical scroll order. Root timeline syntax needs a separate explicit decision. |
| `src` versus `asset` | Use `src` in media declarations and migrate every existing `asset` reference. Specify the rename for nested Mask content too. Reject mixed spellings within a V5 declaration. |
| Artwork Frame | No distinct behavior is defined. Use Image composition initially; do not add an `artwork` discriminator until its semantics differ meaningfully from Image. Clarify this in the vocabulary list. |
| Simple Card | Permit a static Card without an artwork window; require standard-card geometry only when extraction is requested. Do not infer a window or introduce full-art transitions. Decide whether `cardType` is required or defaults for the simplified example. |
| Image dimensions | Decide whether minimal `src`/`alt` examples are complete documents or fragments. Recommend optional metadata for static images, intrinsic measurement when absent, and deterministic dimensions before transitions attach. Document failed-image geometry and layout shifts; retain explicit ratios in regression fixtures. |
| Panel clipping | Specify interaction between Panel `overflow: hidden` and Frame `flow: overflow`. Recommend clipping ordinary visuals while explicit overflow Frames retain their escape context; the spec must state this exception before coding. |
| Presentation vocabulary | Define accepted tokens, defaults and bounds for background, border, radius, padding, gap, opacity, align and typography. Start with colour backgrounds; image backgrounds already compose through Background Frames. Do not accept arbitrary CSS objects. |
| Accessibility metadata | Define concrete fields before admitting root `accessibility` or inherited accessibility defaults. A free-form object cannot promise behavior. Define metadata as non-rendering data with bounded JSON values. |
| Image accessibility | `decorative: true` produces empty alt and suppression; meaningful images should supply nonblank alt. Decide conflict handling for decorative plus meaningful alt and whether missing alt is a warning or error. V5 suggests accessibility warnings; do not silently classify missing alt as decoration. |
| Compatibility failures | Warnings may cover safe, documented fallbacks. Unknown versions, invalid structure, missing targets and unsupported essential semantics remain errors. Never silently drop a required story moment. |
| Routes and releases | Keep stable `/s/<id>` links; `/story/<GUID>` is conceptual in V5, not a required breaking route change. Make story-root loading configurable without removing V4's future immutable-release/publication boundary. |

Also update AGENTS.md and README canonical references when the V5 contract is
agreed. Keep V4 as historical detail with an explicit precedence statement.

## Architecture approach

Keep the framework-independent renderer, GSAP layer, Beat resolver and input
adapters. Update the existing schema and parser in place, with one normalized
model and no branching on historical document versions.

```text
V5 JSON → schema/semantic validation → normalized story → DOM/layout
                                                      → animation/Beats
                                                      → input adapters

Reader resolver → document + package base URL → parser/renderer
```

Keep generated public types sourced from `src/schema/story.schema.json`. Remove
0.x version gates and migrate all packages, test inputs and examples together.
Retain `storyLanguage: "5"` as the identifier required by the V5 specification;
this is a single accepted value, not a multi-version compatibility system.
Preserve source paths through normalization so diagnostics refer to authored JSON.
Where an old version selected behavior, express the intended behavior explicitly
in migrated fixtures (for example, `scrollMode: "flow"` for unpinned Cards).

Suggested focused additions: `model/normalized.ts`, `typography/`,
`layout/presentation.ts`, and `reader/resolve-story.ts`. Reuse the existing schema,
generator and parser. Split modules when their responsibilities require it; no
new framework, database or storage SDK is needed.

Validation should expose a result containing a document when renderable plus
diagnostics with path, code, severity and category. Retain `parseStory` as a
throw-on-error convenience. Warnings reach developer tooling without breaking
valid stories. Keep security validation in the first V5 slice, not a final audit.

## Delivery sequence

### 0. Freeze the core contract

Resolve the table above, amend V5 with complete property contracts and visual
examples, and record a capability/implementation matrix. Preserve Space, flows, positioning,
Card phases, Timeline Beats and interaction defaults explicitly.

Acceptance: complete minimal and cinematic V5 examples have one unambiguous
interpretation; every planned schema field has documented defaults and constraints.

### 1. Direct schema migration and a minimal V5 story

Update the existing schema, generated types, parser, normalized model and diagnostic
result. Remove historical version gates. Implement root identity, `src` and simple
Narrative/Image rendering through the existing engine. Migrate all committed story
packages, test inputs and documentation examples in the same increment, and add a
small original V5 reference package.

Acceptance: all migrated stories render; invalid language identifiers fail clearly;
parsing does not mutate input; existing visual and interaction behavior survives
through explicit declarations. Replace historical version-gating tests with current
contract checks. Test text/URL injection and package traversal. No legacy runtime,
parallel schemas or ongoing migration tooling is required.

### 2. Narrative semantics and internationalisation

Add Dialogue `speaker`, explicit decorative media, root/body/frame language and
direction inheritance, and the agreed rules for intervening hierarchy levels.
Use native `lang`/`dir`; keep speaker and speech in one reading sequence without
duplicating narrative content. Keep physical artwork anchors unchanged by RTL
unless the language explicitly defines logical anchors.

Acceptance: speaker announced once, decorative imagery suppressed, Unicode preserved,
mixed-direction speech readable, frame overrides work, keyboard focus remains stable.
Add Japanese and Arabic fixture variants using original narrative and artwork.

### 3. Typography and Panel presentation

Define the initial renderer font catalogue and bounded size/spacing tokens.
Implement property-by-property Body → Container → Panel → Frame inheritance,
using scoped CSS variables and a pure resolver where needed. Replace hard-coded
text sizes/colours that currently defeat author inheritance. Do not implement the
future `tone` examples as current requirements.

Add Panel padding, gap, radius, border, background, opacity and alignment according
to the agreed contract. Gap affects normal-flow children; overlay placement and
height calculations need explicit content-box/border-box definitions. Integrate
new clipping with existing per-Frame reading order and Card transition layers.

Acceptance: partial typography overrides retain other inherited values; fallback
fonts and delayed loads refresh geometry and Beats; enlarged text remains readable.
Test narrow portrait, landscape and desktop, Panel padding with Card FIT, clipping
with overflow captions, and stacking effects of Panel opacity.

### 4. Root Beats and simple media/Card completion

Resolve root Beat references into existing bindings and carry labels through the
resolved index. Use positioned Frame geometry, not its full-Panel slot. Preserve
Timeline Beat ranges, coincident destination behavior and reduced-motion fallback.
Complete simple static Card geometry handling and intrinsic-image readiness from
the approved phase-0 decisions; geometry-dependent animation must not start early.

Acceptance: unknown targets and duplicate IDs fail at source paths; root and embedded
Beats sort deterministically; controls and every input adapter use the same index.
Exercise reverse scrolling, FIT-driven height changes, delayed media, resize,
interruption and live reduced-motion changes. Static Cards need no fabricated art window.

### 5. Portable package loading

Extract reader resolution from `main.ts`; accept a configurable local/remote story
root, retain the package base URL supplied to the engine, and permit safe `cards/`
paths alongside `assets/`. `media/` can exist in packages without enabling audio/video.
Preserve cancellation, package identity checks, missing-story diagnostics and mount
cleanup. Define allowed protocols/origins and expected document/media content types.

Acceptance: the same package loads from two roots without JSON edits; a newly added
package is readable without rebuilding the renderer; traversal, encoded escape,
executable URLs and unexpected HTML responses fail; obsolete requests cannot mount.
Test remote CORS/error behavior using controlled test origins. No registry is required.

### 6. V5 conformance benchmark and documentation

Complete the small canonical V5 story with arrival/reveal/dialogue/card/departure
Beats. Keep the long comic and cinematic fixtures as separate stress tests.
Add a requirement-to-test matrix, deterministic portrait screenshots and targeted
desktop/RTL checks. Document the current language identifier and capability limits.

Acceptance: unit tests, schema generation, build and browser suites pass; semantic
accessibility checks pass; actual screen-reader testing confirms the story is
understandable without visuals. Record screen reader/browser versions and findings;
automated DOM snapshots cannot substitute for this human benchmark. Verify physical
mobile scrolling and motion preferences before claiming complete conformance.

## Deferred work

Generic motion, camera, audio, video, effects, semantic tone profiles, full-art
transition vocabulary, responsive overrides, YAML authoring and publishing CLI
remain separate designs. Content publishing can follow portable loading, with
validation and immutable-release handling, but is explicitly future tooling in V5.
Do not select hosting providers or implement accounts/editor infrastructure as a
prerequisite for the language migration.

## Recommended first implementation increment

Complete phase 0, then ship phase 1 plus speaker/language/decorative semantics from
phase 2 as the first useful vertical slice. An author should be able to open a
V5 package, read attributed dialogue and meaningful imagery, and receive
actionable diagnostics while every migrated fixture retains its intended behavior. Typography,
presentation and expanded Beat declarations can then land in bounded increments.
