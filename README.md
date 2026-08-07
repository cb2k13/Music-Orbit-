# Music Orbit — search and place albums on a globe

React + vanilla three.js + the iTunes Search API. Search for any album,
add it, and it lands as a textured tile on a rotating sphere — tiles are
spaced evenly using a Fibonacci-sphere distribution, so nothing pinches at
the poles.


## How it's structured

- `src/itunes.js` — searches the iTunes Search API and normalizes results
  into `{ id, title, artist, artworkUrl, trackCount }`. Artwork URLs are
  upscaled from iTunes' default 100x100 thumbnail to 600x600.
- `src/globe.js` — the three.js scene: Fibonacci-sphere tile placement,
  texture loading per album, raycasting for hover/click, drag-to-rotate,
  and an auto-rotate "tour" that spins around Y while oscillating a gentle
  tilt on X, so tiles near the poles drift into view too — not just the
  equatorial band. Dragging pauses the tour; it resumes automatically a
  few seconds after you let go.
- `src/App.jsx` — debounced live search, add/remove album handling,
  `localStorage` persistence, and the album detail panel that slides in on
  tile click.

## Notes on scaling up

This is tuned for a personal-sized collection (tens to low hundreds of
albums), one `PlaneGeometry` mesh per tile. If you want to support a much
larger library, swap the per-tile meshes in `globe.js` for a single
`THREE.InstancedMesh` with a texture atlas — individual draw calls per tile
will bottleneck well before a thousand albums.
