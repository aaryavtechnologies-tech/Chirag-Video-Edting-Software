import { strings as s } from '../lib/strings';
import { textKinds } from '../lib/textPresets';

export function TextPanel({ add, busy }: { add(kind: keyof typeof textKinds): void; busy: boolean }) {
  return <section className="media-bin">
    <h2 className="font-semibold">{s.text}</h2>
    <p className="muted my-3">{s.textHelp}</p>
    <div className="grid gap-2">
      {(Object.keys(textKinds) as (keyof typeof textKinds)[]).map((kind) =>
        <button disabled={busy} key={kind} onClick={() => add(kind)}>{s[kind]}</button>)}
    </div>
  </section>;
}
