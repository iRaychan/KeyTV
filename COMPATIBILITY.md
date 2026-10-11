# IPTV-org browser compatibility report

Checked 11 October 2026 using the country playlist URLs supplied for Taiwan, China, Hong Kong, Malaysia, Singapore, Japan and South Korea.

## What KeyTV can fix

- Native and HLS.js playback for HTTPS HLS streams
- MPEG-DASH `.mpd` playback through dash.js
- HLS URLs whose format is expressed in a query or `manifest(format=m3u8...)`
- Missing or literal `Undefined` channel categories
- Clear identification of streams that declare special referrer or User-Agent requirements

## What a GitHub Pages app cannot fix

- HTTP video embedded in the HTTPS KeyTV page (browser mixed-content protection)
- Geo-blocking and HTTP 403 responses
- Expired or offline streams
- DRM, provider authentication, or unsupported media codecs
- Arbitrary Referrer/User-Agent headers forbidden to webpage JavaScript

## Playlist observations

| Playlist | HTTP streams | HTTPS streams | Notes |
|---|---:|---:|---|
| Taiwan | 15 | 10 | HTTP entries are blocked when KeyTV is hosted on HTTPS |
| China | 107 | 40 | Most entries are HTTP |
| Hong Kong | 9 | 9 | Pet Club is browser-friendly HTTPS; multiple HTTPS entries are labelled geo-blocked |
| Malaysia | 3 | 19 | Several entries require a referrer and/or are geo-blocked; includes DASH |
| Singapore | 3 | 10 | Includes DASH |
| Japan | 0 | 7 | All entries are HTTPS; includes DASH and special-header metadata |
| South Korea | 26 | 47 | Mix of HTTP, HTTPS, DASH and special-header entries |

KeyTV V1.03 labels these conditions and provides external-player handoff when browser playback is impossible.
