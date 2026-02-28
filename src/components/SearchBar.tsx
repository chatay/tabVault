interface SearchBarProps {
  value: string;
  onChange: (value: string) => void;
  resultCount?: number;
  isSearching?: boolean;
}

export function SearchBar({ value, onChange, resultCount = 0, isSearching = false }: SearchBarProps) {
  return (
    <div className="relative">
      <span className="absolute left-[15px] top-1/2 -translate-y-1/2 text-[var(--accent)] text-[16px] pointer-events-none">
        🔍
      </span>
      <input
        type="text"
        className="search-input w-full rounded-[14px] border-[1.5px] border-[var(--accent)] py-[13px] pl-[46px] pr-[120px] text-[14px] text-[var(--text-primary)] outline-none transition-shadow"
        placeholder="Search tabs and URLs..."
        value={value}
        onChange={(e) => onChange(e.target.value)}
      />
      {value && (
        <button
          className={`search-clear-btn absolute top-1/2 -translate-y-1/2 w-[22px] h-[22px] rounded-full flex items-center justify-center text-[var(--text-muted)] text-[12px] cursor-pointer transition-colors hover:text-[var(--text-primary)] ${isSearching && resultCount > 0 ? 'with-badge' : ''}`}
          onClick={() => onChange('')}
          aria-label="Clear search"
        >
          ✕
        </button>
      )}
      {isSearching && resultCount > 0 && (
        <span className="search-result-count absolute right-[14px] top-1/2 -translate-y-1/2 text-[var(--accent)] text-[11px] font-semibold py-[3px] px-[9px] rounded-full whitespace-nowrap">
          {resultCount} {resultCount === 1 ? 'result' : 'results'}
        </span>
      )}
    </div>
  );
}
