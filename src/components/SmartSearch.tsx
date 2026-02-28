import { useCallback, useEffect, useRef, useState } from 'react';
import type { TabGroup, SmartSearchResult } from '../lib/types';
import { runSmartSearch } from '../lib/smart-search';
import { SMART_SEARCH } from '../lib/constants';
import { SmartSearchResultItem } from './SmartSearchResultItem';

type SearchStatus = 'idle' | 'searching' | 'done';

interface SmartSearchProps {
  groups: TabGroup[];
  isAuthenticated: boolean;
  onOpenTab: (url: string) => void;
}

export function SmartSearch({ groups, isAuthenticated, onOpenTab }: SmartSearchProps) {
  const [query, setQuery] = useState('');
  const [results, setResults] = useState<SmartSearchResult[]>([]);
  const [status, setStatus] = useState<SearchStatus>('idle');
  const debounceRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  const runSearch = useCallback(async (q: string) => {
    setStatus('searching');
    const found = await runSmartSearch(q, groups);
    setResults(found ?? []);
    setStatus('done');
  }, [groups]);

  function handleQueryChange(q: string) {
    setQuery(q);
    if (debounceRef.current) clearTimeout(debounceRef.current);

    if (q.trim().length < SMART_SEARCH.MIN_QUERY_LENGTH) {
      setResults([]);
      setStatus('idle');
      return;
    }

    debounceRef.current = setTimeout(() => runSearch(q.trim()), SMART_SEARCH.DEBOUNCE_MS);
  }

  useEffect(() => {
    return () => {
      if (debounceRef.current) clearTimeout(debounceRef.current);
    };
  }, []);

  if (!isAuthenticated) {
    return (
      <div className="empty-state-card rounded-[14px] text-center">
        <div className="text-[34px] mb-3">🔒</div>
        <div className="empty-state-title text-[15px] font-semibold mb-[6px]">
          Sign in to use Smart Search
        </div>
        <div className="empty-state-text text-[13px]">
          Smart Search uses AI to find tabs by meaning — even when you don't remember the exact title.
        </div>
      </div>
    );
  }

  const hasQuery = query.trim().length >= SMART_SEARCH.MIN_QUERY_LENGTH;
  const hasResults = status === 'done' && results.length > 0;
  const isEmpty = status === 'done' && results.length === 0;

  return (
    <div className="flex flex-col gap-[14px]">
      {/* Input */}
      <div className="relative">
        <span className="absolute left-[15px] top-1/2 -translate-y-1/2 text-[var(--accent)] text-[16px] pointer-events-none select-none">
          ✦
        </span>
        <input
          type="text"
          className="search-input w-full rounded-[14px] border-[1.5px] border-[var(--accent)] py-[13px] pl-[46px] pr-[16px] text-[14px] text-[var(--text-primary)] outline-none transition-shadow"
          placeholder='Try "that article about productivity" or "where I read about React hooks"'
          value={query}
          onChange={(e) => handleQueryChange(e.target.value)}
          autoFocus
        />
      </div>

      {/* Searching indicator */}
      {status === 'searching' && (
        <div className="smart-search-status flex items-center gap-[8px]">
          <span className="categorization-spinner">&#10227;</span>
          <span>Searching with AI...</span>
        </div>
      )}

      {/* Results */}
      {hasResults && (
        <div className="flex flex-col gap-[6px]">
          {results.map((result) => (
            <SmartSearchResultItem
              key={result.tab.id}
              result={result}
              onOpen={onOpenTab}
            />
          ))}
        </div>
      )}

      {/* No results */}
      {isEmpty && hasQuery && (
        <div className="empty-state-card rounded-[14px] text-center">
          <div className="text-[34px] mb-3 opacity-45">🔍</div>
          <div className="empty-state-title text-[15px] font-semibold mb-[6px]">
            No matching tabs found
          </div>
          <div className="empty-state-text text-[13px]">
            Try describing what you remember about the page
          </div>
        </div>
      )}

      {/* Idle hint */}
      {status === 'idle' && (
        <div className="smart-search-idle text-center">
          <div className="empty-state-text text-[13px]">
            Describe what you're looking for in plain English
          </div>
        </div>
      )}
    </div>
  );
}
