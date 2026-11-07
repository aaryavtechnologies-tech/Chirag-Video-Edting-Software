# Main Prompt for Codex

Copy everything below the line into Codex. Put `01_VIDEO_EDITOR_SPEC.pdf`, `03_AGENTS.md` (renamed to `AGENTS.md`), `04_MILESTONES.md` and `05_project.schema.json` into an empty project folder first, so Codex can read them.

---

You are a senior full-stack engineer. Build a **desktop video editor** (a simplified CapCut) as described in the specification files in this folder.

## Read first
1. `01_VIDEO_EDITOR_SPEC.pdf` - the full product and technical spec (source of truth).
2. `AGENTS.md` - rules you must follow throughout.
3. `04_MILESTONES.md` - the build order (M1 to M9).
4. `05_project.schema.json` - the project file format. Implement it exactly (TypeScript types + runtime validation with zod).

## What to build (summary)
- Electron + React 18 + TypeScript + Vite + Tailwind + Zustand (with undo/redo).
- **Start screen** with New Project, Open Project, and recent projects grid.
- **New Project dialog**: name, aspect ratio, resolution (up to 4K), fps (24-60), background colour, save folder.
- **Editor**: media bin, preview canvas with on-canvas handles, inspector panels, multi-track timeline.
- **Timeline**: multiple video/image tracks (layers) and multiple audio tracks; drag, trim, split, snap, zoom, multi-select, ripple delete, waveform and thumbnails inside clips.
- **Audio**: multiple audio layers mixed in real time; per-clip volume, fades, mute; per-track mute/solo/volume; detach audio from video.
- **Text**: add text clips, inline editing, and a full Styles panel (font, size, colours, gradient, stroke, shadow, glow, background box, alignment, spacing, animation in/out, style presets).
- **Export** with FFmpeg from the project JSON: video + audio combined, audio only (MP3/WAV/M4A), or both; up to **3840x2160 at 60 fps**; hardware encoder auto-detection (NVENC/QSV/AMF/VideoToolbox) with software fallback; progress, ETA, cancel; post-export verification with ffprobe.
- Text in export must look identical to the preview: rasterise styled text to transparent PNGs with the same canvas code and overlay in FFmpeg. Do NOT use FFmpeg drawtext for styled text.
- Proxies for large sources in preview only; export always uses the originals.
- Autosave every 30 s, crash recovery, relink missing media.

## How to work
1. Start by writing a short plan (files, key decisions) and confirm the stack. Do not change the stack unless something is impossible.
2. Work **one milestone at a time** in the order in `04_MILESTONES.md`. After each milestone: run the app, run `npm run lint`, `npm run typecheck`, `npm test`, fix everything, then summarise what works and what is left. Then continue to the next milestone without waiting unless blocked.
3. Keep code strict TypeScript, small modules, no `any` unless justified. Follow the folder structure in the spec (section 14).
4. Write unit tests for: timeline operations (move, trim, split, snap, overlap rules), project load/save/migration, filter-graph builder, text rasteriser inputs, time/frame utilities. Add a golden export test that renders a 3-second sample project and checks the result with ffprobe.
5. Never block the UI thread. All FFmpeg and ffprobe work runs in the Electron main process with typed IPC (`contextIsolation: true`, `nodeIntegration: false`).
6. Do not build anything listed under "Non-goals for v1" in the spec.
7. If the spec is ambiguous, choose the simplest option that satisfies the acceptance tests (spec section 16) and note the decision in `DECISIONS.md`.

## Definition of done
- All acceptance tests in spec section 16 pass.
- `npm run dev` starts the app; `npm run build` produces a Windows installer (electron-builder), and macOS/Linux configs exist.
- `README.md` explains setup, scripts, architecture, and how export works.
- A sample project in `samples/` exports a 4K 60 fps MP4 and an MP3 successfully.

Begin with Milestone M1 now.
