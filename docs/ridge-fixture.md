# The light beyond the ridge — extended test fixture

> Historical implementation notes. All current packages use Story Language V5;
> see [the executable contract](../scrolltastic_story_language_v5.md#47-executable-v5-contract)
> and [current README](../README.md) for authoring and verification.


Open `/s/550e8400-e29b-41d4-a716-446655440000`.
The contract 0.14 story has 11 Panels and 17 Beats. All illustration assets
are purpose-built SVGs in the story package; `chamber.svg` and `dawn.svg`
extend the original geometric style.

| Composition | Beat IDs | What it exercises |
| --- | --- | --- |
| Arrival | `ridge-arrival` | Panel start alignment, natural-height Image |
| Observatory | `doorway-question` | Overflow Dialogue, center alignment, negative svh offset |
| Signal | `signal-opening`, `signal-takeover` | Polygon Mask timeline at .18 and .78 |
| Passage | `passage-threshold`, `step-inside` | Seamless adjacent Images, Panel and overlay Frame Beats |
| Star chamber | `chamber-arrival`, `missing-star` | Tall natural-height Image, overflow Narrative into Space |
| Answering voice | `the-answer` | Centered Dialogue in a fixed-height Panel |
| Morning window | `morning-glimpse`, `morning-opening`, `morning-takeover` | Ellipse Mask timeline at .15, .48 and .8 |
| Homeward path | `homeward-view`, `valley-lights` | Centered Panel and overlay Narrative with negative offset |
| Keeper's promise | `promise-question-moment`, `keepers-answer` | Normal-flow Dialogue/Narrative, center and end alignment |
| Ending | `ridge-ending` | End alignment and document-end clamping |

Use the renderer's `handle.beats`, `onBeatsChange` or `story:beats` event to
inspect resolved destinations. Timeline Beats retain their IDs and fall
back to the owning Frame's center with reduced motion. Previous/Next controls now invoke Advance/Reverse. You can also Tab to the
buttons and use Enter or Space; wheel/touch scrolling remains available and
interrupts assisted movement. Coincident destinations require just one move.
The control bar stays clear of Element Beat destinations, including the ending.

Keyboard testing: Tab to the story or its Previous/Next controls, then use
Arrow Down/Up to Advance/Reverse. Escape interrupts a move. Focus stays in
place, and ordinary scrolling remains available.

The ridge now uses free scrolling and tap-to-Advance. Tap or click
noninteractive story content to move to the next Beat. Dragging and momentum
remain native; there is no automatic snap after scrolling. Long presses and
contacts used to interrupt motion do not advance. Controls and keyboard remain
available. Authored inputs are `controls`, `keyboard`, and `tap`, with
`interaction.scroll.snap: "none"`.
