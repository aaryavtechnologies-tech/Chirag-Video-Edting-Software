# Prompt 2 - Text Animations, Caption Templates, Caption Import, Pro UI, Dual Layouts

Paste everything below the line into Codex AFTER milestones M1-M6 of the first prompt exist (or tell Codex to merge this into M6 and M9). Keep `AGENTS.md` and the spec in the project folder. Also copy `07_captions_animations.schema.json` next to the other schema file.

---

Continue the video editor project. Read `AGENTS.md`, `01_VIDEO_EDITOR_SPEC.pdf`, and `07_captions_animations.schema.json`. This task **extends and replaces** spec sections 5.3 (editor layout) and 5.4 (text panel). Everything in the original spec that is not mentioned here stays as is. Work in the phases listed at the end, running lint, typecheck and tests after each phase.

## A. Animation Engine (shared by preview AND export)

Build one pure-TypeScript module `src/animation/` that, given `(clip, localTime, canvasSize)`, returns a render state: `{ opacity, translateX, translateY, scaleX, scaleY, rotation, blur, letterSpacingDelta, clipReveal, perUnitStates[] }`. Preview and export must both call it, so they look identical.

Requirements:
1. Three animation slots per text or caption clip: **In**, **Out**, **Loop** (loop runs while the clip is visible, between In and Out). Each has: preset id, duration (0.1-3 s), easing, delay, and preset-specific options (direction, intensity).
2. **Easings**: linear, easeIn/Out/InOut (quad, cubic, quart, expo), easeOutBack (overshoot), easeOutElastic, easeOutBounce, and custom cubic-bezier.
3. **Granularity** option for In/Out: whole text, by line, by word, by character. Stagger delay between units (0-0.3 s) and stagger order (forward, backward, centre-out, random with seed).
4. **In presets (minimum 24)**: Fade, Slide Up/Down/Left/Right, Zoom In, Zoom Out, Pop (overshoot scale), Bounce, Elastic, Typewriter, Reveal Wipe (L/R/U/D), Mask Open, Blur In, Rise + Fade, Drop, Flip X, Flip Y, Rotate In, Spin Pop, Glitch, Shake In, Letter Spread (tracking tightens), Karaoke Highlight Sweep, Neon Flicker On, Swing, Scale from Line.
5. **Out presets (minimum 16)**: Fade, Slide (4 directions), Zoom Out, Zoom In, Blur Out, Wipe, Drop Away, Flip, Rotate Out, Shrink to Point, Glitch Out, Typewriter Erase, Dissolve by Letter, Neon Flicker Off.
6. **Loop presets (minimum 10)**: Pulse, Float (vertical sine), Wiggle, Shake, Swing, Breathe (scale), Glow Pulse, Color Cycle (hue shift), Flicker, Rainbow Sweep.
7. **Caption-specific word effects** (use per-word timing): active-word highlight (colour change), active-word scale pop, active-word background pill that slides between words, karaoke fill (left to right), underline sweep, word-by-word appear (previous words stay), one-word-at-a-time (TikTok style), bounce on active word.
8. Animations must be deterministic from time only (scrubbing backward and forward gives the same frame). No random without a stored seed.
9. Respect clip duration: if In + Out longer than the clip, scale them down proportionally.
10. **Export parity**: for animated text, render pre-composited **PNG frame sequences** (or a single sprite pass when the text is static) from the same animation module, at export resolution and fps, and overlay them in FFmpeg. Static (non-animated) segments reuse one PNG. Provide a golden test that compares a preview frame and an export frame at 3 timestamps (tolerance small, SSIM above 0.98).
11. Performance: cache glyph layouts and per-style rasters; animation of a 60-char caption must stay at 60 fps in preview.

## B. Text Styling Upgrades

Extend `textStyle` (see schema) and the rasteriser:
- Multiple **fills layers** (up to 3), **strokes** (up to 3, outside/centre/inside), **shadows** (up to 4), **glow**, **3D-extrude/long shadow** (angle + depth), **outline-offset**, **gradient** (linear and radial, up to 4 stops), **texture/image fill** (optional), **text-on-curve** (arc, amount slider), **letter/word/line spacing**, **text box with fixed width + auto-wrap**, **vertical align**, **per-word style override** (for highlight colours), **emoji support**, **RTL and Devanagari/Hindi shaping** (must render Hindi, Gujarati, Marathi, Arabic correctly; bundle Noto Sans families for these).
- Bundle at least 40 free fonts across categories (Sans, Serif, Display, Handwriting, Mono, Bold Impact, Hindi/Devanagari). Font picker: search, category tabs, favourites, recently used, live preview of the typed text in each row.
- **Style presets library** (min 30 built-in): Classic White, Black Bar, Yellow Subtitle, Neon Glow, Outline Pop, Gradient Sunset, Retro 3D, Comic, Minimal Thin, News Lower-third, Cinematic Serif, Gaming, Handwritten, Glass pill, etc. User can save, rename, delete, export/import presets as `.vstyle` JSON files.

## C. Captions System (CapCut-style)

### C1. Data model
Caption clips are a separate clip type `caption` living on **caption tracks** (new track kind `caption`, shown between video and audio tracks). Each caption track holds many caption segments: `{ id, start, duration, text, words[{text,start,end}], speaker?, overrides? }`. All segments in one track share a **caption template** reference (style + animation) unless a segment has `overrides`.

### C2. Caption templates
- A **template** = text style + In/Out/Loop animation + word-effect + position (anchor + safe-margin) + max-lines + max-chars-per-line + uppercase option + background options. Schema in `07_captions_animations.schema.json`.
- Ship **at least 30 built-in templates** in categories: Basic, Viral/TikTok, Karaoke, Cinematic, Minimal, Bold, Gaming, Podcast, News, Hindi/Regional, Aesthetic. Each has a thumbnail generated by rendering the real template on sample text (live preview loop on hover).
- **Apply to all**: selecting a template while a caption track (or any caption segment) is selected shows two buttons: **Apply to all captions in track** (default) and **Apply to selected only**. Applying to all replaces the track template; per-segment `overrides` are kept unless the user ticks "Reset individual edits".
- **Edit one caption**: clicking a caption segment (in timeline or on canvas) selects only that one; the inspector then edits that segment's text, timing, style, animation. Changes are stored as `overrides` on that segment only. Show a small "Edited" dot and a "Reset to template" button.
- **Edit all**: with the track selected (click the track header or caption group), inspector edits the template, so every segment updates live.
- Multi-select segments with Shift/Ctrl for batch styling.
- **Create template from current style**: "Save as template" with name and category.

### C3. Caption editing tools
- **Captions panel** (left tab) with 3 sub-tabs: **Templates**, **Transcript** (list view of all segments, editable text, start/end fields, click to jump, merge/split buttons, find and replace), **Import/Export**.
- Add caption manually (+ at playhead), split at playhead, merge with next, nudge timing (arrow keys), drag edges to retime, ripple option.
- **Auto-fit**: max chars/line and max lines produce automatic line breaks; "Re-flow captions" button; word-timing aware.
- Speaker labels optional.
- **Bulk operations**: shift all by X seconds, change all case (UPPER/lower/Title), remove punctuation, replace text.
- Auto captions (speech-to-text) are **out of scope** for this task, but leave a clearly marked interface `ICaptionProvider` so a local Whisper provider can be plugged in later.

### C4. Import and export captions
- **Import**: `.srt`, `.vtt`, `.ass/.ssa` (text + timing, basic styles ignored), `.lrc` (lyrics, with word-level `<mm:ss.xx>` tags when present), `.txt` (one line per caption, auto-timed by a words-per-second setting; or paste text), `.json` (our format). Auto-detect encoding (UTF-8, UTF-8 BOM, UTF-16, Windows-1252) and handle Hindi text correctly.
- Import dialog: file picker or drag-drop, preview first 10 segments, options: target track (new or existing), offset seconds, frame-rate conversion, apply template (choose one), "split long lines by max chars".
- If an imported file has no word-level times, **estimate word timings** by distributing duration across words in proportion to character count (so karaoke effects still work).
- **Export** captions as `.srt`, `.vtt`, `.txt`, `.json`; and an export-dialog option **"Burn captions into video"** (default on) or "Export captions as separate file only".
- Write robust parsers with unit tests, including malformed timestamps, overlapping cues, blank lines, BOM, and multi-line cues.

## D. UI Redesign - Professional, Detailed Panels

Rebuild the shell with a polished design system (tokens in one file: colours, spacing, radii, shadows, typography; dark theme default plus light theme toggle). Use Tailwind + Radix UI + lucide icons + Framer Motion for subtle transitions. Components needed: tooltips with shortcuts, context menus, dropdown menus, sliders with numeric input, colour picker (HSV, hex, eyedropper, swatches, recent colours, saved palette), toggle groups, segmented controls, tabs, collapsible sections, resizable panels (persisted per layout), toasts, modals, empty states, skeleton loaders.

### D1. Left dock (tabs, vertical icon rail)
Media, Audio (library + extract), **Text**, **Captions**, Stickers/Shapes (shapes only: rectangle, circle, line, arrow, with fill/stroke), Effects (basic filters: blur, brightness, contrast, saturation, vignette, B&W), Transitions (cross-fade, fade to black, wipe, slide), Templates (project/text presets).

### D2. Right dock - Inspector (context-sensitive, collapsible sections)
- **Text/Caption selected**: tabs **Basic** (text, font, size, colour, alignment, spacing, case), **Style** (fills, strokes, shadows, glow, extrude, background, curve), **Animation** (In / Out / Loop with preset grid + live preview thumbnails, duration, easing, granularity, stagger), **Position** (x, y, scale, rotation, anchor, safe-zone snap, flip), **Timing** (start, duration, word timings editor), **Template** (apply, save, reset).
- **Video/Image selected**: Basic (position, scale, rotation, opacity, fit/fill, flip, crop), Speed (0.25-4x with presets, optional reverse), Animation (basic In/Out/Combo: fade, zoom, slide, spin), Adjust (brightness, contrast, saturation, temperature, vignette), Audio (volume, fades, detach), Mask (rectangle/circle, feather, invert) - mask is optional in v1.
- **Audio selected**: volume, fades, speed, pitch toggle, EQ presets (optional), waveform zoom, detach/extract.
- **Nothing selected**: Project settings (ratio, resolution, fps, background) and a project info card (duration, track count, media size).
- Each section shows a **reset** icon and supports **copy style / paste style** between clips.
- A **Layers panel** (list view of all clips by track, drag to reorder, eye/lock icons, rename, search) as an optional tab in the right dock.
- A bottom **status bar**: playhead time + frame number, zoom %, preview quality, proxy status, background task progress, autosave status, FPS counter in dev mode.
- Command palette (Ctrl+K) to search any action. Shortcut cheat-sheet (press ?).
- Canvas overlay tools: safe-zone guides toggle (title-safe, TikTok/Reels/Shorts UI-safe areas for 9:16), rulers, grid, snapping guides, rotate/scale handles, zoom (fit/50%/100%/200%), pan with Space+drag.

## E. Dual Editor Layouts: 16:9 (Landscape) and 9:16 (Portrait)

The editor must have **two purpose-built layouts**, chosen automatically from the project aspect ratio and switchable manually from View > Layout (Auto / Landscape / Portrait). Layout choice is stored in app settings; panel sizes are stored per layout.

### E1. Landscape layout (16:9, 4:3, 21:9)
Classic arrangement: left dock | centre preview | right inspector, wide multi-track timeline across the bottom (as in the original spec).

### E2. Portrait layout (9:16, 4:5, 1:1)
Optimised for tall video on a wide screen:
- **Centre**: the tall preview canvas, vertically maximised, with transport controls directly below it.
- **Left**: the media/text/captions dock, narrower than in landscape.
- **Right**: the inspector, slightly wider than in landscape because portrait leaves spare horizontal room.
- **Bottom**: the timeline stays horizontal and full width, with reduced default track heights (user can resize) so the preview can be as tall as possible.
- Portrait safe-zone overlay (platform UI zones for Reels/TikTok/Shorts) and caption anchor defaults at lower third inside the safe area.
- Text/caption defaults adapt: default font size scales to canvas height; caption templates define separate `portrait` and `landscape` position and size values, and use the right set automatically when the aspect ratio changes.
- Preview zoom defaults to "fit height".

### E3. Responsive behaviour
Both layouts support collapsing panels, a minimum window size of 1280x720, and a compact mode below 1440 px wide (icons only for the left rail, inspector as an overlay drawer). The New Project dialog adds big ratio cards (16:9, 9:16, 1:1, 4:5) with visual thumbnails; picking one opens the correct layout.
- Changing the project ratio later asks "Adapt content?" with options: keep positions, auto-reframe (scale to fit, caption re-anchoring), or cancel.

## F. Deliverables and Quality Bar

- New folders: `src/animation/`, `src/captions/` (parsers, exporters, templates, reflow, word-timing), `src/text/` (rasteriser, fonts, presets), `src/layouts/` (LandscapeLayout.tsx, PortraitLayout.tsx, LayoutProvider), `src/design-system/`.
- Data files: `assets/caption-templates/*.json`, `assets/text-presets/*.json`, `assets/fonts/`. Templates and presets must be plain JSON so more can be added without code.
- Update the project schema and migration: project `version` 2, with a migration function from v1 that adds empty caption tracks and default layout.
- A **Template/Animation Gallery dev page** (`/dev/gallery`) that shows every animation and template looping on sample text (used for visual QA).
- Tests: animation module (determinism, easing endpoints, stagger ordering, duration scaling), caption parsers/exporters (SRT, VTT, ASS, LRC, TXT, JSON with Hindi text), reflow, apply-to-all vs override logic, layout switching, schema migration, export parity (preview vs export frame SSIM).
- Accessibility: keyboard focus rings, aria-labels on icon buttons, contrast in dark/light themes.
- Update `README.md`, `DECISIONS.md`, and add `docs/CAPTIONS.md` and `docs/ANIMATIONS.md` explaining how to add a new template or animation preset.

## G. Build Phases (do in this order)

1. **P1 Design system + new shell**: tokens, components, left rail, right inspector skeleton, status bar, command palette, theme toggle.
2. **P2 Dual layouts**: LayoutProvider, Landscape + Portrait layouts, auto-select by ratio, persisted panel sizes, new ratio cards in the New Project dialog, safe-zone overlays.
3. **P3 Text engine upgrade**: rasteriser features, fonts (incl. Hindi), style presets library, inspector Basic/Style/Position tabs.
4. **P4 Animation engine**: module, easings, In/Out/Loop presets, granularity and stagger, inspector Animation tab with live preview thumbnails, preview integration, gallery page.
5. **P5 Captions core**: caption track + segment model, templates (30), Templates tab, apply-to-all vs apply-to-selected, per-segment overrides, Transcript tab, reflow, word timings, word effects.
6. **P6 Caption import/export**: all parsers + exporters, import dialog with preview and options, estimated word timings, burn-in option in export dialog.
7. **P7 Export parity**: PNG sequence rendering from the animation module, FFmpeg overlay integration, golden parity tests, performance pass for 4K 60 fps with many animated captions.
8. **P8 Polish**: remaining inspector panels (video/image/audio/project), layers panel, copy/paste style, shortcut sheet, empty states, migration v1 to v2, docs, final QA via the gallery.

After each phase: run the app, lint, typecheck, tests; summarise; continue. If a requirement cannot be met as written, choose the closest simple alternative and log it in `DECISIONS.md`. Begin with P1.
