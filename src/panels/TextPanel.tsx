import { Plus } from 'lucide-react';
import { AnimationPreview } from '../animation/AnimationPreview';
import { Segmented } from '../design-system/Controls';
import { useStoredTab } from '../design-system/useStoredTab';
import { strings as s } from '../lib/strings';
import { builtInStyles, textKinds } from '../lib/textPresets';
import type { TextStyle } from '../types/project';

const groups = {
  default: ['clean', 'classic', 'minimalThin'],
  titles: ['headline', 'retroWave', 'goldFoil', 'filmCredits', 'impact', 'sunset'],
  lowerThirds: ['lower', 'newsBanner', 'blackBar', 'paperNote'],
  social: ['neonMint', 'comic', 'gaming', 'glassPill', 'bubble'],
};
const categories = Object.keys(groups) as (keyof typeof groups)[];
const still = {};

export function TextPanel({ add, busy }: { add(kind: keyof typeof textKinds, style?: TextStyle): void; busy: boolean }) {
  const [category, setCategory] = useStoredTab('editor-text-category', categories, 'default');
  return <section className="media-bin text-dock">
    <h2 className="font-semibold">{s.text}</h2>
    <div className="text-kinds">
      {(Object.keys(textKinds) as (keyof typeof textKinds)[]).map((kind) =>
        <button disabled={busy} key={kind} onClick={() => add(kind)}><Plus size={13} aria-hidden="true" />{s[kind]}</button>)}
    </div>
    <Segmented label={s.category}>
      {categories.map((item) => <button key={item} aria-pressed={category === item} onClick={() => setCategory(item)}>
        {s.textCategories[item]}
      </button>)}
    </Segmented>
    <div className="text-style-library">
      {groups[category].map((id) => <button disabled={busy} key={id} aria-label={s.addTextPreset(s.styleNames[id])}
        onClick={() => add(category === 'lowerThirds' ? 'lowerThird' : 'title', builtInStyles[id])}>
        <AnimationPreview text={s.styleSample} animation={still} style={builtInStyles[id]} play={false} />
        <span title={s.styleNames[id]}>{s.styleNames[id]}</span>
      </button>)}
    </div>
  </section>;
}
