# Scrolltastic

A JSON-driven, mobile-first story renderer using TypeScript, GSAP and native
scrolling. Stories are independent packages; the renderer implements the
[Scrolltastic Story Language V5](scrolltastic_story_language_v5.md).
Section 47 defines the executable contract.

## Run

Requires Node 22.12+ (Node 24 recommended).

```sh
npm ci
npm run dev
```

Open a reference story:

- [The lantern crossing — V5 English](http://localhost:5173/s/11111111-1111-4111-8111-111111111111)
- [灯りの向こう — V5 Japanese](http://localhost:5173/s/22222222-2222-4222-8222-222222222222)
- [ضوء عبر الماء — V5 Arabic](http://localhost:5173/s/33333333-3333-4333-8333-333333333333)
- [The light beyond the ridge — long comic](http://localhost:5173/s/550e8400-e29b-41d4-a716-446655440000)
- [Where the tide turns](http://localhost:5173/s/b670153e-79da-4bb4-9d69-1b8efb433287)
- [Guardians of the First Light — cinematic Cards](http://localhost:5173/s/c6c6bfa1-145e-4d68-a2fd-cc94107b46ea)

The homepage does not list stories. Packages live under `public/stories/<id>/`.
All existing packages have migrated to V5; historical 0.x documents are unsupported.
There is one schema and no version-dispatch or compatibility layer.

## Author

### VS Code

An initial VS Code extension supports a live preview of V5 `story.json` files.
Run `npm run build:vscode`, then press F5 and choose **Scrolltastic: New Story**
or open an existing story and run **Scrolltastic: Open Preview to Side**. Add
artwork to the package's `assets/` or `cards/` folder with Explorer and reference
it in the JSON. [Extension instructions](extensions/vscode/README.md) ·
[design and implementation status](docs/vscode-extension-design.md).

Story-specific Problems diagnostics, JSON schema associations and autocomplete
are planned for later iterations; the initial extension keeps native JSON editing.

```json
{
  "storyLanguage": "5",
  "id": "11111111-1111-4111-8111-111111111111",
  "title": "A small story",
  "language": "en",
  "body": {
    "typography": { "font": "story-sans", "size": "medium" },
    "containers": [{
      "type": "container",
      "id": "chapter",
      "flow": [{
        "type": "panel",
        "id": "arrival",
        "height": "content",
        "padding": "medium",
        "frames": [{ "type": "dialogue", "speaker": "Mira", "text": "We made it." }]
      }]
    }]
  },
  "beats": [{ "id": "arrival-beat", "target": "arrival", "label": "Arrival" }]
}
```

Use `src` for package-relative media, `alt` for meaningful images and
`decorative: true` for decoration. Static Images/Cards can derive intrinsic size;
provide `aspectRatio` to reserve precise geometry before loading. Card extraction
requires an explicit ratio and normalized artwork window.

Typography and language/direction inherit through the composition hierarchy.
Root Beats can target Panel or Frame IDs; embedded Element and Timeline Beats
remain available. To enable controls, use
`body.interaction.advance: { "enabled": true, "mode": "beats", "inputs": ["controls", "keyboard"] }`.
Flip, tap and settled-scroll snapping are separate opt-in input policies.
Continuous scrolling and reduced-motion behavior remain available.

## Embed and validate

```ts
import { mountStory } from './src/renderer/mount';
import { validateStory } from './src/parser/parse';

const result = validateStory(storyDocument);
// result.document exists if renderable; diagnostics include errors and warnings.
const handle = mountStory(root, storyDocument, {
  assetBaseUrl: 'https://example.com/stories/<id>/',
  onDiagnostics: diagnostics => console.log(diagnostics),
  onBeatsChange: beats => console.log(beats),
});
await handle.ready;
// Later, when removing the embed:
handle.destroy();
```

`parseStory` throws only on errors. Validation warnings carry an authored path,
code, severity and category. Missing meaningful alt text does not silently become
decoration. Text is inserted as text, never interpreted as HTML.

`ready` means initial layout is measurable, not that every lazy image has loaded.
Later image/font/layout changes refresh geometry and Beat destinations. Static
embeds expose Timeline Beats at Frame-center fallback coordinates. Hosts attach
`attachStoryAnimations` separately after readiness and destroy that animation
handle before destroying the mount; the supplied reader does this automatically.

## Story roots and hosting

Edit the host-owned `public/reader-config.json`:

```json
{ "storyRoot": "https://content.example.com/stories/" }
```

The default is `/stories/`. The reader fetches configuration at runtime, then
loads `<storyRoot>/<id>/story.json`. Configuration and story packages can be
served separately from the application build. A new package under the configured
root needs no renderer rebuild or registry entry. The configured root must end
with `/`; remote JSON needs CORS access and an `application/json` content type.
Document redirects are rejected. Media paths stay under package `assets/` or
`cards/`, with no executable URLs or path traversal.

`npm run build` produces `dist/`; `vercel.json` supplies `/s/<id>` deep-link
rewrites and no-index headers. Static fixture packages ship with the build;
production creator uploads belong in independent durable storage. No provider,
accounts, editor or publishing backend is introduced by V5. Hosting must serve
runtime configuration/content independently if updates should survive code deployments.

## Verify

```sh
npm test
npm run build
npx playwright install chromium
npm run test:e2e
```

`npm run generate` derives TypeScript from the single JSON Schema. The build
checks generated-type consistency. Browser tests cover mobile-emulated and desktop
Chromium, including the package-to-reader flow, international text, typography,
root Beats, Card FIT, resizing, interruption and reduced motion.

See [V5 verification](docs/v5-verification.md) for the conformance matrix and
manual screen-reader/physical-device checks that remain necessary.

## Scope

Supported: Body/Container/Panel/Space, Background/Image/Narrative/Dialogue/Mask/Card,
three Frame flow modes, positioning, semantic height shorthand, Panel presentation,
curated typography, locale inheritance, speaker attribution, explicit decoration,
root/embedded Beats, bounded reveals, Mask pull-focus, OUT+CROP and OUT/IN/BOTH+FIT,
and controls/keyboard/Flip/tap/snapping.

One pinned Card transition per story is supported; other transitions use
`scrollMode: "flow"`. Full-art Cards, bleed, Character/Effects/Title Frames,
separate artwork sources, generic motion, audio/video, semantic tone presets,
responsive overrides and publishing tools remain deferred. Unsupported declarations
fail validation. The system font catalogue uses available OS fonts and fallbacks;
it does not download or bundle fonts.

- [Schema](src/schema/story.schema.json)
- [Implementation plan](docs/v5-implementation-plan.md)
- [Contributor instructions](AGENTS.md)
- [Historical V4 contracts](scrolltastic_design_spec_v4.md)
