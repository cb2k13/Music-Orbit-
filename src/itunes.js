// iTunes Search API: free, no API key, no auth, CORS-enabled. Good fit for
// a fully client-side app with no backend.
//
// Docs: https://developer.apple.com/library/archive/documentation/AudioVideo/Conceptual/iTuneSearchAPI/

const SEARCH_ENDPOINT = 'https://itunes.apple.com/search';
const LOOKUP_ENDPOINT = 'https://itunes.apple.com/lookup';

// iTunes gives back a 100x100 artwork URL by default; the URL is templated
// so we can just swap the size segment for a sharper tile texture.
function upscaleArtwork(url, size = 600) {
  if (!url) return null;
  return url.replace(/\/\d+x\d+bb\.(jpg|png)$/, `/${size}x${size}bb.$1`);
}

function normalize(result) {
  return {
    // iTunes collection IDs are unique per album, good as a stable id.
    id: String(result.collectionId),
    title: result.collectionName,
    artist: result.artistName,
    trackCount: result.trackCount ?? null,
    artworkUrl: upscaleArtwork(result.artworkUrl100),
    viewUrl: result.collectionViewUrl ?? null
  };
}

// Searches for albums matching a free-text query. Aborts a stale in-flight
// request when `signal` fires, so callers can debounce cleanly.
export async function searchAlbums(query, { limit = 12, signal } = {}) {
  const trimmed = query.trim();
  if (!trimmed) return [];

  const params = new URLSearchParams({
    term: trimmed,
    entity: 'album',
    limit: String(limit)
  });

  const response = await fetch(`${SEARCH_ENDPOINT}?${params.toString()}`, { signal });
  if (!response.ok) {
    throw new Error(`Search failed (${response.status})`);
  }

  const data = await response.json();
  return data.results.filter((r) => r.artworkUrl100).map(normalize);
}

// Resolves a list of iTunes collection IDs back into full album data — used
// to reconstruct someone else's globe from a shared link, since the link
// only carries IDs, not the album details themselves.
export async function lookupAlbums(ids) {
  if (!ids.length) return [];

  const params = new URLSearchParams({ id: ids.join(',') });
  const response = await fetch(`${LOOKUP_ENDPOINT}?${params.toString()}`);
  if (!response.ok) {
    throw new Error(`Lookup failed (${response.status})`);
  }

  const data = await response.json();
  return data.results
    .filter((r) => r.wrapperType === 'collection' && r.artworkUrl100)
    .map(normalize);
}

