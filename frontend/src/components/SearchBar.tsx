import { useState, useRef, useEffect, useCallback } from "react";

interface SearchResult {
  label: string;
  lng: number;
  lat: number;
}

interface SearchBarProps {
  onSelect: (lng: number, lat: number, zoom: number) => void;
}

const NOMINATIM_URL = "https://nominatim.openstreetmap.org/search";

export default function SearchBar({ onSelect }: SearchBarProps) {
  const [query, setQuery] = useState("");
  const [results, setResults] = useState<SearchResult[]>([]);
  const [open, setOpen] = useState(false);
  const [loading, setLoading] = useState(false);
  const timerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const wrapRef = useRef<HTMLDivElement>(null);
  const abortRef = useRef<AbortController | null>(null);

  const search = useCallback(async (text: string) => {
    if (text.length < 2) {
      setResults([]);
      setOpen(false);
      return;
    }

    if (abortRef.current) abortRef.current.abort();
    const controller = new AbortController();
    abortRef.current = controller;

    setLoading(true);
    try {
      const params = new URLSearchParams({
        q: text,
        format: "json",
        countrycodes: "ch",
        limit: "6",
        addressdetails: "1",
      });
      const resp = await fetch(`${NOMINATIM_URL}?${params}`, {
        signal: controller.signal,
        headers: { "Accept-Language": "fr" },
      });
      if (!resp.ok) return;
      const data = await resp.json();

      const items: SearchResult[] = data
        .map((r: any) => ({
          label: r.display_name?.split(",").slice(0, 3).join(", ") || r.display_name,
          lng: parseFloat(r.lon),
          lat: parseFloat(r.lat),
        }))
        .filter((r: SearchResult) => !isNaN(r.lng) && !isNaN(r.lat));

      setResults(items);
      setOpen(items.length > 0);
    } catch (e: any) {
      if (e.name !== "AbortError") {
        console.warn("Search failed:", e);
        setResults([]);
      }
    } finally {
      setLoading(false);
    }
  }, []);

  const handleChange = (val: string) => {
    setQuery(val);
    if (timerRef.current) clearTimeout(timerRef.current);
    timerRef.current = setTimeout(() => search(val), 350);
  };

  const handleSelect = (r: SearchResult) => {
    setQuery(r.label);
    setOpen(false);
    setResults([]);
    onSelect(r.lng, r.lat, 15);
  };

  const pendingEnterRef = useRef(false);

  useEffect(() => {
    if (pendingEnterRef.current && results.length > 0) {
      pendingEnterRef.current = false;
      handleSelect(results[0]);
    }
  }, [results]);

  const handleKeyDownFull = async (e: React.KeyboardEvent) => {
    if (e.key !== "Enter") return;
    e.preventDefault();
    if (results.length > 0) {
      handleSelect(results[0]);
    } else if (query.length >= 2) {
      if (timerRef.current) clearTimeout(timerRef.current);
      pendingEnterRef.current = true;
      await search(query);
    }
  };

  useEffect(() => {
    const handler = (e: MouseEvent) => {
      if (wrapRef.current && !wrapRef.current.contains(e.target as Node)) {
        setOpen(false);
      }
    };
    document.addEventListener("mousedown", handler);
    return () => document.removeEventListener("mousedown", handler);
  }, []);

  return (
    <div className="search-bar-wrap" ref={wrapRef}>
      <div style={{ position: "relative" }}>
        <svg className="search-bar-icon" viewBox="0 0 20 20" width="16" height="16" fill="none" stroke="currentColor" strokeWidth="2">
          <circle cx="8.5" cy="8.5" r="5.5" />
          <line x1="13" y1="13" x2="18" y2="18" />
        </svg>
        <input
          className="search-bar-input"
          type="text"
          placeholder="Rechercher un lieu..."
          value={query}
          onChange={(e) => handleChange(e.target.value)}
          onKeyDown={handleKeyDownFull}
          onFocus={() => results.length > 0 && setOpen(true)}
        />
        {loading && <span className="search-bar-spinner" />}
      </div>
      {open && results.length > 0 && (
        <ul className="search-bar-results">
          {results.map((r, i) => (
            <li key={i} onClick={() => handleSelect(r)}>
              {r.label}
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
