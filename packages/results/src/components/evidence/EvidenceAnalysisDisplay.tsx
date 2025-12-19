"use client";

import React, { useState, useEffect, useMemo, useCallback } from "react";

interface SearchQuery {
  query: string;
  reason: string;
  priority: "high" | "medium" | "low";
}

interface SearchResult {
  title: string;
  url: string;
  snippet: string;
  date: string;
  domain: string;
}

interface EvidenceAnalysisData {
  sufficiency_score: number;
  search_queries?: SearchQuery[];
  summary?: string;
}

interface EvidenceAnalysisProps {
  evidenceAnalysis: EvidenceAnalysisData | Record<string, any>;
  fieldName: string;
  isCompact?: boolean;
  projectId: string;
  showResults?: boolean;
  onToggleResults?: (show: boolean) => void;
  onImportComplete?: () => void;
  onRerun?: () => void;
  isReadOnly?: boolean; // Disable search/import for historical view
  getAccessToken: () => Promise<string | null>;
}

// Validate evidence analysis structure
const isValidEvidenceAnalysis = (analysis: unknown): boolean => {
  if (!analysis || typeof analysis !== "object") return false;
  const obj = analysis as any;
  return typeof obj.sufficiency_score === "number" && isFinite(obj.sufficiency_score);
};

const getTier = (score: number): "strong" | "adequate" | "weak" | "insufficient" => {
  if (score >= 90) return "strong";
  if (score >= 70) return "adequate";
  if (score >= 40) return "weak";
  return "insufficient";
};

interface TierConfig {
  label: string;
  color: string;
  bg: string;
  border: string;
  icon: React.ReactNode;
}

const DEFAULT_TIER_CONFIG: TierConfig = {
  label: "Weak evidence",
  color: "text-amber-600",
  bg: "bg-amber-50",
  border: "border-amber-200",
  icon: (
    <svg className="w-4 h-4" fill="none" stroke="currentColor" strokeWidth={2.5} viewBox="0 0 24 24">
      <path strokeLinecap="round" strokeLinejoin="round" d="M12 9v2m0 4h.01" />
    </svg>
  ),
};

const TIER_CONFIGS: { [key: string]: TierConfig } = {
  strong: {
    label: "Strong evidence",
    color: "text-emerald-600",
    bg: "bg-emerald-50",
    border: "border-emerald-200",
    icon: (
      <svg className="w-4 h-4" fill="none" stroke="currentColor" strokeWidth={2.5} viewBox="0 0 24 24">
        <path strokeLinecap="round" strokeLinejoin="round" d="M5 13l4 4L19 7" />
      </svg>
    ),
  },
  adequate: {
    label: "Adequate evidence",
    color: "text-emerald-600",
    bg: "bg-emerald-50",
    border: "border-emerald-200",
    icon: (
      <svg className="w-4 h-4" fill="none" stroke="currentColor" strokeWidth={2.5} viewBox="0 0 24 24">
        <path strokeLinecap="round" strokeLinejoin="round" d="M5 13l4 4L19 7" />
      </svg>
    ),
  },
  weak: DEFAULT_TIER_CONFIG,
  insufficient: {
    label: "Insufficient evidence",
    color: "text-red-500",
    bg: "bg-red-50",
    border: "border-red-200",
    icon: (
      <svg className="w-4 h-4" fill="none" stroke="currentColor" strokeWidth={2.5} viewBox="0 0 24 24">
        <path strokeLinecap="round" strokeLinejoin="round" d="M6 18L18 6M6 6l12 12" />
      </svg>
    ),
  },
};

const getTierConfig = (tier: string): TierConfig => {
  return TIER_CONFIGS[tier] || DEFAULT_TIER_CONFIG;
};

// Spinner
const Spinner = ({ size = "sm" }: { size?: "sm" | "md" }) => (
  <svg
    className={`animate-spin ${size === "sm" ? "w-3.5 h-3.5" : "w-4 h-4"}`}
    fill="none"
    viewBox="0 0 24 24"
  >
    <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
    <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z" />
  </svg>
);

// Single query row with inline results
const QueryRow = ({
  queryText,
  results,
  selectedUrls,
  importedUrls,
  isSearching,
  isImporting,
  onSearch,
  onQueryChange,
  onToggleUrl,
}: {
  queryText: string;
  results: SearchResult[];
  selectedUrls: Set<string>;
  importedUrls: Set<string>;
  isSearching: boolean;
  isImporting: boolean;
  onSearch: () => void;
  onQueryChange: (text: string) => void;
  onToggleUrl: (url: string) => void;
}) => {
  const hasResults = results.length > 0;

  return (
    <div className="group">
      {/* Query row */}
      <div className="flex items-center gap-3 py-2">
        <div className="flex-1 min-w-0">
          {hasResults ? (
            <p className="text-sm text-gray-700">{queryText}</p>
          ) : (
            <input
              type="text"
              value={queryText}
              onChange={(e) => onQueryChange(e.target.value)}
              disabled={isSearching}
              className="w-full text-sm text-gray-700 bg-transparent border-none outline-none focus:ring-0 p-0 placeholder-gray-400"
              placeholder="Search"
            />
          )}
        </div>
        <button
          onClick={onSearch}
          disabled={isSearching || isImporting || hasResults || !queryText.trim()}
          className={`flex-shrink-0 px-3 py-1 text-xs font-medium rounded-full transition-all ${
            hasResults
              ? "text-gray-400 bg-gray-100"
              : isSearching || isImporting || !queryText.trim()
              ? "text-gray-300 bg-gray-100"
              : "text-gray-600 bg-gray-100 hover:bg-gray-200 hover:text-gray-800 cursor-pointer"
          }`}
        >
          {isSearching ? (
            <span className="flex items-center gap-1.5">
              <Spinner size="sm" />
              <span>Searching</span>
            </span>
          ) : hasResults ? (
            <span className="flex items-center gap-1">
              <svg className="w-3 h-3 text-emerald-500" fill="none" stroke="currentColor" strokeWidth={2.5} viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" d="M5 13l4 4L19 7" />
              </svg>
              <span>{results.length} found</span>
            </span>
          ) : (
            "Search"
          )}
        </button>
      </div>

      {/* Results - appear inline below query */}
      {hasResults && (
        <div className="ml-0 mb-3 space-y-1">
          {results.map((result) => {
            const isSelected = selectedUrls.has(result.url);
            const isImported = importedUrls.has(result.url);
            const isThisImporting = isImporting && isSelected;

            return (
              <div
                key={result.url}
                onClick={() => !isImporting && !isImported && onToggleUrl(result.url)}
                className={`flex items-center gap-2.5 px-3 py-2 rounded-lg transition-all ${
                  isImported
                    ? "bg-emerald-50 border border-emerald-200"
                    : isThisImporting
                    ? "bg-accent/5 border border-accent/20"
                    : isImporting
                    ? "bg-gray-50 border border-gray-200 opacity-60"
                    : isSelected
                    ? "bg-accent/5 border border-accent/20 cursor-pointer"
                    : "bg-gray-50 border border-transparent hover:bg-gray-100 cursor-pointer"
                }`}
              >
                {/* Status indicator */}
                <div className="w-4 h-4 flex-shrink-0 flex items-center justify-center">
                  {isImported ? (
                    <svg className="w-4 h-4 text-emerald-500" fill="none" stroke="currentColor" strokeWidth={2.5} viewBox="0 0 24 24">
                      <path strokeLinecap="round" strokeLinejoin="round" d="M5 13l4 4L19 7" />
                    </svg>
                  ) : isThisImporting ? (
                    <Spinner size="sm" />
                  ) : (
                    <div
                      className={`w-4 h-4 rounded transition-colors ${
                        isSelected ? "bg-accent" : "bg-white border border-gray-300"
                      }`}
                    >
                      {isSelected && (
                        <svg className="w-full h-full text-white p-0.5" fill="currentColor" viewBox="0 0 20 20">
                          <path
                            fillRule="evenodd"
                            d="M16.707 5.293a1 1 0 010 1.414l-8 8a1 1 0 01-1.414 0l-4-4a1 1 0 011.414-1.414L8 12.586l7.293-7.293a1 1 0 011.414 0z"
                            clipRule="evenodd"
                          />
                        </svg>
                      )}
                    </div>
                  )}
                </div>

                {/* Content */}
                <div className="flex-1 min-w-0">
                  <p className={`text-sm truncate ${isImported ? "text-emerald-700" : "text-gray-800"}`}>
                    {result.title || result.url}
                  </p>
                  <p className={`text-xs truncate ${isImported ? "text-emerald-500" : "text-gray-400"}`}>
                    {isImported ? "Added to project" : result.domain}
                  </p>
                </div>

                {/* External link */}
                <a
                  href={result.url}
                  target="_blank"
                  rel="noopener noreferrer"
                  onClick={(e) => e.stopPropagation()}
                  className={`p-1 transition-colors flex-shrink-0 ${
                    isImported ? "text-emerald-400 hover:text-emerald-600" : "text-gray-300 hover:text-gray-500"
                  }`}
                >
                  <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path
                      strokeLinecap="round"
                      strokeLinejoin="round"
                      strokeWidth={2}
                      d="M10 6H6a2 2 0 00-2 2v10a2 2 0 002 2h10a2 2 0 002-2v-4M14 4h6m0 0v6m0-6L10 14"
                    />
                  </svg>
                </a>
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
};

export const EvidenceAnalysisDisplay: React.FC<EvidenceAnalysisProps> = ({
  evidenceAnalysis,
  projectId,
  showResults = true,
  onToggleResults,
  onImportComplete,
  onRerun,
  isReadOnly = false,
  getAccessToken,
}) => {
  const [isExpanded, setIsExpanded] = useState(false);
  const [searchingQueries, setSearchingQueries] = useState<Set<string>>(new Set());
  const [editedQueries, setEditedQueries] = useState<Map<number, string>>(new Map());
  const [searchResults, setSearchResults] = useState<Map<string, SearchResult[]>>(new Map());
  const [selectedUrls, setSelectedUrls] = useState<Set<string>>(new Set());
  const [isImporting, setIsImporting] = useState(false);
  const [importedUrls, setImportedUrls] = useState<Set<string>>(new Set());
  const [importedCount, setImportedCount] = useState(0);

  if (!isValidEvidenceAnalysis(evidenceAnalysis)) return null;

  const score = useMemo(() => {
    const s = evidenceAnalysis?.sufficiency_score || 0;
    return Math.max(0, Math.min(100, s));
  }, [evidenceAnalysis.sufficiency_score]);

  const tier = useMemo(() => getTier(score), [score]);
  const tierConfig = getTierConfig(tier);

  const searchQueries = useMemo(() => {
    const queries = evidenceAnalysis?.search_queries || [];
    if (!Array.isArray(queries)) return [];
    return queries.filter(
      (q) =>
        q &&
        typeof q === "object" &&
        typeof q.query === "string" &&
        ["high", "medium", "low"].includes(q.priority)
    );
  }, [evidenceAnalysis.search_queries]);

  // Auto-expand for poor scores (only if not read-only)
  useEffect(() => {
    if (score < 40 && searchQueries.length > 0 && !isReadOnly) {
      setIsExpanded(true);
    }
  }, [score, searchQueries.length, isReadOnly]);

  // Get the current text for a query (edited or original)
  const getQueryText = useCallback(
    (idx: number) => {
      return editedQueries.get(idx) ?? searchQueries[idx]?.query ?? "";
    },
    [editedQueries, searchQueries]
  );

  const handleSearch = useCallback(
    async (_idx: number, queryText: string) => {
      if (!queryText.trim()) return;
      setSearchingQueries((prev) => new Set(prev).add(queryText));
      try {
        const token = await getAccessToken();
        const res = await fetch("/api/web/search-urls", {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
            Authorization: `Bearer ${token}`,
          },
          body: JSON.stringify({ query: queryText, max_results: 5 }),
        });

        if (!res.ok) throw new Error("Search failed");

        const data = await res.json();
        if (data.success && data.results) {
          setSearchResults((prev) => new Map(prev).set(queryText, data.results));
        }
      } catch (err) {
        console.error("Search failed:", err);
      } finally {
        setSearchingQueries((prev) => {
          const next = new Set(prev);
          next.delete(queryText);
          return next;
        });
      }
    },
    [getAccessToken]
  );

  const handleSearchAll = useCallback(async () => {
    const unsearched = searchQueries
      .map((_, idx) => ({ idx, queryText: getQueryText(idx) }))
      .filter(({ queryText }) => !searchResults.has(queryText));

    await Promise.all(unsearched.map(({ idx, queryText }) => handleSearch(idx, queryText)));
  }, [searchQueries, searchResults, handleSearch, getQueryText]);

  const toggleUrl = useCallback((url: string) => {
    // Don't allow toggling while importing
    if (isImporting) return;
    setSelectedUrls((prev) => {
      const next = new Set(prev);
      next.has(url) ? next.delete(url) : next.add(url);
      return next;
    });
  }, [isImporting]);

  const handleImport = useCallback(async () => {
    if (isImporting || selectedUrls.size === 0 || !projectId) return;

    const urlsToImport = Array.from(selectedUrls);
    setIsImporting(true);
    const token = await getAccessToken();

    try {
      const res = await fetch("/api/web/crawl-urls", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${token}`,
        },
        body: JSON.stringify({ urls: urlsToImport, project_id: projectId }),
      });

      if (res.ok) {
        const data = await res.json();
        const successUrls = new Set<string>();

        for (const result of data.results || []) {
          if (result.status === "success") {
            successUrls.add(result.url);
          }
        }

        setImportedUrls((prev) => {
          const next = new Set(prev);
          successUrls.forEach((url) => next.add(url));
          return next;
        });
        setImportedCount((prev) => prev + successUrls.size);

        if (successUrls.size > 0 && onImportComplete) {
          onImportComplete();
        }
      }
    } catch (err) {
      console.error("Import failed:", err);
    }

    setIsImporting(false);
    setSelectedUrls(new Set());
  }, [isImporting, selectedUrls, projectId, getAccessToken, onImportComplete]);

  const totalResults = useMemo(() => {
    let count = 0;
    searchResults.forEach((r) => (count += r.length));
    return count;
  }, [searchResults]);

  const hasAnyResults = totalResults > 0;
  const unsearchedCount = searchQueries.filter((q) => !searchResults.has(q.query)).length;

  // Strong/adequate with no suggestions - just show status
  if ((tier === "strong" || tier === "adequate") && searchQueries.length === 0) {
    return (
      <div className={`inline-flex items-center gap-2 px-3 py-1.5 rounded-full ${tierConfig.bg}`}>
        <span className={tierConfig.color}>{tierConfig.icon}</span>
        <span className={`text-sm font-medium ${tierConfig.color}`}>{tierConfig.label}</span>
      </div>
    );
  }

  // In read-only mode, only "insufficient" can expand (has warning to show)
  const canExpand = !isReadOnly || tier === "insufficient";

  return (
    <div className="rounded-xl border border-gray-300 bg-white overflow-hidden">
      {/* Header */}
      <div
        onClick={() => canExpand && setIsExpanded(!isExpanded)}
        className={`w-full px-4 py-3 flex items-center justify-between transition-colors ${
          canExpand ? "hover:bg-gray-50 cursor-pointer" : ""
        }`}
      >
        <div className="flex items-center gap-3">
          <div className={`p-1 rounded-full ${tierConfig.bg}`}>
            <span className={tierConfig.color}>{tierConfig.icon}</span>
          </div>
          <span className="text-sm font-medium text-gray-800">{tierConfig.label}</span>
          {searchQueries.length > 0 && !hasAnyResults && !isReadOnly && (
            <span className="text-xs text-gray-400">
              {searchQueries.length} search{searchQueries.length !== 1 ? "es" : ""} suggested
            </span>
          )}
          {importedCount > 0 && (
            <span className="text-xs text-emerald-600 bg-emerald-50 px-2 py-0.5 rounded-full">
              {importedCount} imported
            </span>
          )}
        </div>
        {canExpand && (
          <svg
            className={`w-4 h-4 text-gray-400 transition-transform ${isExpanded ? "rotate-180" : ""}`}
            fill="none"
            stroke="currentColor"
            viewBox="0 0 24 24"
          >
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 9l-7 7-7-7" />
          </svg>
        )}
      </div>

      {/* Expanded content */}
      {isExpanded && (
        <div className="px-4 pb-4 border-t border-gray-100 cursor-default">
          {/* Poor evidence warning */}
          {tier === "insufficient" && (
            <div className="mt-3 p-3 bg-amber-50 rounded-lg">
              <div className="flex items-start gap-2">
                <svg
                  className="w-4 h-4 text-amber-500 mt-0.5 flex-shrink-0"
                  fill="none"
                  stroke="currentColor"
                  viewBox="0 0 24 24"
                >
                  <path
                    strokeLinecap="round"
                    strokeLinejoin="round"
                    strokeWidth={2}
                    d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-3L13.732 4c-.77-1.333-2.694-1.333-3.464 0L3.34 16c-.77 1.333.192 3 1.732 3z"
                  />
                </svg>
                <div className="flex-1">
                  <p className="text-sm text-amber-800">Results may be unreliable due to limited data.</p>
                  <label className="flex items-center gap-2 mt-2 cursor-pointer">
                    <input
                      type="checkbox"
                      checked={showResults}
                      onChange={(e) => onToggleResults?.(e.target.checked)}
                      className="w-3.5 h-3.5 rounded border-amber-300 text-amber-600 focus:ring-amber-500"
                    />
                    <span className="text-xs text-amber-700">Show results anyway</span>
                  </label>
                </div>
              </div>
            </div>
          )}

          {/* Search queries - hidden in read-only mode */}
          {searchQueries.length > 0 && !isReadOnly && (
            <div className="mt-3">
              {/* Header with search all */}
              <div className="flex items-center justify-between mb-2">
                <span className="text-xs font-medium text-gray-500 uppercase tracking-wide">
                  Suggested searches
                </span>
                {unsearchedCount > 1 && (
                  <button
                    onClick={handleSearchAll}
                    disabled={searchingQueries.size > 0 || isImporting}
                    className="text-xs text-accent hover:text-accent-600 font-medium disabled:opacity-50"
                  >
                    Search all ({unsearchedCount})
                  </button>
                )}
              </div>

              {/* Query list */}
              <div className="divide-y divide-gray-100">
                {searchQueries.map((_, idx) => {
                  const queryText = getQueryText(idx);
                  return (
                    <QueryRow
                      key={idx}
                      queryText={queryText}
                      results={searchResults.get(queryText) || []}
                      selectedUrls={selectedUrls}
                      importedUrls={importedUrls}
                      isSearching={searchingQueries.has(queryText)}
                      isImporting={isImporting}
                      onSearch={() => handleSearch(idx, queryText)}
                      onQueryChange={(text) =>
                        setEditedQueries((prev) => new Map(prev).set(idx, text))
                      }
                      onToggleUrl={toggleUrl}
                    />
                  );
                })}
              </div>
            </div>
          )}

          {/* Import action bar - appears when URLs selected, hidden in read-only mode */}
          {selectedUrls.size > 0 && !isImporting && !isReadOnly && (
            <div className="mt-4 flex items-center justify-between p-3 bg-gray-50 rounded-lg">
              <div className="flex items-center gap-3">
                <span className="text-sm text-gray-600">
                  {selectedUrls.size} selected
                </span>
                <button
                  onClick={() => setSelectedUrls(new Set())}
                  className="text-xs text-gray-400 hover:text-gray-600"
                >
                  Clear
                </button>
              </div>
              <button
                onClick={handleImport}
                disabled={isImporting}
                className="px-4 py-2 text-sm font-medium text-white bg-accent hover:bg-accent-600 rounded-lg transition-colors disabled:opacity-50 flex items-center gap-2"
              >
                <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path
                    strokeLinecap="round"
                    strokeLinejoin="round"
                    strokeWidth={2}
                    d="M4 16v1a3 3 0 003 3h10a3 3 0 003-3v-1m-4-8l-4-4m0 0L8 8m4-4v12"
                  />
                </svg>
                <span>Import</span>
              </button>
            </div>
          )}


          {/* Success message after import - hidden in read-only mode */}
          {importedCount > 0 && selectedUrls.size === 0 && !isImporting && !isReadOnly && (
            <div className="mt-4 p-3 bg-emerald-50 rounded-lg flex items-center gap-2">
              <svg className="w-4 h-4 text-emerald-600 flex-shrink-0" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7" />
              </svg>
              <p className="text-sm text-emerald-700">
                <button
                  onClick={onRerun}
                  className="underline hover:text-emerald-800 font-medium cursor-pointer"
                >
                  Re-run section
                </button>
                <span> to include new data</span>
              </p>
            </div>
          )}
        </div>
      )}
    </div>
  );
};
