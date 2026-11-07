import * as Dialog from '@radix-ui/react-dialog';
import type { ReactNode } from 'react';
import { strings as s } from '../lib/strings';

export function Modal({ title, close, busy, children }: {
  title: string; close(): void; busy: boolean; children: ReactNode;
}) {
  return <Dialog.Root open onOpenChange={(open) => { if (!open && !busy) close(); }}>
    <Dialog.Portal>
      <Dialog.Overlay className="fixed inset-0 bg-black/60" />
      <Dialog.Content className="modal" aria-describedby={undefined}>
        <div className="flex items-center justify-between gap-4">
          <Dialog.Title className="text-xl font-semibold">{title}</Dialog.Title>
          <Dialog.Close aria-label={s.cancel} disabled={busy}>×</Dialog.Close>
        </div>
        {children}
      </Dialog.Content>
    </Dialog.Portal>
  </Dialog.Root>;
}
