# Upgrade patch notes: V1.00 → V1.01

The original V1.00 source ZIP was not available in this workspace, so this package is a clean, drop-in replacement rather than a line-by-line patch against the old files.

To apply it as an upgrade, replace the V1.00 web files with:

- `index.html`
- `styles.css`
- `app.js`
- `manifest.webmanifest`
- `sw.js`
- `assets/keytv-icon.svg`

No server or build step is required. Browser-local saved data is left untouched. V1.01 uses new namespaced keys for its playlist collection and retains the V1.00 favourites key.
