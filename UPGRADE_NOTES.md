# Upgrade patch notes: V1.02 → V1.03

V1.03 keeps the V1.02 playlist manager, native Safari playback and external-player handoff tools. It adds MPEG-DASH support, an optional HLS compatibility mode and precise browser-restriction diagnostics.

To apply it as an upgrade, replace the V1.02 web files with:

- `index.html`
- `styles.css`
- `app.js`
- `manifest.webmanifest`
- `sw.js`
- `assets/keytv-icon.svg`

No server or build step is required. Browser-local playlists and favourites are left untouched.
