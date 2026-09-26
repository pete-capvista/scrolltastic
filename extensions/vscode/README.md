# Scrolltastic Story Language for VS Code

This local extension edits ordinary V5 `story.json` files and previews their
rendered output beside the editor. A story package is a folder containing
`story.json`, `assets/` and `cards/`.

Run **Scrolltastic: New Story** to create a starter package. Add SVG, PNG, JPEG,
WebP or AVIF files to `assets/` or `cards/` with VS Code Explorer or your file
manager, then reference them from the JSON document. Open a story and run
**Scrolltastic: Open Preview to Side**. Unsaved edits update the preview while
continuous scrolling remains available. Invalid edits leave the last valid
render visible and mark the preview stale. Refresh and restart commands are
available from the Command Palette.

Run **Scrolltastic: Publish Story** to publish the open package. The command
validates the exact saved JSON, checks every referenced asset, reports excluded
unreferenced files, signs in through VS Code's GitHub authentication provider,
and uploads directly to a short-lived staging prefix in Vercel Blob. The server
verifies the manifest and story again before atomically committing the stable
story document. Concurrent changes produce an explicit overwrite confirmation.
The Blob credential is never sent to or stored by the extension.

Publishing defaults to `https://scrolltastic.vercel.app`. A different trusted
HTTPS origin can be set as `scrolltastic.publish.apiBaseUrl` in VS Code user
settings. Workspace values are ignored to prevent a story package from
redirecting GitHub credentials.

The preview runs the same parser, renderer, animation and Beat navigation code
as the web reader. Local package media and bundled extension resources are the
only resources exposed to its webview. The extension does not execute story
content. Creating package folders is disabled in Restricted Mode.

The extension provides edit, preview, and authenticated publish workflows. Story-specific
Problems diagnostics, schema IntelliSense and asset/Beat autocomplete are
planned for later iterations.

Build from the repository root with `npm run build:vscode`. To create a VSIX,
install `@vscode/vsce` and run `npm run package:vscode` from the repository
root. Marketplace publishing is intentionally separate.
