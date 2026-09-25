# Scrolltastic — Narrative, Dialogue & Sound Effect Frame Specification

**Status:** Approved V5 extension 0.2
**Purpose:** Define the visual language for narrative text, character dialogue/thoughts, chained speech, and sound effects in Scrolltastic stories.

---

## 1. Element Classes

Scrolltastic should treat these as three distinct visual classes:

1. **Narrative Frame** — narrator/exposition text.
2. **Dialogue Bubble** — words or thoughts associated with a character.
3. **Sound Effect Frame** — non-dialogue visualised sounds such as *CRASH*, *WHOOSH*, *CLICK*, or *RUMBLE*.

Keeping sound effects separate allows them to behave more like artwork than dialogue.

---

# 2. Narrative Frame

Narrative frames contain story text that is not spoken by a character.

## 2.1 Frame Shape

The frame supports a selectable `shape` property.

### Rectangle

```text
┌───────────────────────────────┐
│ The lake had fallen silent.   │
└───────────────────────────────┘
```

**Visual treatment:** clean rectangular panel; suitable for conventional narration.

**Example typography:**

<span style="font-family: Georgia, serif; font-size: 20px;">The lake had fallen silent.</span>

---

### Parallelogram / Skewed Frame

```text
   ╱────────────────────────────╱
  ╱ The lake had fallen silent.╱
 ╱────────────────────────────╱
```

**Visual treatment:** slightly skewed panel suggesting movement, urgency, transition, or a more graphic-novel presentation.

**Example typography:**

<span style="font-family: Arial, sans-serif; font-size: 20px; font-style: italic; font-weight: 600;">The lake had fallen silent.</span>

---

### Torn Ribbon

```text
  ╱\/────────────────────────\/╲
 <   THE LAKE HAD FALLEN SILENT  >
  ╲/────────────────────────\/╱
```

**Visual treatment:** irregular/torn ends, potentially with a paper or fabric texture. Useful for chapter beats, historical text, warnings, or dramatic narration.

**Example typography:**

<span style="font-family: Georgia, serif; font-size: 20px; font-weight: 700; letter-spacing: 1px;">THE LAKE HAD FALLEN SILENT</span>

Future frame shapes can be added without creating new narrative element types.

---

# 3. Dialogue Bubble

A dialogue bubble belongs to a character/speaker and should be positionable independently from that character.

## 3.1 Spoken Dialogue

Default spoken dialogue uses an oval or rounded bubble with a **tail** pointing toward the speaker.

```text
       ╭────────────────────╮
      (  We need to leave.   )
       ╰─────────┬──────────╯
                 ╲
                  ▶ CHARACTER
```

**Example typography:**

<span style="font-family: Arial, sans-serif; font-size: 20px;">We need to leave.</span>

### Tail

The tail should be independently configurable rather than baked into the bubble artwork.

Suggested properties:

```yaml
tail:
  enabled: true
  direction: bottom-right
  style: triangle
```

The renderer should eventually support automatic tail orientation based on the character's screen position, while allowing manual override.

---

# 4. Thought Bubble

Thought is a **style of dialogue**, not a separate narrative class.

Instead of a pointed speech tail, use a cloud-like bubble and a sequence of smaller circles leading toward the character.

```text
        .-~~~~~~~~~~~~~-.
      .'  Where is he?   '.
     (                     )
      '._               _.'
         '~~~~~~~~~~~~~'
               ○
             ○
           ·       CHARACTER
```

**Example typography:**

<span style="font-family: Georgia, serif; font-size: 20px; font-style: italic;">Where is he?</span>

Suggested property:

```yaml
dialogueStyle: thought
```

Initial dialogue styles:

```yaml
spoken
thought
```

This should remain extensible for later styles such as whisper, shout, electronic/radio, dream, etc.

---

# 5. Chained Speech Bubbles

A character may speak multiple distinct sentences using multiple connected bubbles rather than one large bubble.

Example:

```text
       ╭────────────────────╮
      (  I've seen this      )
      (  place before.       )
       ╰─────────┬──────────╯
                 │
                 │ connector / bridge
                 │
       ╭─────────┴──────────╮
      (  But something is    )
      (  different now.      )
       ╰─────────┬──────────╯
                 ╲
                  ▶ CHARACTER
```

Rendered conceptually as:

<span style="font-family: Arial, sans-serif; font-size: 20px;">I've seen this place before.</span><br>
&nbsp;&nbsp;&nbsp;&nbsp;↓<br>
<span style="font-family: Arial, sans-serif; font-size: 20px;">But something is different now.</span>

The important semantic distinction is that these remain **two separate dialogue statements**.

They should therefore remain separate objects in the story data and be linked into a chain.

Example:

```yaml
- id: dialogue-01
  type: dialogue
  speaker: cyrus
  text: "I've seen this place before."
  chain:
    next: dialogue-02
    connector: bridge

- id: dialogue-02
  type: dialogue
  speaker: cyrus
  text: "But something is different now."
  tail:
    direction: bottom-right
```

Only the final bubble normally needs the character-pointing tail. Intermediate bubbles use a visual connector/bridge.

Possible connector styles should eventually include:

- narrow bridge
- line
- small bubble chain
- no visible connector

---

# 6. Sound Effect Frame

Sound effects should be a **separate frame class**, rather than a dialogue-bubble style.

Examples include:

- CRASH!
- WHOOSH!
- BOOM!
- CLICK
- RUMBLE…
- BZZZT!

## 6.1 Burst

```text
           /\   /\
      ____/  \_/  \____
     <      CRASH!      >
      ‾‾‾\  / \  /‾‾‾
          \/   \/
```

**Example typography:**

<span style="font-family: Impact, Haettenschweiler, 'Arial Narrow Bold', sans-serif; font-size: 36px; font-weight: 900; letter-spacing: 2px;">CRASH!</span>

---

## 6.2 Motion / Whoosh

```text
        ─────── WHOOSH! >>>
```

**Example typography:**

<span style="font-family: 'Arial Narrow', Arial, sans-serif; font-size: 32px; font-weight: 800; font-style: italic; letter-spacing: 3px;">WHOOSH!</span>

The text itself may rotate, stretch, skew, scale, shake, fade, or travel independently of a conventional box.

Suggested structure:

```yaml
type: sound-effect
text: "CRASH!"
style: burst
font:
  family: Impact
  weight: 900
transform:
  rotation: -8
  scale: 1.2
```

Initial sound-effect styles could include `burst`, `impact`, `motion`, `rumble`, `electronic`, and `ambient`.

---

# 7. Typography

Typography is part of the storytelling language and should be configurable independently of frame shape.

Suggested properties:

```yaml
font:
  family: "Arial"
  size: 20
  weight: 400
  style: normal
  letterSpacing: 0
  textTransform: none
```

A style preset can define defaults, but individual frames should be able to override them.

Suggested starting presets:

| Purpose | Suggested visual treatment |
|---|---|
| Normal speech | clean sans serif, regular weight |
| Thought | serif or softer face, italic |
| Narration | readable serif or cinematic sans serif |
| Dramatic narration | heavier weight / wider tracking |
| Impact sound | condensed heavy display face |
| Movement sound | condensed italic / skewed face |
| Quiet ambient sound | light weight, spaced lettering |

The implementation should use web-safe/system fonts initially, with support for supplied web fonts later.

---

# 8. Proposed Story-Language Model

At the Story Language level, keep the semantic model small:

```yaml
frame:
  type: narrative | dialogue | sound-effect
```

Then style each class with properties rather than creating a new semantic element for every appearance.

Example dialogue:

```yaml
- type: dialogue
  id: d1
  speaker: cyrus
  dialogueStyle: spoken
  text: "The Red Chain is ready."
  bubble:
    shape: oval
  tail:
    direction: bottom-right
```

Example thought:

```yaml
- type: dialogue
  id: d2
  speaker: cyrus
  dialogueStyle: thought
  text: "They still don't understand."
```

Example narrative:

```yaml
- type: narrative
  text: "High above Sinnoh, the air began to distort."
  shape: torn-ribbon
```

Example sound effect:

```yaml
- type: sound-effect
  text: "KRRRRAK!"
  style: impact
```

---

# 9. Design Principle

The key distinction is **semantic role first, visual style second**.

A rectangle, parallelogram, or torn ribbon does not change the fact that something is narration. An oval or cloud does not change the fact that it is character dialogue. And a sound effect is sufficiently different in behaviour and purpose that it deserves its own element class.

This gives Scrolltastic a compact vocabulary while still allowing a very broad visual language.

---

# 10. Executable V5 Profile

The canonical executable details live in section 47 of
`scrolltastic_story_language_v5.md` and take precedence over exploratory examples
above. The approved initial profile uses:

- Narrative `shape`: `rectangle`, `parallelogram`, or `torn-ribbon`;
- Dialogue `dialogueStyle`: `spoken` or `thought`;
- Dialogue `bubble.shape`: `oval` or `cloud`; the former `fat-circle` value is
  unsupported;
- manual eight-way tails using `triangle` or `circle-chain`; automatic
  `tail.target` is deferred until targetable character geometry exists;
- adjacent, same-Panel Dialogue chains using `chain.next` and `chain.connector`;
- the `sound-effect` Frame discriminator and renderer-owned static style presets.

The initial implementation retains the controlled V5 typography catalogue.
Arbitrary font families, supplied web fonts, arbitrary transforms, textures,
automatic tail targeting, and generic sound-effect motion remain deferred.
