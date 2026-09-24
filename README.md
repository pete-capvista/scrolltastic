# Scrolltastic

A JSON-driven, mobile-first story renderer. The first slice renders static
stories from separate packages, using native scrolling and an embeddable
TypeScript engine. No account or storage service is required locally.

## Run

Requires Node 22.12+ (Node 24 recommended).

```sh
npm ci
npm run dev
```

Open any fixture directly:

- [The light beyond the ridge](http://localhost:5173/s/550e8400-e29b-41d4-a716-446655440000)
- [Where the tide turns](http://localhost:5173/s/b670153e-79da-4bb4-9d69-1b8efb433287)
- [Guardians of the First Light](http://localhost:5173/s/c6c6bfa1-145e-4d68-a2fd-cc94107b46ea)

The homepage deliberately does not list stories. Fixtures and their original
SVG artwork are under `public/stories/<story-id>/`. Both packages use an
`assets/scene.svg` file to demonstrate independent asset resolution.

## Verify

```sh
npm test
npm run build
npx playwright install chromium
npm run test:e2e
```

On a fresh Linux machine, use `npx playwright install --with-deps chromium`
to install the browser's required system libraries as well.

Browser tests cover mobile and desktop Chromium. They check direct links,
refresh, package isolation, heights, overflow, reading order, resizing,
reduced motion, failed images, stale requests and renderer cleanup.

`npm run generate` regenerates TypeScript from the JSON Schema. The build
checks that the committed generated types match the schema.

## Embed

```ts
import { mountStory } from './src/renderer/mount';

const handle = mountStory(root, storyDocument, {
  assetBaseUrl: 'https://example.com/stories/<id>/releases/<release>/',
});
await handle.ready;
// Later, when the host removes or changes the story:
handle.destroy();
```

The renderer imports its scoped styles, validates before replacing content,
reserves image dimensions, and preserves authored semantic order. `ready`
means initial layout is measurable; it does not wait for every lazy image.
An optional `onLayout` callback and `story:layout` event signal later changes.

## Hosting

`npm run build` produces `dist/`. `vercel.json` supplies the reader deep-link
rewrite and no-index headers. Deployment has not been performed. Production
creator uploads must use durable storage, not the deployed `public/` folder.
The production publication resolver, accounts, editor, database and storage
provider remain future work. Fixture UUIDs are public test data.

## Design

- [Canonical specification](scrolltastic_design_spec_v4.md), including contracts 0.1–0.14
- [First renderer slice](docs/first-renderer-slice.md)
- [JSON Schema](src/schema/story.schema.json)
- [Contributor instructions](AGENTS.md)

Supported: Body, Container, Panel, Space, Background, Image, Narrative,
Dialogue, three Frame flow modes, positioning, four Panel height modes,
reversible Narrative/Dialogue reveals (0.2), shaped Mask Frames with
pull-focus transitions (0.3), static standard Card Frames (0.4), and
standard-card OUT + CROP (0.5), OUT + FIT (0.6), IN + FIT (0.7), BOTH + FIT (0.8), Element/Timeline Beat resolution (0.9), opt-in Advance/Reverse controls (0.10), scoped keyboard input (0.11), touch Flip (0.12), settled-scroll snapping (0.13), and tap-to-Advance (0.14).
Contract 0.6+ transitions pin the story prefix by default; set
`"scrollMode": "flow"` to opt out. One pinned Card transition is supported
per story; additional transitions must use flow mode. IN + CROP, BOTH + CROP, full-art Cards, bleed,
other animation types, custom keyboard shortcuts and publishing are not implemented;
unsupported declarations fail validation rather than being ignored.

The Guardians fixture opens with BOTH + FIT: artwork → Card → hold → artwork.
Its three authored ranges are required, ordered and non-overlapping.


Contract 0.9 adds `beat` to Panels/Frames and `beats` to Card/Mask
transitions. `handle.beats` exposes the ordered, reachable document scroll
coordinates after `handle.ready`. Use `onBeatsChange` or the bubbling
`story:beats` event for later updates. Timeline Beats initially use their
Frame's center in a static embed; attaching story animations resolves their
progress against the actual timeline. Reduced motion restores that fallback
while preserving IDs. See specification section 70 for the complete contract.

```ts
const handle = mountStory(root, storyDocument, {
  assetBaseUrl: 'https://example.com/stories/<id>/releases/<release>/',
  onBeatsChange: beats => console.log(beats.map(({ id, scrollY }) => ({ id, scrollY }))),
});
await handle.ready;
console.log(handle.beats);
```

Beat resolution itself does not move the viewport or focus. Contract 0.10
adds optional navigation: declare `body.interaction.advance` as
`{ "enabled": true, "mode": "beats" }`. The reader then shows Previous/Next
controls and moves the actual document scroll position between distinct
Beat destinations. Native scrolling interrupts assistance; reduced motion
moves immediately. Both the ridge and Guardians fixtures enable controls.
Contract 0.11 adds optional `inputs: ["controls", "keyboard"]` inside `advance`.
Tab to the reader or its controls, then use Arrow Down/Up to Advance/Reverse.
Escape cancels; editing fields, widgets, and modified shortcuts keep native behavior.
Omitting `inputs` keeps controls-only navigation. Contract 0.12 also accepts
`"flip"` as a separate touch recognizer.

The ridge fixture now uses contract 0.14 with `inputs: ["controls", "keyboard", "tap"]`
and `interaction.scroll.snap: "none"`. Scroll freely; tap noninteractive story
content to Advance to the next Beat. A mouse click works too. Dragging, long
presses, and touches used to stop movement do not advance. Previous/Next and
keyboard navigation remain available. Snap and Flip remain separate opt-in
capabilities, disabled on the ridge.
