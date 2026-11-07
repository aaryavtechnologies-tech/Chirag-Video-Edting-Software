# Decisions

- P1 connects the new rail to Media, Audio, Text, and Templates. Caption, shape, effect, and transition entries reserve their places in the shell until their tools are available.
- P2 treats square projects as portrait and uses a shared vertical-video safe area across platforms. Auto-reframe fits the old canvas inside the new one and maps positions into the fitted area.
- P3 uses Chromium shaping with bundled Arabic, Devanagari, and Gujarati fallbacks. Curve rendering bends the shaped raster in strips, and per-word colour overlays retain the underlying glyph shaping.
- P4 keeps legacy motion fields readable. Choosing an advanced preset creates clip-level slots. Frame-sequence export is scheduled for P7.
- P5 stores captions separately from ordinary clips. The preview derives text layers from caption segments and their effective templates. Word timestamps are relative to each segment.
- P6 preserves overlapping cues. Frame-rate conversion preserves frame numbers by multiplying imported timestamps by source FPS divided by project FPS. A sidecar SRT uses the same export range as the video.
- P7 sends pre-composited PNG frames to the main process in small batches. Static clips use one PNG, and identical frames in an animation hold reuse the staged raster.
- P8 migrates v1 on read and saves v2. Video adjustments use the closest Canvas and FFmpeg filters. Fade to background uses the project's background, and cross-fade uses overlapping layers.
- The vertical preview uses a shared platform-safe guide. Texture fill, masks, reverse playback, and EQ presets are outside this implementation. The 4K60 regression covers the sample project, and animation preview throughput has no formal 60-fps benchmark.

- The text update extends the existing animation enums in the project schema. Existing projects keep their animation settings. The new enum values require Video Editor 0.2.0 or later.

- M1 uses the supplied JSON Schema as the file contract. Optional defaults remain optional on load, and additional fields survive a save.
- Project creation uses separate portable folders and refuses to overwrite an existing folder. Portrait and square presets use the same long-edge limit as landscape presets. Custom sizes are entered as even pixel dimensions.
- Home cards use a canvas-color thumbnail for empty projects. Media-derived previews belong to the media and preview milestones.
- Home renames the display name while keeping the project path stable. Deletion uses the OS trash for a standalone file, or the whole folder for an editor-created project.
- M2 keeps sources at their original absolute paths and stores generated thumbnails and proxies under the project cache. Proxy jobs run one at a time and fall back to the source on failure.
- M3 blocks same-track overlaps. Ripple deletion removes the selected durations from subsequent clips on each affected track. The strip repeats the cached asset thumbnail until frame-specific thumbnails are available.
- M4 uses proxies at Half and Quarter quality when available. Full quality reads originals. Media decoding uses Chromium through a streaming project-media protocol.
- M5 uses browser pitch-preserving playback for speed changes. Soloing an audio track suppresses other audio tracks and embedded video audio. A detached clip gets an independent timeline placement.
- M6 saves text presets in the project file and represents fill opacity with alpha-channel colors so it fits the supplied file format.
- M7 fits the project stage into the export frame when their aspect ratios differ. MP4 uses AAC and WebM uses Opus. Outputs are published only after verification, and existing files are protected.
- M8 tests available hardware encoders at the requested output dimensions and fps before using them. A driver failure during rendering triggers a fresh software encode.
- M9 stages dirty edits in the main process and writes a separate autosave on the configured interval. Saving clears the checkpoint. Relinking retains the asset ID and checks the replacement's media type and duration.
- M9 also builds preview proxies for MOV, MKV, and AVI sources to cover browser decoder differences. Exports still read the originals.
- A basic cross-fade uses overlapping clips on separate video tracks with a fade on the upper clip.

