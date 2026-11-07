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
| `npm run sample` | Generate the layered demo project and its media |

The native build configuration targets NSIS on Windows, DMG on macOS, and AppImage on Linux. Build each target on the appropriate host. Windows builds appear in `release/`. Local release builds are unsigned unless a signing certificate is configured.

## Architecture

The renderer owns UI and active project state. A small typed API in the isolated preload connects it to the Electron main process, which owns dialogs, project files, settings, and the log. Projects use the versioned `.vedit` JSON contract in `05_project.schema.json`. Each new project folder contains the project file, a cache directory, and an exports directory.

The media bin imports local video, images, and audio using bundled FFmpeg and ffprobe. It stores thumbnails and preview proxies in the project cache.

## Export

The renderer rasterizes styled text to transparent PNGs with the Canvas code used for preview. The main process builds an FFmpeg filter script from the project JSON and combines original media, PNG overlays, and the audio mix. It verifies staged output with ffprobe before publishing it. You can export video with audio, audio only, or both files in one run. Cancelling removes the staged output.

H.264 and HEVC exports probe NVENC, QSV, AMF, or VideoToolbox as appropriate for the host and retry in software if the hardware encode fails. Use **YouTube 4K60** for 3840×2160 at 60 fps. The bundled FFmpeg binary's license and build notices are in the `ffmpeg-static` package.

## Demo project

Run `npm run sample` and open `samples/Demo/Demo.vedit`. The generator writes local media and a three-second project with two videos, two images, three styled titles, and two audio tracks. Select **Export**, apply **YouTube 4K60**, then select **Both files** to produce an MP4 and MP3. The golden and Electron tests exercise these export paths and verify their output with ffprobe.

Project edits are checkpointed every 30 seconds by default. The start screen offers recovery after an interrupted session. If an original file has moved, use **Relink media** to select its replacement.

