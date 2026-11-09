import * as Dialog from '@radix-ui/react-dialog';
import type { ReactNode } from 'react';
import { X } from 'lucide-react';
import { strings as s } from '../lib/strings';

export function Modal({ title, close, busy, children }: {
  title: string; close(): void; busy: boolean; children: ReactNode;
}) {
  return <Dialog.Root open onOpenChange={(open) => { if (!open && !busy) close(); }}>
    <Dialog.Portal>
      <Dialog.Overlay className="modal-backdrop" />
      <Dialog.Content className="modal" aria-describedby={undefined}>
        <div className="modal-header">
          <Dialog.Title className="text-base font-semibold">{title}</Dialog.Title>
          <Dialog.Close aria-label={s.cancel} disabled={busy}><X size={16} aria-hidden /></Dialog.Close>
        </div>
        <div className="modal-body" tabIndex={0}>{children}</div>
      </Dialog.Content>
    </Dialog.Portal>
  </Dialog.Root>;
}
