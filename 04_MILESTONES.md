# Build Plan - Milestones with ready prompts

Use these one by one if Codex runs out of context or you want tighter control. Start each with: "Continue the video editor project. Read AGENTS.md and the spec. Do milestone X."

## M1 - Skeleton, Home screen, projects
Set up Electron + React + TS + Vite + Tailwind + Zustand + Vitest + ESLint. Build the Home screen (New Project, Open Project, recent projects grid with thumbnails), the New Project dialog (spec 5.2), project folder creation, save/load of `.vedit` validated with zod against `05_project.schema.json`, recent-projects list, app settings.
**Done when:** you can create, close, and reopen a project.

## M2 - Import and media bin
ffprobe integration, drag-drop and file-dialog import (video, image, audio), thumbnails, proxy generation for sources above 1080p (background, with progress), media bin UI with filters. Implement the project store with Immer and a history stack for undo/redo.
**Done when:** imported media shows in the bin with thumbnails and survives reopening.

## M3 - Timeline
Multi-track timeline: video tracks and audio tracks, add/remove/reorder tracks, drag clips (within and between same-kind tracks), trim edges, split, delete, ripple delete, snapping, zoom, scroll, multi-select, markers, ruler, playhead scrubbing, drag from media bin. Thumbnails in video clips. No same-track overlaps. Unit-test all timeline logic.
**Done when:** all behaviours in spec 4.3 work.

## M4 - Preview engine
Master clock, play/pause/seek/step, compositor drawing layers bottom to top onto the canvas with transform, opacity and fades, on-canvas move/scale/rotate handles with guides, preview quality selector, proxy usage, missing-media handling.
**Done when:** 3 layers play smoothly at Half quality.

## M5 - Audio
Web Audio graph with per-clip gain and fades, per-track mute/solo/volume, master volume and meter, waveform generation and cache, detach audio, speed change with pitch handling.
**Done when:** multiple audio tracks mix correctly in preview.

## M6 - Text
Text clips on video tracks, inline canvas editing, Text tab presets, the full Styles panel (spec 5.4), animation in/out, saved style presets, bundled fonts + system fonts, shared text rasteriser module.
**Done when:** every style control changes both the canvas and the exported look.

## M7 - Export (1080p)
Export dialog, filter-graph builder from the project JSON (video layers, text PNG overlays, audio mix), FFmpeg runner with progress/ETA/cancel, audio-only and both modes, ffprobe verification. Unit tests for the graph builder and a golden test.
**Done when:** a 1080p30 export visually matches the preview and the audio matches.

## M8 - 4K 60 fps and hardware encoding
Hardware encoder detection and fallback, 4K60 presets, HEVC option, bitrate suggestions, disk-space check, size estimate, one-click presets (YouTube 1080p30, YouTube 4K60, Reel, MP3 320).
**Done when:** a 4K60 export verifies as 3840x2160 @ 60 fps with audio in ffprobe.

## M9 - Polish and release
All shortcuts, autosave + crash recovery, relink media dialog, project settings editing, empty/error states, performance pass, README, installer builds, e2e smoke tests, sample project.
**Done when:** the installer runs on a clean Windows PC and all acceptance tests (spec 16) pass.
