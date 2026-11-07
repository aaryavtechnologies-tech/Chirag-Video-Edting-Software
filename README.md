# Video Editor

A desktop video editor built with Electron, React 18, TypeScript, Vite, Tailwind, and Zustand.

## Setup

Install Node.js 22.12 or newer and run `npm ci`. Electron downloads a platform binary when first needed.

| Command | Purpose |
| --- | --- |
| `npm run dev` | Launch the desktop app with Vite |
| `npm run compile` | Build main, preload, and renderer bundles |
| `npm run build` | Package the app with electron-builder |
| `npm run lint` | Run ESLint |
| `npm run typecheck` | Check strict TypeScript |
| `npm test` | Run Vitest unit tests |
| `npm run e2e` | Build and run the Playwright Electron smoke test |

The native build configuration targets NSIS on Windows, DMG on macOS, and AppImage on Linux. Build each target on the appropriate host.

## Architecture

The renderer owns UI and active project state. A small typed API in the isolated preload connects it to the Electron main process, which owns dialogs, project files, settings, and the log. Projects use the versioned `.vedit` JSON contract in `05_project.schema.json`. Each new project folder contains the project file, a cache directory, and an exports directory.

The media bin imports local video, images, and audio using bundled FFmpeg and ffprobe. It stores thumbnails and preview proxies in the project cache.

## Export

The renderer rasterizes styled text to transparent PNGs with the Canvas code used for preview. The main process builds an FFmpeg filter script from the project JSON and combines original media, PNG overlays, and the audio mix. It verifies staged output with ffprobe before publishing it. You can export video with audio, audio only, or both files in one run. Cancelling removes the staged output.

