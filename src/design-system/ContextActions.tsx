import * as Menu from '@radix-ui/react-dropdown-menu';
import type { LucideIcon } from 'lucide-react';

type Action = {
  label: string; icon: LucideIcon; shortcut?: string; disabled?: boolean; danger?: boolean; divide?: boolean;
  run(): void;
};

export function ContextActions({ x, y, items, close }: { x: number; y: number; items: Action[]; close(): void }) {
  return <Menu.Root open onOpenChange={(open) => { if (!open) close(); }}>
    <Menu.Trigger className="context-anchor" tabIndex={-1} aria-hidden="true" style={{ left: x, top: y }} />
    <Menu.Portal><Menu.Content className="chrome-menu title-menu" align="start" collisionPadding={8}
      onCloseAutoFocus={(event) => event.preventDefault()}>
      {items.map(({ label, icon: Icon, shortcut, danger, divide, disabled, run }) => <MenuItem key={label} {...{
        label, Icon, shortcut, danger, divide, disabled, run,
      }} />)}
    </Menu.Content></Menu.Portal>
  </Menu.Root>;
}

function MenuItem({ label, Icon, shortcut, danger, divide, disabled, run }: Omit<Action, 'icon'> & { Icon: LucideIcon }) {
  return <>
    {divide && <Menu.Separator />}
    <Menu.Item disabled={disabled} className={`title-menu-item ${danger ? 'danger-item' : ''}`} onSelect={run}>
      <span className="context-label"><Icon size={14} aria-hidden="true" />{label}</span>{shortcut && <kbd>{shortcut}</kbd>}
    </Menu.Item>
  </>;
}
