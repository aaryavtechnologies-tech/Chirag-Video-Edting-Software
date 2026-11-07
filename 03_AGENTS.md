# AGENTS.md  (copy this file into the project root with this exact name)

## Project
Simple desktop video editor (CapCut-style, simplified). Electron + React + TypeScript + Vite. Spec: `01_VIDEO_EDITOR_SPEC.pdf`.

## Commands (create these npm scripts)
- `npm run dev` - start Electron + Vite in development
- `npm run build` - production build + installer
- `npm run lint` - ESLint
- `npm run typecheck` - `tsc --noEmit`
- `npm test` - Vitest
- `npm run e2e` - Playwright smoke tests

## Rules
- Follow the spec. If you must deviate, log it in `DECISIONS.md` with the reason.
- Strict TypeScript. No `any` without a comment explaining why.
- The project JSON is the single source of truth; preview and export both read it.
- Times are seconds (float). Transforms are normalised 0-1 relative to canvas.
- Electron security: `contextIsolation: true`, `nodeIntegration: false`, expose only a small typed API in preload.
- Never run FFmpeg/ffprobe in the renderer. Use the main process with progress events over IPC.
- Never block the UI thread; long work must be async with progress and cancel.
- Text styling: one shared rasteriser function is used for both preview and export. Never use FFmpeg `drawtext` for styled text.
- Export must use original media, never proxies. Preview may use proxies.
- Write the FFmpeg filter graph to a temp script file (`-filter_complex_script`); do not build giant command lines.
- Handle errors: missing media, corrupt files, no disk space, encoder not available (fallback to software). Show plain-language messages and write logs to the app data folder.
- All user-facing strings in one place (`src/lib/strings.ts`) for easy editing.
- UI: dark theme, indigo accent, 8px rounded corners, keyboard shortcuts from spec section 12.

## Workflow
- Work one milestone at a time (see `04_MILESTONES.md`).
- Before finishing a milestone: lint + typecheck + tests pass and the app launches.
- Commit after each milestone with a clear message.
- Keep a short `CHANGELOG.md` and `DECISIONS.md`.

## Do not build (v1)
Keyframe graphs, tracking, green screen, AI features, auto captions, cloud sync, accounts, collaboration, plugins, LUTs, complex transitions.
