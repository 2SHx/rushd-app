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
        <Search className="w-5 h-5 text-gray-500 absolute left-4 top-3.5 rtl:left-auto rtl:right-4" />
        <input
          type="text"
          value={query}
          onChange={(e) => handleSearch(e.target.value)}
          placeholder={t('searchPlaceholder')}
          className="w-full bg-[#121824] border border-white/5 focus:border-emerald-500/30 rounded-2xl py-3 pl-12 pr-4 rtl:pl-4 rtl:pr-12 text-sm text-white placeholder-gray-500 outline-none transition-all"
        />
        {loading && (
          <div className="absolute right-4 top-3.5 rtl:right-auto rtl:left-4">
            <Loader2 className="w-5 h-5 text-emerald-400 animate-spin" />
          </div>
        )}
      </div>
      
      {error && (
        <div className="flex items-center space-x-2 rtl:space-x-reverse text-rose-400 text-xs px-2">
          <AlertCircle className="w-4 h-4" />
          <span>{error}</span>
        </div>
      )}
    </div>
  );
}
