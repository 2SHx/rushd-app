'use client';

import { useState, useEffect, useRef } from 'react';
import { useTranslations } from 'next-intl';
import { Search, Loader2, AlertCircle } from 'lucide-react';

interface StockSearchProps {
  market: 'TASI' | 'NASDAQ';
  onSearchResults: (results: any[] | null) => void;
  onSearchingChange: (searching: boolean) => void;
}

export default function StockSearch({ market, onSearchResults, onSearchingChange }: StockSearchProps) {
  const t = useTranslations('Markets');
  const [query, setQuery] = useState('');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  
  const searchTimeoutRef = useRef<NodeJS.Timeout | null>(null);

  useEffect(() => {
    // Reset query on market change
    setQuery('');
    onSearchResults(null);
    setError(null);
  }, [market, onSearchResults]);

  const handleSearch = async (val: string) => {
    setQuery(val);
    
    if (searchTimeoutRef.current) {
      clearTimeout(searchTimeoutRef.current);
    }

    if (val.trim().length === 0) {
      onSearchResults(null);
      setLoading(false);
      onSearchingChange(false);
      return;
    }

    setLoading(true);
    onSearchingChange(true);
    setError(null);

    searchTimeoutRef.current = setTimeout(async () => {
      try {
        const res = await fetch(`/api/stocks/search?q=${encodeURIComponent(val)}&market=${market}`);
        if (!res.ok) {
          throw new Error('Search request failed');
        }
        const data = await res.json();
        onSearchResults(data.results || []);
      } catch (err) {
        console.error('Stock search error:', err);
        setError(t('searchError'));
        onSearchResults([]);
      } finally {
        setLoading(false);
        onSearchingChange(false);
      }
    }, 250); // 250ms debounce
  };

  return (
    <div className="space-y-2">
      <div className="relative">
        <Search className="w-4 h-4 text-foreground/40 absolute start-4 top-1/2 -translate-y-1/2" />
        <input
          type="text"
          value={query}
          onChange={(e) => handleSearch(e.target.value)}
          placeholder={t('searchPlaceholder')}
          className="w-full bg-surface-raised border border-[var(--border-color)] focus:border-accent/40 rounded-xl py-2.5 ps-11 pe-4 text-sm text-foreground placeholder:text-foreground/40 outline-none transition-colors"
        />
        {loading && (
          <div className="absolute end-4 top-1/2 -translate-y-1/2">
            <Loader2 className="w-4 h-4 text-accent animate-spin" />
          </div>
        )}
      </div>

      {error && (
        <div className="flex items-center gap-2 text-down text-xs px-2">
          <AlertCircle className="w-4 h-4" />
          <span>{error}</span>
        </div>
      )}
    </div>
  );
}
