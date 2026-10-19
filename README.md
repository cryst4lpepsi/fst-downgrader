# FST Downgrader

Converts FL Studio presets (`.fst`) saved in FL Studio 24 or 25 so they open in **FL Studio 21.2.3**.

Open `index.html` in a browser and drop presets onto it. Conversion happens entirely in the browser; nothing is uploaded.

## What it changes

- Rewrites the version string and build number to `21.2.3.4004`.
- Removes data fields FL 21 doesn't know about (for example event 169, added in FL 24), which cause "Project file contains invalid data".
- Relabels Fruity Wrapper (VST) state from v12 to v10 when its layout matches FL 21.
- Relabels Parametric EQ 2 settings from v8 (FL 24+) to v7. The layout is the same, but FL 21 crashes on the v8 label.

Presets already made in 21.2.3 or older are left unchanged. Plugins that don't exist in FL 21 are flagged, and other plugins whose saved settings are newer than FL 21's get a warning, because they may not keep all of their settings.

## Files

- `fst-core.js`: the converter (works in the browser and in Node).
- `index.html`: the app.
- `test/`: Node tests and sample presets. Run them with `npm test` (Node 18+).
