import { Modal } from './Modal';
import { strings as s } from '../lib/strings';

const shortcuts = [
  ['Space', s.play], ['S', s.split], ['Delete', s.delete], ['Shift+Delete', s.rippleDelete],
  ['Ctrl+Z', s.undo], ['Ctrl+Shift+Z', s.redo], ['Ctrl+C / Ctrl+V', s.copy + ' / ' + s.paste],
  ['Ctrl+Shift+C / Ctrl+Shift+V', s.copyStyle + ' / ' + s.pasteStyle],
  ['← / →', s.nextFrame], ['Home / End', s.timeline], ['+ / −', s.zoom], ['M', s.marker],
  ['N', s.snap], ['Ctrl+S', s.save], ['Ctrl+E', s.export], ['Ctrl+K', s.commandPalette], ['T', s.addText],
];

export function Shortcuts({ close }: { close(): void }) {
  return <Modal title={s.shortcuts} close={close} busy={false}>
    <dl className="shortcut-sheet">
      {shortcuts.map(([key, action]) => <div key={key}><dt>{action}</dt><dd><kbd>{key}</kbd></dd></div>)}
    </dl>
  </Modal>;
}
