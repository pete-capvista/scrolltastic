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

- [Canonical specification](scrolltastic_design_spec_v4.md), including contracts 0.1–0.6
- [First renderer slice](docs/first-renderer-slice.md)
- [JSON Schema](src/schema/story.schema.json)
- [Contributor instructions](AGENTS.md)

Supported: Body, Container, Panel, Space, Background, Image, Narrative,
Dialogue, three Frame flow modes, positioning, four Panel height modes,
reversible Narrative/Dialogue reveals (0.2), shaped Mask Frames with
pull-focus transitions (0.3), static standard Card Frames (0.4), and
standard-card OUT + CROP transitions (0.5), and pinned OUT + FIT transitions
(0.6). New Card transitions pin the story prefix by default; set
`"scrollMode": "flow"` to keep ordinary document scrolling. IN/BOTH
transitions, full-art Cards, bleed, other animation types, Beats and publishing
are not implemented;
unsupported declarations fail validation rather than being ignored.
