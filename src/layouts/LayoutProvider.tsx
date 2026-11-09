import { createContext, useContext, useState, type ReactNode } from 'react';
import { defaultPanels, resolveLayout, type LayoutPreferences, type ResolvedLayout } from './settings';
import { ScrollHints } from '../design-system/ScrollHints';
import { PanelResizer } from '../app/PanelResizer';

const LayoutContext = createContext<ResolvedLayout>('landscape');
export const useEditorLayout = () => useContext(LayoutContext);

export function LayoutProvider({ settings, width, height, children }: {
  settings?: LayoutPreferences; width: number; height: number; children: ReactNode;
}) {
  return <LayoutContext.Provider value={resolveLayout(settings?.mode ?? 'auto', width, height)}>
    {children}
  </LayoutContext.Provider>;
}

export type EditorLayoutProps = {
  dock: ReactNode; preview: ReactNode; inspector: ReactNode; preferences?: LayoutPreferences;
  savePanels(sizes: { media: number; inspector: number }): void;
  dockOpen: boolean; inspectorOpen: boolean;
};

export function LayoutColumns({ dock, preview, inspector, preferences, savePanels, dockOpen, inspectorOpen }: EditorLayoutProps) {
  const mode = useEditorLayout();
  const saved = preferences?.panels?.[mode] ?? defaultPanels[mode];
  const [draft, setDraft] = useState<{ media: number; inspector: number }>();
  const panels = draft ?? saved;
  const update = (panel: keyof typeof panels, value: number) => setDraft({ ...panels, [panel]: value });
  function commit(panel: keyof typeof panels, value: number) {
    const next = { ...panels, [panel]: value };
    setDraft(next);
    savePanels(next);
  }
  return <div className={`editor-body editor-layout-${mode}`} data-layout={mode}
    data-dock-open={dockOpen} data-inspector-open={inspectorOpen}
    style={{ '--dock-size': `${panels.media}px`, '--inspector-size': `${panels.inspector}px` } as React.CSSProperties}>
    {dock}
    {dockOpen && <PanelResizer width={panels.media} resize={(value) => update('media', value)}
      onCommit={(value) => commit('media', value)} />}
    {preview}
    {inspectorOpen && <PanelResizer width={panels.inspector} right resize={(value) => update('inspector', value)}
      onCommit={(value) => commit('inspector', value)} />}
    {inspectorOpen && <ScrollHints className="layout-inspector" selector=".inspector">{inspector}</ScrollHints>}
  </div>;
}
