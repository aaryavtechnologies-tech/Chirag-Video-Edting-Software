import { expect, it } from 'vitest';
import { useProject } from '../../src/store/projectStore';
import { moveClips, splitClips, trimClip } from '../../src/timeline/operations';
import type { Project } from '../../src/types/project';

it('undoes and redoes 20 mixed edits without changing either checkpoint', () => {
  const project: Project = {
    id: 'history', version: 1, name: 'History', assets: [], settings: { width: 1920, height: 1080, fps: 30 },
    tracks: [
      { id: 'video', name: 'V1', kind: 'video', clips: Array.from({ length: 5 }, (_, index) =>
        ({ id: 'image' + index, type: 'image', start: index * 5, duration: 2 })) },
      { id: 'text', name: 'V2', kind: 'video',
        clips: [{ id: 'title', type: 'text', start: 0, duration: 25, text: 'Original' }] },
    ],
  };
  const store = useProject.getState();
  try {
    store.setCurrent({ file: 'history.vedit', project });
    for (let index = 0; index < 5; index += 1) {
      const id = 'image' + index;
      const selection = new Set([id]);
      store.edit((draft) => { expect(moveClips(draft, selection, id, 'video', 0.5)).toBe(true); });
      store.edit((draft) => { expect(trimClip(draft, id, 'right', index * 5 + 3)).toBe(true); });
      store.edit((draft) => { expect(splitClips(draft, selection, index * 5 + 1, () => 'split' + index)).toBe(true); });
      store.edit((draft) => { draft.tracks[1].clips[0].text = 'Change ' + index; });
    }
    const final = useProject.getState().current!.project;
    expect(useProject.getState().past).toHaveLength(20);
    for (let index = 0; index < 20; index += 1) store.undo();
    expect(useProject.getState().current!.project).toEqual(project);
    for (let index = 0; index < 20; index += 1) store.redo();
    expect(useProject.getState().current!.project).toEqual(final);
  } finally {
    store.setCurrent();
  }
});
