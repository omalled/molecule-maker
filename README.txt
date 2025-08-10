
# Molecule Maker (PWA)

A kid-friendly, tappable periodic table that lets you build simple molecules and see the chemical formula, molar mass, and a *very rough* plausibility check (covalent or ionic).

## How to use on iPad
1. Host these files somewhere HTTPS (GitHub Pages works well).
2. Open `index.html` in Safari.
3. Tap the Share button → **Add to Home Screen** to install it like an app. It works offline after first load.

## Notes
- Tap tiles to add atoms. Use **Undo** or **Clear** in the footer.
- Long-press any element tile to see a quick kid-friendly fact.
- **Ionic mode** tries to balance charges using typical valences.
- **Example** fills in a common molecule to explore.
- The periodic table includes a curated set of elements to keep it simple. You can add more by editing `elements.json`.

## Dev
It's all static; no build step. Edit `elements.json` to add more elements or adjust valence heuristics in `app.js`.
