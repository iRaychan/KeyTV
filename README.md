# KeyTV V1.00

Safari-friendly IPTV / local video PWA. No playlist or streams are bundled.

## Deploy
Upload the **contents** of this folder to a GitHub Pages repository root, or upload the folder and configure Pages to serve it. Enable HTTPS. Open the Pages URL on iPhone Safari, tap Share > Add to Home Screen.

## Features
M3U/M3U8 playlist import from URL or file; categories; search; favourites; saved playlists; local file playback; XMLTV EPG URL; fullscreen; offline app shell.

## Limitations
- Safari supports HLS (.m3u8) natively when the server and codec are compatible. Other stream protocols, DRM, unsupported codecs, or browser-restricted HTTP/CORS streams may fail.
- An M3U playlist file is different from a single HLS .m3u8 stream manifest; importing a bare HLS media manifest is not a channel list.
- XMLTV EPG URLs must allow CORS, be uncompressed XML, and have matching `tvg-id` values. Large feeds can be memory intensive.
- Browser localStorage may be cleared by iOS; reimport playlists if needed.
- Offline mode caches only app files, not video streams.
- Use streams you are authorized to access.
