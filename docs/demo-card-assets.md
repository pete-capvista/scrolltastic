# Trading-card demo assets

The third demo package is reserved at:

`public/stories/c6c6bfa1-145e-4d68-a2fd-cc94107b46ea/`

The three card-front images live in `assets/`; `story.json` references them
as standard Card Frames. Lunora uses OUT + FIT: the renderer holds the story
prefix through Lunora in place, preserves the full artwork, and expands the
normalized artwork window to the Panel width. The following story content
scrolls up underneath to meet it. Dravion demonstrates IN + FIT: it begins as
full-width artwork and resolves into its card as the reader scrolls. Lunora
uses the default pin mode; Dravion opts into `"scrollMode": "flow"` because
this renderer supports one pinned Card transition per story. Volgarr remains
static.
