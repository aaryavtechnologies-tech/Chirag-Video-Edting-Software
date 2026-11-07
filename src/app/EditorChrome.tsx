import { useState, type ReactNode } from 'react';
import * as Tooltip from '@radix-ui/react-tooltip';
import * as Menu from '@radix-ui/react-dropdown-menu';
import { AudioLines, Captions, Clapperboard, FolderOpen, Moon, Search, Shapes, Sparkles, Sun, Type, WandSparkles } from 'lucide-react';
import { motion, useReducedMotion } from 'framer-motion';
import { strings as s } from '../lib/strings';
import { IconButton } from '../design-system/IconButton';
import { Modal } from './Modal';
import { layoutModeSchema, type LayoutMode } from '../layouts/settings';

export type Dock = 'media' | 'audio' | 'text' | 'captions' | 'shapes' | 'effects' | 'transitions' | 'templates';
const docks = [
  ['media', FolderOpen], ['audio', AudioLines], ['text', Type], ['captions', Captions],
  ['shapes', Shapes], ['effects', Sparkles], ['transitions', WandSparkles], ['templates', Clapperboard],
] as const;

export function EditorDock({ active, select, children }: {
  active: Dock; select(dock: Dock): void; children: ReactNode;
}) {
  const reduced = useReducedMotion();
  return <div className="editor-dock">
    <nav aria-label={s.editorDock} className="dock-rail">
      {docks.map(([key, Icon]) => <IconButton key={key} label={s[key]} aria-pressed={active === key}
        onClick={() => select(key)}><Icon size={17} aria-hidden="true" /></IconButton>)}
    </nav>
    <motion.div className="editor-sidebar" key={active} initial={reduced ? false : { opacity: 0.6 }}
      animate={{ opacity: 1 }} transition={{ duration: 0.12 }}>
      {children}
    </motion.div>
  </div>;
}

export function ChromeActions({ theme, toggleTheme, openPalette }: {
  theme: 'dark' | 'light'; toggleTheme(): void; openPalette(): void;
}) {
  const ThemeIcon = theme === 'dark' ? Sun : Moon;
  return <>
    <IconButton label={s.commandPalette} shortcut="Control+K" onClick={openPalette}><Search size={17} aria-hidden /></IconButton>
    <IconButton label={s.toggleTheme} onClick={toggleTheme}><ThemeIcon size={17} aria-hidden /></IconButton>
  </>;
}

export type Command = { label: string; shortcut?: string; disabled?: boolean; run(): void };

export function CommandPalette({ actions, close }: { actions: Command[]; close(): void }) {
  const [query, setQuery] = useState('');
  const matches = actions.filter(({ label }) => label.toLocaleLowerCase().includes(query.trim().toLocaleLowerCase()));
  function run(action: Command) { close(); action.run(); }
  return <Modal title={s.commandPalette} busy={false} close={close}>
    <div className="command-list">
      <input autoFocus aria-label={s.searchActions} placeholder={s.searchActions} value={query}
        onChange={(event) => setQuery(event.target.value)} onKeyDown={(event) => {
          if (event.key !== 'Enter') return;
          const action = matches.find((item) => !item.disabled);
          if (action) run(action);
        }} />
      {matches.map((action) => <button key={action.label} disabled={action.disabled} onClick={() => run(action)}>
        {action.label}{action.shortcut && <kbd>{action.shortcut}</kbd>}
      </button>)}
      {!matches.length && <p className="muted">{s.noActions}</p>}
    </div>
  </Modal>;
}

export function EditorTooltips({ children }: { children: ReactNode }) {
  return <Tooltip.Provider delayDuration={250}>{children}</Tooltip.Provider>;
}

export function LayoutMenu({ mode, change, dockOpen, inspectorOpen, guides, toggleDock, toggleInspector, toggleGuides }: {
  mode: LayoutMode; change(mode: LayoutMode): void;
  dockOpen: boolean; inspectorOpen: boolean; guides: boolean;
  toggleDock(): void; toggleInspector(): void; toggleGuides(): void;
}) {
  return <Menu.Root>
    <Menu.Trigger asChild><button>{s.view}</button></Menu.Trigger>
    <Menu.Portal><Menu.Content className="chrome-menu" align="start" sideOffset={6}>
      <Menu.Label>{s.layout}</Menu.Label>
      <Menu.RadioGroup value={mode} onValueChange={(value) => change(layoutModeSchema.parse(value))}>
        {layoutModeSchema.options.map((option) => <Menu.RadioItem key={option} value={option}>
          <Menu.ItemIndicator>✓ </Menu.ItemIndicator>{s[option]}
        </Menu.RadioItem>)}
      </Menu.RadioGroup>
      <Menu.Separator />
      <Menu.CheckboxItem checked={dockOpen} onCheckedChange={toggleDock}><Menu.ItemIndicator>✓ </Menu.ItemIndicator>{s.showDock}</Menu.CheckboxItem>
      <Menu.CheckboxItem checked={inspectorOpen} onCheckedChange={toggleInspector}><Menu.ItemIndicator>✓ </Menu.ItemIndicator>{s.showInspector}</Menu.CheckboxItem>
      <Menu.CheckboxItem checked={guides} onCheckedChange={toggleGuides}><Menu.ItemIndicator>✓ </Menu.ItemIndicator>{s.safeZones}</Menu.CheckboxItem>
    </Menu.Content></Menu.Portal>
  </Menu.Root>;
}
