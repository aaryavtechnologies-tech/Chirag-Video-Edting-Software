import { useEffect, useState } from 'react';
import * as Menu from '@radix-ui/react-dropdown-menu';
import { Film, Minus, Square, Copy, X, ChevronRight } from 'lucide-react';
import { strings as s } from '../lib/strings';
import type { WindowAction } from '../types/desktop';

export type TitleAction = { label: string; shortcut?: string; disabled?: boolean; action(): void; children?: TitleAction[] };
function MenuActions({ items }: { items: TitleAction[] }) {
  return <>{items.map((item) => item.children ? <Menu.Sub key={item.label}>
    <Menu.SubTrigger className="title-menu-item" disabled={item.disabled}>{item.label}<ChevronRight size={13} /></Menu.SubTrigger>
    <Menu.Portal><Menu.SubContent className="chrome-menu title-menu" sideOffset={4}>
      <MenuActions items={item.children} />
    </Menu.SubContent></Menu.Portal>
  </Menu.Sub> : <Menu.Item key={item.label} className="title-menu-item" disabled={item.disabled} onSelect={item.action}>
    <span>{item.label}</span>{item.shortcut && <kbd>{item.shortcut}</kbd>}
  </Menu.Item>)}</>;
}

export function TitleBar({ menus, name, dirty, rename }: {
  menus: { label: string; items: TitleAction[] }[]; name?: string; dirty: boolean; rename(value: string): void;
}) {
  const [maximized, setMaximized] = useState(false);
  const [editing, setEditing] = useState(false);
  const [draft, setDraft] = useState('');
  useEffect(() => window.desktop.onWindowMaximized(setMaximized), []);
  const control = (action: WindowAction) => void window.desktop.windowControl(action).then(setMaximized);
  function commit() {
    setEditing(false);
    if (draft.trim() && draft.trim() !== name) rename(draft.trim());
  }
  const MaxIcon = maximized ? Copy : Square;
  return <header className="window-titlebar" onDoubleClick={(event) => {
    if (!(event.target as HTMLElement).closest('button,input')) control('maximize');
  }}>
    <div className="window-brand"><Film size={15} aria-hidden /><span>{s.app}</span></div>
    <nav className="window-menus" aria-label={s.applicationMenu}>
      {menus.map((menu) => <Menu.Root key={menu.label}>
        <Menu.Trigger asChild><button>{menu.label}</button></Menu.Trigger>
        <Menu.Portal><Menu.Content className="chrome-menu title-menu" align="start" sideOffset={4}>
          <MenuActions items={menu.items} />
        </Menu.Content></Menu.Portal>
      </Menu.Root>)}
    </nav>
    <h1 className="window-project">
      {editing ? <input aria-label={s.name} value={draft} autoFocus maxLength={120}
        onFocus={(event) => event.currentTarget.select()} onChange={(event) => setDraft(event.target.value)}
        onBlur={commit} onKeyDown={(event) => {
          if (event.key === 'Enter') event.currentTarget.blur();
          if (event.key === 'Escape') setEditing(false);
        }} /> : name && <button className="window-project-name" title={name} onDoubleClick={() => {
          setDraft(name); setEditing(true);
        }} onKeyDown={(event) => {
          if (event.key === 'F2') { event.preventDefault(); setDraft(name); setEditing(true); }
        }}>{name}{dirty && <span className="unsaved-dot" aria-label={s.unsavedChanges} />}</button>}
    </h1>
    <div className="window-controls">
      <button aria-label={s.minimize} title={s.minimize} onClick={() => control('minimize')}><Minus size={15} /></button>
      <button aria-label={maximized ? s.restoreWindow : s.maximizeWindow} title={maximized ? s.restoreWindow : s.maximizeWindow}
        onClick={() => control('maximize')}><MaxIcon size={13} /></button>
      <button className="window-close" aria-label={s.closeWindow} title={s.closeWindow} onClick={() => control('close')}><X size={16} /></button>
    </div>
  </header>;
}
