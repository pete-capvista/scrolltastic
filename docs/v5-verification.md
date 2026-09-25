# V5 verification

The renderer and all six story packages now use the single V5 contract in
[specification section 47](../scrolltastic_story_language_v5.md#47-executable-v5-contract).
The existing cinematic and comic fixtures remain regression fixtures. Original
English, Japanese and Arabic lantern stories add small conformance fixtures.

## Requirement coverage

| Requirement | Evidence |
| --- | --- |
| One V5 schema, root identity, safe parsing, generated types | `tests/parser.test.ts`, `tests/v5.test.ts`, build generated-type check |
| Invalid combinations, IDs, paths and root Beat targets | Parser/Beat/V5 unit suites |
| Body/Container/Panel/Space and three flow modes | `tests/e2e/reader.spec.ts`, V5 spacing/overflow test |
| Card and Mask timelines, changing Panel heights, reverse scrolling | `tests/e2e/card-both.spec.ts`, `reader.spec.ts`, `beats.spec.ts` |
| Panel padding/border with FIT and reduced motion | `tests/e2e/v5.spec.ts` |
| Typography inheritance, partial overrides, locale and Unicode | V5 unit/browser suites; English/Japanese/Arabic fixtures |
| Speaker + speech, meaningful alt, decorative suppression | V5 accessibility snapshots and browser assertions |
| Root/embedded Beat ordering, labels, positioning and recalculation | V5 and Beat browser suites |
| Keyboard, controls, Flip, tap, snap and manual interruption | Existing navigation/Flip/tap/snap browser suites |
| Runtime story root, portable assets, remote origin, bad responses | V5 resolver unit/browser suites |
| Intrinsic static Cards, failed media and reserved geometry | V5 and reader browser suites |
| Visual composition, English and RTL | Four reviewed Chromium screenshot baselines in `tests/e2e/v5.spec.ts-snapshots/` |
| Mount/route teardown, obsolete loads, observer cleanup | Reader/Beat/navigation browser suites |

Automated checks run in Linux Chromium, with Pixel 7 emulation and a 1280×800
desktop viewport. The first baseline run passed 128 existing browser cases.
The V5 suite adds 22 browser cases. Screenshot baselines were visually inspected.
All 53 unit tests, generated-type consistency, TypeScript and the production
build passed. The updated V5 screenshot comparisons and affected Card/reader
regressions are also rerun after visual fixes.

The browser inspection confirmed actual story loading, text, imagery, controls
and a meaningful accessibility tree with no page errors. A visual inspection also
caught a FIT-stage clipping regression that geometry-only assertions would miss;
FIT keeps its independently anchored artwork viewport.

## Renderer presentation profile

The initial font catalogue uses system stacks, so exact letterforms depend on the
reader's installed fonts. `story-sans` and `story-serif` use native sans/serif;
`comic`, `handwritten`, `dramatic` and `technical` use suitable installed families
with generic fallbacks. No font download or author-provided font URL is needed.
Browser-native fallback provides characters absent from a selected face.

Spacing/radius tokens none/small/medium/large map to 0/.5/1/2 rem. Borders
thin/medium/thick map to 1/2/4 CSS pixels. Text line heights compact/normal/relaxed
map to 1.25/1.5/1.8. Small text starts at 1 rem; larger tokens use bounded responsive
sizes. These are renderer profile choices, not a general CSS escape hatch.

Static images without an explicit ratio begin with a square reserve, then use the
browser-reported intrinsic ratio. Vector images without intrinsic pixel dimensions
can have small rounding differences. Author a ratio when deterministic geometry
matters. Geometry-dependent Card transitions always require explicit metadata.

## Manual conformance checks still required

Automated accessibility-tree checks are not real screen-reader testing. Complete
and record the following before claiming full V5 conformance:

1. Use a real screen reader with the English fixture, with visuals unavailable.
   Confirm title, arrival, image description, attributed speech, Card description
   and departure form one understandable narrative. The decorative final image
   and cloned transition artwork must not be announced.
2. Repeat with a Japanese and Arabic-capable speech voice. Confirm language changes,
   mixed-script speaker names, RTL punctuation and reading order. Record the screen
   reader, browser, OS and voice versions and any issues.
3. Use Tab/Enter/Space and scoped arrows to operate controls; leave the reader using
   ordinary keyboard navigation. Confirm scroll movement never moves DOM focus.
4. Toggle reduced motion while reading the cinematic fixture. Meaningful content and
   Beat destinations must remain available without animation.
5. On physical iOS Safari and Android Chrome, check natural scrolling, gestures,
   interruption, momentum, address-bar resizing, orientation and enlarged text.

These checks were not performed in this container. Production hosting, uploaded
asset sanitisation and publishing remain outside this implementation. Remote-root
verification used controlled browser responses, not a deployed storage service.
