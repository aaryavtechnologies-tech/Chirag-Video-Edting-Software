import * as Dialog from '@radix-ui/react-dialog';
import { useRef, type ReactNode } from 'react';
import { X } from 'lucide-react';
import { strings as s } from '../lib/strings';

export function Modal({ title, close, busy, children, subtitle, size = 'medium', footer }: {
  title: string; close(): void; busy: boolean; children: ReactNode;
  subtitle?: string; size?: 'small' | 'medium' | 'large' | 'xlarge'; footer?: ReactNode;
}) {
  const opener = useRef(document.activeElement);
  return <Dialog.Root open onOpenChange={(open) => { if (!open && !busy) close(); }}>
    <Dialog.Portal>
      <Dialog.Overlay className="modal-backdrop" />
      <Dialog.Content className="modal" data-size={size} {...(subtitle ? {} : { 'aria-describedby': undefined })}
        onCloseAutoFocus={(event) => {
          if (!(opener.current instanceof HTMLElement) || !opener.current.isConnected) return;
          event.preventDefault();
          opener.current.focus();
        }}>
        <div className="modal-header">
          <div><Dialog.Title className="text-base font-semibold">{title}</Dialog.Title>
            {subtitle && <Dialog.Description className="muted">{subtitle}</Dialog.Description>}</div>
          <Dialog.Close aria-label={s.cancel} disabled={busy}><X size={16} aria-hidden /></Dialog.Close>
        </div>
        <div className="modal-body" tabIndex={0}>{children}</div>
        {footer && <footer className="modal-footer">{footer}</footer>}
      </Dialog.Content>
    </Dialog.Portal>
  </Dialog.Root>;
}
