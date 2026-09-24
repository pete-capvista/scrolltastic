# Trading-card demo assets

The third demo package is reserved at:

`public/stories/c6c6bfa1-145e-4d68-a2fd-cc94107b46ea/`

The three card-front images now live in `assets/`; `story.json` references
them as static standard Card Frames. The renderer preserves each full front,
uses the supplied image dimensions to reserve layout, and stores a normalized
artwork-window rectangle for future card-to-art transitions.
