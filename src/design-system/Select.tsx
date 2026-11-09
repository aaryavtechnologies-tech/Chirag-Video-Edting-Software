import { Children, isValidElement, type ReactNode } from 'react';
import * as Menu from '@radix-ui/react-dropdown-menu';
import { Check, ChevronDown } from 'lucide-react';

type Option = { value?: string | number; disabled?: boolean; children?: ReactNode };
function options(children: ReactNode): Option[] {
  return Children.toArray(children).flatMap((child) => {
    if (!isValidElement<Option>(child)) return [];
    return child.type === 'option' ? [child.props] : options(child.props.children);
  });
}

export function Select({ label, value, onChange, children, disabled }: {
  label: string; value?: string | number; children: ReactNode; disabled?: boolean;
  onChange(event: { target: { value: string; selectedIndex: number } }): void;
}) {
  const entries = options(children).map((option) => ({ ...option, value: String(option.value ?? option.children ?? '') }));
  const current = entries.findIndex((option) => option.value === String(value ?? ''));
  return <Menu.Root>
    <Menu.Trigger asChild>
      <button type="button" className="ui-select" aria-label={label} data-value={entries[current]?.value} disabled={disabled}>
        <span>{entries[current]?.children ?? '—'}</span><ChevronDown size={14} aria-hidden />
      </button>
    </Menu.Trigger>
    <Menu.Portal><Menu.Content className="chrome-menu ui-select-menu" align="start" sideOffset={5}>
      <Menu.RadioGroup value={String(current)} onValueChange={(key) => {
        const selectedIndex = Number(key);
        onChange({ target: { value: entries[selectedIndex].value, selectedIndex } });
      }}>
        {entries.map((option, index) => <Menu.RadioItem key={index} disabled={option.disabled} value={String(index)}
          className="ui-select-option" data-option-value={option.value}>
          <span>{option.children}</span><Menu.ItemIndicator><Check size={14} aria-hidden /></Menu.ItemIndicator>
        </Menu.RadioItem>)}
      </Menu.RadioGroup>
    </Menu.Content></Menu.Portal>
  </Menu.Root>;
}
