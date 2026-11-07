# Captions

Open **Captions** on the tool rail. Create a track and add a segment at the playhead, or use **Import / Export** to load a caption file or paste a transcript. Supported input formats are SRT, VTT, ASS, SSA, LRC, TXT, and JSON. The import preview shows the first ten cues. Choose a target track, offset, source FPS, and optional template before importing.

Use **Templates** to apply a template to a track or selected segments. Applying to the track keeps individual overrides unless **Reset individual edits** is checked. Use **Transcript** to edit text, split or merge segments, find and replace, shift timings, or re-flow long captions. Segment word timings are in seconds relative to the segment start. Imported cues without word timings are estimated by grapheme count.

The Export dialog burns visible caption tracks by default. Choose the separate-file option to write an SRT next to the video. The Captions panel also exports VTT, TXT, and JSON.

## Add a template

Add an entry to the appropriate JSON file under `assets/caption-templates/`. Give it a stable ID, name, category, and a valid text style. Add animation slots, a word effect, and landscape and portrait placements as needed. The app validates the data with the schema referenced by `07_captions_animations.schema.json`. Tracks retain a snapshot so they can reopen independently of the library.

Speech recognition providers can implement `ICaptionProvider` in `src/captions/provider.ts`. Caption import and editing work locally.
