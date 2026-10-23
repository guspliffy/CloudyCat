# CloudyCat (Moth)

Calm 3D platform-puzzler about a small cloud cat. Producer and only playtester: Jonny.

- Read `docs/STATE.md` first, then `docs/CHARACTER.md` and `docs/concept.html`.
- Stack: TypeScript, Vite, Three.js, Rapier (`@dimforge/rapier3d-compat`). `npm run dev`, `npm run build`, `npm run build:single` (one HTML file in `dist-single/`).
- Feel numbers live in `src/tuning.ts`; `?dev` shows sliders, `?autostart` skips the start card.
- Design rules from Jonny: minimal, instantly clear UI; learn-by-doing lines of 8 words or fewer; no punishment, timers or failure; cute first (big eyes, soft shapes), cloud texture subtle.
- `study/`: the 3D look study. Edit `template.html` and `designs.mjs`; `index.html` is the built page.
