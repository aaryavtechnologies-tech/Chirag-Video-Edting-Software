import * as Tooltip from '@radix-ui/react-tooltip';
import type { ButtonHTMLAttributes, ReactNode } from 'react';

export function IconButton({ label, shortcut, children, ...props }: ButtonHTMLAttributes<HTMLButtonElement> & {
  label: string; shortcut?: string; children: ReactNode;
}) {
  return <Tooltip.Root>
    <Tooltip.Trigger asChild>
      <button {...props} type="button" className="tool-icon" aria-label={label} aria-keyshortcuts={shortcut}>
        {children}
      </button>
    </Tooltip.Trigger>
    <Tooltip.Portal>
      <Tooltip.Content className="tool-tooltip" sideOffset={6}>
        {label}{shortcut && <kbd>{shortcut}</kbd>}
      </Tooltip.Content>
    </Tooltip.Portal>
  </Tooltip.Root>;
}
