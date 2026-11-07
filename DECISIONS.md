# Decisions

- M1 uses the supplied JSON Schema as the file contract. Optional defaults remain optional on load, and additional fields survive a save.
- Project creation uses separate portable folders and refuses to overwrite an existing folder. Portrait and square presets use the same long-edge limit as landscape presets. Custom sizes are entered as even pixel dimensions.
- Home cards use a canvas-color thumbnail for empty projects. Media-derived previews belong to the media and preview milestones.
- Home renames the display name while keeping the project path stable. Deletion uses the OS trash for a standalone file, or the whole folder for an editor-created project.
- M2 keeps sources at their original absolute paths and stores generated thumbnails and proxies under the project cache. Proxy jobs run one at a time and fall back to the source on failure.

