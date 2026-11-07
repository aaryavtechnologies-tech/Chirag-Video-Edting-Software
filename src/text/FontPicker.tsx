import { useState } from 'react';
import { Star } from 'lucide-react';
import { Modal } from '../app/Modal';
import { strings as s } from '../lib/strings';
import { bundledFonts, fontGroups } from './fontCatalog';

function readFonts(key: string): string[] {
  try {
    const entries: unknown = JSON.parse(localStorage.getItem(key) ?? '[]');
    return Array.isArray(entries) ? entries.filter((font): font is string => typeof font === 'string') : [];
  } catch { return []; }
}

export function FontPicker({ text, select, close }: {
  text: string; select(family: string): void; close(): void;
}) {
  const [search, setSearch] = useState('');
  const [category, setCategory] = useState<keyof typeof fontGroups | 'all' | 'favourites' | 'recentlyUsed'>('all');
  const [favourites, setFavourites] = useState(() => readFonts('editor-font-favourites'));
  const recent = readFonts('editor-font-recent');
  const group = category === 'all' ? bundledFonts : category === 'favourites' ? favourites :
    category === 'recentlyUsed' ? recent : fontGroups[category];
  const categories = ['all', ...Object.keys(fontGroups), 'favourites', 'recentlyUsed'] as (typeof category)[];
  return <Modal title={s.chooseFont} close={close} busy={false}>
    <div className="grid gap-2 mt-3">
      <input autoFocus aria-label={s.fontSearch} value={search} onChange={(event) => setSearch(event.target.value)}
        placeholder={s.fontSearch} />
      <div className="flex flex-wrap gap-1">
        {categories.map((item) => <button key={item} aria-pressed={category === item} onClick={() => setCategory(item)}>{s[item]}</button>)}
      </div>
      <ul className="font-results">
        {group.filter((font) => font.toLowerCase().includes(search.trim().toLowerCase())).map((font) => <li key={font}>
          <button onClick={() => {
            localStorage.setItem('editor-font-recent', JSON.stringify([font, ...recent.filter((item) => item !== font)].slice(0, 12)));
            select(font);
            close();
          }}>
            <span>{font}</span><span className="font-sample" style={{ fontFamily: font }}>{text.trim() || s.styleSample}</span>
          </button>
          <button aria-label={s.favouriteFont + ' ' + font} aria-pressed={favourites.includes(font)} onClick={() => {
            const next = favourites.includes(font) ? favourites.filter((item) => item !== font) : [...favourites, font];
            setFavourites(next);
            localStorage.setItem('editor-font-favourites', JSON.stringify(next));
          }}><Star size={14} aria-hidden /></button>
        </li>)}
      </ul>
    </div>
  </Modal>;
}
