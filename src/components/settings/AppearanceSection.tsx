'use client';

import { useAppearanceStore, ThemeId, MessageDensity } from '@/store/appearance';

const THEMES: { id: ThemeId; name: string; swatches: string[]; description: string }[] = [
  {
    id: 'lc-default',
    name: 'La Crypta',
    description: 'Tema oficial: fondo negro, acento lima.',
    swatches: ['#0a0a0a', '#171717', '#b4f953'],
  },
];

const DENSITIES: { id: MessageDensity; name: string; description: string }[] = [
  { id: 'cozy', name: 'Cómoda', description: 'Más espacio entre mensajes (por defecto).' },
  { id: 'compact', name: 'Compacta', description: 'Más mensajes a la vista (próximamente).' },
];

export default function AppearanceSection() {
  const theme = useAppearanceStore((s) => s.theme);
  const density = useAppearanceStore((s) => s.density);
  const reducedMotion = useAppearanceStore((s) => s.reducedMotion);
  const setTheme = useAppearanceStore((s) => s.setTheme);
  const setDensity = useAppearanceStore((s) => s.setDensity);
  const setReducedMotion = useAppearanceStore((s) => s.setReducedMotion);

  return (
    <div className="space-y-6">
      <div>
        <h2 className="text-lc-white text-xl font-semibold">Apariencia</h2>
        <p className="text-sm text-lc-muted mt-1">
          Preferencias visuales. Más temas y opciones de renderizado llegarán pronto.
        </p>
      </div>

      <section className="lc-card p-5 space-y-4">
        <h3 className="text-sm font-semibold text-lc-white">Tema</h3>
        <div className="grid gap-3 sm:grid-cols-2">
          {THEMES.map((t) => (
            <button
              key={t.id}
              onClick={() => setTheme(t.id)}
              className={`text-left p-4 rounded-xl border transition-colors ${
                theme === t.id ? 'border-lc-green bg-lc-green/10' : 'border-lc-border hover:bg-lc-border/30'
              }`}
              data-testid={`theme-${t.id}`}
            >
              <div className="flex gap-1.5 mb-2">
                {t.swatches.map((c) => (
                  <span key={c} className="w-6 h-6 rounded-full border border-lc-border" style={{ background: c }} />
                ))}
              </div>
              <div className="text-sm font-semibold text-lc-white">{t.name}</div>
              <div className="text-xs text-lc-muted mt-0.5">{t.description}</div>
            </button>
          ))}
          <div className="p-4 rounded-xl border border-dashed border-lc-border text-xs text-lc-muted flex items-center justify-center">
            Más temas próximamente
          </div>
        </div>
      </section>

      <section className="lc-card p-5 space-y-3">
        <h3 className="text-sm font-semibold text-lc-white">Densidad de mensajes</h3>
        <div className="grid gap-2">
          {DENSITIES.map((d) => (
            <label
              key={d.id}
              className={`flex items-start gap-3 p-3 rounded-xl border cursor-pointer transition-colors ${
                density === d.id ? 'border-lc-green bg-lc-green/10' : 'border-lc-border hover:bg-lc-border/30'
              }`}
            >
              <input
                type="radio"
                className="mt-1 accent-lc-green"
                checked={density === d.id}
                onChange={() => setDensity(d.id)}
                name="density"
              />
              <div>
                <div className="text-sm text-lc-white">{d.name}</div>
                <div className="text-xs text-lc-muted">{d.description}</div>
              </div>
            </label>
          ))}
        </div>
      </section>

      <section className="lc-card p-5 flex items-center justify-between">
        <div>
          <h3 className="text-sm font-semibold text-lc-white">Reducir animaciones</h3>
          <p className="text-xs text-lc-muted">Útil si preferís menos movimiento en la interfaz.</p>
        </div>
        <button
          role="switch"
          aria-checked={reducedMotion}
          onClick={() => setReducedMotion(!reducedMotion)}
          className={`w-11 h-6 rounded-full border transition-colors relative ${
            reducedMotion ? 'bg-lc-green border-lc-green' : 'bg-lc-black border-lc-border'
          }`}
        >
          <span
            className={`absolute top-0.5 w-5 h-5 rounded-full bg-lc-white transition-transform ${
              reducedMotion ? 'translate-x-5' : 'translate-x-0.5'
            }`}
          />
        </button>
      </section>
    </div>
  );
}
