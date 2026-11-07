import { presets } from './presets';
import { AnimationPreview } from './AnimationPreview';
import type { AnimationPhase } from './schema';
import { strings as s } from '../lib/strings';

export function Gallery() {
  return <main className="workspace">
    <h1>{s.gallery}</h1>
    {(['in', 'out', 'loop'] as AnimationPhase[]).map((phase) => <section key={phase} className="my-4">
      <h2>{s.animationPhases[phase]}</h2>
      <div className="cards">
        {presets[phase].map((id) => <article key={id} className="card card-open">
          <AnimationPreview text={s.gallerySample} animation={{ [phase]: { preset: id, duration: 0.9 } }} play />
          <span>{s.animationNames[id]}</span>
        </article>)}
      </div>
    </section>)}
  </main>;
}
