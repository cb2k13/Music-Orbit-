import { useEffect, useRef, useState, useCallback } from 'react';
import { searchAlbums, lookupAlbums } from './itunes';
import { AlbumGlobe } from './globe';

const STORAGE_KEY = 'orbit.library';
const SEARCH_DEBOUNCE_MS = 350;
const SHARE_COPIED_MS = 2000;

function loadStoredLibrary() {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    return raw ? JSON.parse(raw) : [];
  } catch {
    return [];
  }
}

function getShareIdsFromUrl() {
  const raw = new URLSearchParams(window.location.search).get('share');
  if (!raw) return null;
  const ids = raw.split(',').map((s) => s.trim()).filter(Boolean);
  return ids.length ? ids : null;
}

function clearShareParam() {
  const url = new URL(window.location.href);
  url.searchParams.delete('share');
  window.history.replaceState({}, '', url.toString());
}

export default function App() {
  const canvasRef = useRef(null);
  const globeRef = useRef(null);
  const debounceRef = useRef(null);
  const abortRef = useRef(null);
  const [mode, setMode] = useState(() => (getShareIdsFromUrl() ? 'preview' : 'own'));
  const [albums, setAlbums] = useState(() => (getShareIdsFromUrl() ? [] : loadStoredLibrary()));
  const [previewLoading, setPreviewLoading] = useState(mode === 'preview');
  const [previewError, setPreviewError] = useState(null);

  const [selectedAlbum, setSelectedAlbum] = useState(null);
  const [shareCopied, setShareCopied] = useState(false);

  const [query, setQuery] = useState('');
  const [results, setResults] = useState([]);
  const [isSearching, setIsSearching] = useState(false);
  const [searchError, setSearchError] = useState(null);

  // Resolve a shared link's album IDs into full album data on first load.
  useEffect(() => {
    if (mode !== 'preview') return;
    const ids = getShareIdsFromUrl();
    if (!ids) return;

    (async () => {
      try {
        const found = await lookupAlbums(ids);
        setAlbums(found);
      } catch {
        setPreviewError("Couldn't load this shared globe — the link may be broken.");
      } finally {
        setPreviewLoading(false);
      }
    })();
  }, [mode]);

  // Initialize the globe once we have a blank canvas, keep it alive across renders.
  useEffect(() => {
    if (!canvasRef.current || globeRef.current) return;
    const globe = new AlbumGlobe(canvasRef.current);
    globe.onTileClick = (album) => setSelectedAlbum(album);
    globeRef.current = globe;
    return () => globe.dispose();
  }, []);

  // Push the current library to the globe whenever it changes. Only persist
  // to localStorage while editing your own library and never overwrite it
  // with someone else's shared globe just because you're previewing it.
  useEffect(() => {
    globeRef.current?.loadAlbums(albums);
    if (mode === 'own') {
      localStorage.setItem(STORAGE_KEY, JSON.stringify(albums));
    }
  }, [albums, mode]);

  // Debounced live search against the iTunes Search API.
  useEffect(() => {
    clearTimeout(debounceRef.current);
    abortRef.current?.abort();

    if (!query.trim()) {
      setResults([]);
      setIsSearching(false);
      setSearchError(null);
      return;
    }

    setIsSearching(true);
    debounceRef.current = setTimeout(async () => {
      const controller = new AbortController();
      abortRef.current = controller;
      try {
        const found = await searchAlbums(query, { signal: controller.signal });
        setResults(found);
        setSearchError(null);
      } catch (err) {
        if (err.name !== 'AbortError') setSearchError('Search failed — try again.');
      } finally {
        setIsSearching(false);
      }
    }, SEARCH_DEBOUNCE_MS);

    return () => clearTimeout(debounceRef.current);
  }, [query]);

  const addAlbum = useCallback((album) => {
    setAlbums((prev) => (prev.some((a) => a.id === album.id) ? prev : [...prev, album]));
  }, []);

  const removeAlbum = useCallback((albumId) => {
    setAlbums((prev) => prev.filter((a) => a.id !== albumId));
    setSelectedAlbum((current) => (current?.id === albumId ? null : current));
  }, []);

  const handleShare = useCallback(async () => {
    const url = new URL(window.location.href);
    url.search = '';
    url.searchParams.set('share', albums.map((a) => a.id).join(','));

    try {
      await navigator.clipboard.writeText(url.toString());
      setShareCopied(true);
      setTimeout(() => setShareCopied(false), SHARE_COPIED_MS);
    } catch {
      window.prompt('Copy this link to share your globe:', url.toString());
    }
  }, [albums]);

  const saveSharedToLibrary = useCallback(() => {
    const stored = loadStoredLibrary();
    const merged = [...stored];
    for (const album of albums) {
      if (!merged.some((a) => a.id === album.id)) merged.push(album);
    }
    localStorage.setItem(STORAGE_KEY, JSON.stringify(merged));
    clearShareParam();
    setMode('own');
    setAlbums(merged);
  }, [albums]);

  const exploreOwnInstead = useCallback(() => {
    clearShareParam();
    setMode('own');
    setAlbums(loadStoredLibrary());
  }, []);

  const isOwn = mode === 'own';
  const isPreview = mode === 'preview';

  return (
    <div className="app">
      <canvas ref={canvasRef} className="globe-canvas" />

      <header className="topbar">
        <div className="brand">
          <span className="brand-mark" aria-hidden="true" />
          Music Orbit
        </div>
        <div className="topbar-right">
          {albums.length > 0 && (
            <span className="catalog-count">{albums.length.toString().padStart(3, '0')} albums charted</span>
          )}
          {isOwn && albums.length > 0 && (
            <button className="share-button" onClick={handleShare}>
              {shareCopied ? 'Link copied' : 'Share globe'}
            </button>
          )}
        </div>
      </header>
      {isPreview && !previewLoading && !previewError && (
        <div className="preview-banner">
          <span>You're viewing a shared globe.</span>
          <div className="preview-banner-actions">
            <button className="preview-action preview-action--primary" onClick={saveSharedToLibrary}>
              Save to my globe
            </button>
            <button className="preview-action" onClick={exploreOwnInstead}>
              Start my own instead
            </button>
          </div>
        </div>
      )}

      {isOwn && (
        <div className="search-panel">
          <input
            className="search-input"
            type="text"
            placeholder="Search for an album to add…"
            value={query}
            onChange={(e) => setQuery(e.target.value)}
          />

          {(isSearching || results.length > 0 || searchError) && (
            <div className="search-results">
              {isSearching && <div className="search-status">Searching…</div>}
              {searchError && <div className="search-status search-status--error">{searchError}</div>}
              {!isSearching &&
                results.map((album) => {
                  const alreadyAdded = albums.some((a) => a.id === album.id);
                  return (
                    <button
                      key={album.id}
                      className="search-result"
                      onClick={() => addAlbum(album)}
                      disabled={alreadyAdded}
                    >
                      <img src={album.artworkUrl} alt="" className="search-result-art" />
                      <span className="search-result-text">
                        <span className="search-result-title">{album.title}</span>
                        <span className="search-result-artist">{album.artist}</span>
                      </span>
                      <span className="search-result-action">{alreadyAdded ? 'Added' : 'Add'}</span>
                    </button>
                  );
                })}
            </div>
          )}
        </div>
      )}
     
      {isPreview && previewLoading && (
        <div className="overlay-center">
          <div className="intro-card">
            <p className="eyebrow">Loading shared globe…</p>
            <div className="loader-bar" />
          </div>
        </div>
      )}

      {isPreview && previewError && (
        <div className="overlay-center">
          <div className="intro-card">
            <p className="eyebrow eyebrow--error">Couldn't load this globe</p>
            <h1>{previewError}</h1>
            <button className="primary-button" onClick={exploreOwnInstead}>
              Start my own instead
            </button>
          </div>
        </div>
      )}

      {isOwn && albums.length === 0 && (
        <div className="overlay-center">
          <div className="intro-card">
            <p className="eyebrow">Your library, mapped</p>
            <h1>Search for an album to start your globe.</h1>
            <p className="body-text">
              Every album you add gets placed as a tile on a rotating sphere. Begin your journey now.
            </p>
          </div>
        </div>
      )}

      {selectedAlbum && (
        <aside className="detail-panel" role="dialog" aria-label={selectedAlbum.title}>
          <button className="close-button" onClick={() => setSelectedAlbum(null)} aria-label="Close">
            &times;
          </button>
          <img className="detail-artwork" src={selectedAlbum.artworkUrl} alt={selectedAlbum.title} />
          <p className="detail-catalog">
            No. {(albums.findIndex((a) => a.id === selectedAlbum.id) + 1).toString().padStart(3, '0')} / {albums.length}
          </p>
          <h2 className="detail-title">{selectedAlbum.title}</h2>
          <p className="detail-artist">{selectedAlbum.artist}</p>
          {selectedAlbum.trackCount && <p className="detail-meta">{selectedAlbum.trackCount} tracks</p>}
          {isOwn && (
            <button className="remove-button" onClick={() => removeAlbum(selectedAlbum.id)}>
              Remove from globe
            </button>
          )}
        </aside>
      )}
    </div>
  );
}
