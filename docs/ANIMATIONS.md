# Animations

Select a text clip and open **Animation**. Expand **Animation presets** to choose an In, Out, or Loop preset. Hover or focus a preset card for a preview, or use **Preview animation** to play the selected clip on the timeline. The controls include easing, delay, intensity, and per-unit stagger for In and Out.

The pure evaluator lives in `src/animation/evaluate.ts`. It consumes a clip, time relative to the clip, and canvas dimensions. If the requested In and Out windows exceed the clip duration, both windows shrink proportionally. Random stagger and jitter use the stored seed. The renderer uses the same evaluator for the editor and export.

## Add a preset

1. Add the preset ID to the appropriate phase in `src/animation/presets.ts`.
2. Add its display name in `src/lib/strings.ts`.
3. Implement the time-based effect in `src/animation/evaluate.ts` and add a deterministic test.
4. Run the app in development and open `http://localhost:5173/dev/gallery` using the Vite port printed at startup.

The export pipeline uses a static transparent PNG for still text. Animated clips render bounded PNG frames using the shared Canvas renderer. The main process receives the files in small batches, reuses static hold frames, and overlays the sequences in FFmpeg.
