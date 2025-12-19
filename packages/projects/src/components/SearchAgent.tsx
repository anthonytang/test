"use client";

import { useState, useEffect } from "react";
import { useAuth } from "@studio/auth";
import { useNotifications } from "@studio/notifications";

interface SearchAgentProps {
  isOpen: boolean;
  onClose: () => void;
  selectedProjectId?: string;
  onCrawlComplete?: () => void | Promise<void>;
  onRefreshData?: () => void | Promise<void>;
}

interface SearchResult {
  title: string;
  url: string;
  snippet: string;
  date: string;
  domain: string;
}

export default function SearchAgent({
  isOpen,
  onClose,
  selectedProjectId,
  onCrawlComplete,
  onRefreshData,
}: SearchAgentProps) {
  const { getAccessToken } = useAuth();
  const { showSuccess, showError } = useNotifications();

  const [input, setInput] = useState("");
  const [isLoading, setIsLoading] = useState(false);
  const [results, setResults] = useState<SearchResult[]>([]);
  const [selected, setSelected] = useState<Set<string>>(new Set()); // URLs
  const [isImporting, setIsImporting] = useState(false);
  const [importedUrls, setImportedUrls] = useState<Set<string>>(new Set());
  const [completedCount, setCompletedCount] = useState(0);

  // Reset on open
  useEffect(() => {
    if (isOpen) {
      setInput("");
      setResults([]);
      setSelected(new Set());
      setIsLoading(false);
      setIsImporting(false);
      setImportedUrls(new Set());
      setCompletedCount(0);
    }
  }, [isOpen]);

  // Escape to close
  useEffect(() => {
    const handleEsc = (e: KeyboardEvent) => {
      if (e.key === "Escape" && isOpen && !isImporting) handleClose();
    };
    if (isOpen) {
      document.addEventListener("keydown", handleEsc);
      return () => document.removeEventListener("keydown", handleEsc);
    }
  }, [isOpen, isImporting]);

  const handleClose = async () => {
    if (isImporting) return;
    if (onRefreshData) await onRefreshData();
    onClose();
  };

  // Detect if input contains URLs (only if they have http:// or https://)
  const extractUrls = (text: string): string[] => {
    const lines = text.split(/[\n\s]+/).filter(Boolean);
    return lines.filter((line) => {
      if (!line.startsWith("http://") && !line.startsWith("https://")) {
        return false;
      }
      try {
        new URL(line);
        return true;
      } catch {
        return false;
      }
    });
  };

  const isUrlInput = extractUrls(input).length > 0;

  const handleSubmit = async () => {
    if (!input.trim()) return;

    const urls = extractUrls(input);

    if (urls.length > 0) {
      // Direct URL input - add to results
      const newResults = urls.map((url) => ({
        title: new URL(url).hostname,
        url: url,
        snippet: "",
        date: "",
        domain: new URL(url).hostname,
      }));
      setResults(newResults);
      setSelected(new Set()); // Don't auto-select
      setInput("");
    } else {
      // Search query
      try {
        setIsLoading(true);
        setResults([]);
        setSelected(new Set());

        const accessToken = await getAccessToken();
        const response = await fetch(`/api/web/search-urls`, {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
            Authorization: `Bearer ${accessToken}`,
          },
          body: JSON.stringify({ query: input.trim(), max_results: 20 }),
        });

        if (!response.ok) throw new Error("Search failed");

        const data = await response.json();
        if (data.success && data.results) {
          setResults(data.results);
          // Don't auto-select results
          setSelected(new Set());
        }
      } catch (error) {
        showError("Search Failed", error instanceof Error ? error.message : "Unknown error");
      } finally {
        setIsLoading(false);
      }
    }
  };

  const handleImport = async () => {
    if (selected.size === 0 || !selectedProjectId) return;

    setIsImporting(true);
    setCompletedCount(0);
    const urlsToImport = Array.from(selected);
    const accessToken = await getAccessToken();

    try {
      // Send all URLs in a single batch request
      const response = await fetch(`/api/web/crawl-urls`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${accessToken}`,
        },
        body: JSON.stringify({ urls: urlsToImport, project_id: selectedProjectId }),
      });

      if (response.ok) {
        const data = await response.json();

        // Process results
        const successUrls = new Set<string>();
        const failedUrls = new Set<string>();

        for (const result of data.results || []) {
          if (result.status === "success") {
            successUrls.add(result.url);
          } else {
            failedUrls.add(result.url);
          }
        }

        // Show notifications
        if (successUrls.size > 0) {
          showSuccess("Imported", `${successUrls.size} page${successUrls.size > 1 ? "s" : ""}`);
        }
        if (failedUrls.size > 0) {
          showError("Failed", `${failedUrls.size} page${failedUrls.size > 1 ? "s" : ""}`);
        }

        // Mark successful URLs as imported and clear from selection
        setImportedUrls((prev) => {
          const next = new Set(prev);
          successUrls.forEach((url) => next.add(url));
          return next;
        });
        setSelected((prev) => {
          const next = new Set(prev);
          successUrls.forEach((url) => next.delete(url));
          return next;
        });

        setCompletedCount((prev) => prev + successUrls.size);

        if (successUrls.size > 0) {
          if (onCrawlComplete) await onCrawlComplete();
          if (onRefreshData) await onRefreshData();
        }
      } else {
        showError("Import Failed", "Failed to import URLs");
      }
    } catch (error) {
      showError("Import Failed", error instanceof Error ? error.message : "Unknown error");
    }

    setIsImporting(false);
  };

  const toggle = (url: string) => {
    setSelected((prev) => {
      const next = new Set(prev);
      next.has(url) ? next.delete(url) : next.add(url);
      return next;
    });
  };

  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 bg-black/20 backdrop-blur-sm flex items-center justify-center z-50">
      <div className="bg-white rounded-xl w-full max-w-2xl max-h-[80vh] overflow-hidden shadow-xl flex flex-col">
        {/* Header */}
        <div className="px-5 py-4 border-b border-gray-100 flex items-center justify-between">
          <h2 className="text-lg font-medium text-gray-900">Import from Web</h2>
          <button
            onClick={handleClose}
            disabled={isImporting}
            className="text-gray-400 hover:text-gray-600 disabled:opacity-50"
          >
            <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
            </svg>
          </button>
        </div>

        {/* Input */}
        <div className="px-5 py-4 border-b border-gray-100">
          <div className="flex gap-2">
            <input
              type="text"
              value={input}
              onChange={(e) => setInput(e.target.value)}
              onKeyDown={(e) => e.key === "Enter" && !isLoading && handleSubmit()}
              placeholder="Search or paste URLs"
              className="flex-1 px-3 py-2 border border-gray-300 rounded-lg text-sm focus:outline-none focus:border-accent"
              disabled={isLoading || isImporting}
              autoFocus
            />
            <button
              onClick={handleSubmit}
              disabled={!input.trim() || isLoading || isImporting}
              className="px-4 py-2 bg-accent text-white rounded-lg text-sm font-medium hover:bg-accent-dark disabled:bg-gray-300 disabled:cursor-not-allowed flex items-center gap-2"
            >
              {isLoading ? (
                <svg className="w-4 h-4 animate-spin" fill="none" viewBox="0 0 24 24">
                  <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
                  <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z" />
                </svg>
              ) : (
                <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M14 5l7 7m0 0l-7 7m7-7H3" />
                </svg>
              )}
              {isUrlInput ? "Add" : "Search"}
            </button>
          </div>
        </div>

        {/* Results */}
        <div className="flex-1 overflow-y-auto">
          {results.length > 0 ? (
            <div className="divide-y divide-gray-100">
              {results.map((r) => {
                const isSelected = selected.has(r.url);
                const isImported = importedUrls.has(r.url);
                const isThisImporting = isImporting && isSelected;

                return (
                  <div
                    key={r.url}
                    onClick={() => !isImporting && !isImported && toggle(r.url)}
                    className={`px-5 py-3 flex items-center gap-3 transition-all ${
                      isImported
                        ? "bg-emerald-50"
                        : isThisImporting
                        ? "bg-accent/5"
                        : isImporting
                        ? "opacity-40"
                        : "cursor-pointer hover:bg-gray-50"
                    }`}
                  >
                    {isImported ? (
                      <svg className="w-4 h-4 text-emerald-500 flex-shrink-0" fill="none" stroke="currentColor" strokeWidth={2.5} viewBox="0 0 24 24">
                        <path strokeLinecap="round" strokeLinejoin="round" d="M5 13l4 4L19 7" />
                      </svg>
                    ) : isThisImporting ? (
                      <svg className="w-4 h-4 animate-spin text-accent flex-shrink-0" fill="none" viewBox="0 0 24 24">
                        <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
                        <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z" />
                      </svg>
                    ) : (
                      <div
                        className={`w-4 h-4 rounded border-2 flex-shrink-0 flex items-center justify-center ${
                          isSelected ? "bg-accent border-accent" : "border-gray-300"
                        }`}
                      >
                        {isSelected && (
                          <svg className="w-2.5 h-2.5 text-white" fill="currentColor" viewBox="0 0 20 20">
                            <path fillRule="evenodd" d="M16.707 5.293a1 1 0 010 1.414l-8 8a1 1 0 01-1.414 0l-4-4a1 1 0 011.414-1.414L8 12.586l7.293-7.293a1 1 0 011.414 0z" clipRule="evenodd" />
                          </svg>
                        )}
                      </div>
                    )}
                    <div className="flex-1 min-w-0">
                      <p className={`text-sm truncate ${isImported ? "text-emerald-700" : "text-gray-900"}`}>
                        {r.title || r.domain}
                      </p>
                      <p className={`text-xs truncate ${isImported ? "text-emerald-500" : "text-gray-400"}`}>
                        {isImported ? "Added to project" : r.domain}
                      </p>
                    </div>
                    <button
                      onClick={(e) => {
                        e.stopPropagation();
                        window.open(r.url, "_blank");
                      }}
                      className={`p-1.5 hover:bg-gray-100 rounded transition-colors flex-shrink-0 ${
                        isImported ? "text-emerald-400 hover:text-emerald-600" : "text-gray-400 hover:text-gray-600"
                      }`}
                      title="Open in new tab"
                    >
                      <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M10 6H6a2 2 0 00-2 2v10a2 2 0 002 2h10a2 2 0 002-2v-4M14 4h6m0 0v6m0-6L10 14" />
                      </svg>
                    </button>
                  </div>
                );
              })}
            </div>
          ) : (
            <div className="flex items-center justify-center h-48 text-gray-400 text-sm">
              {isLoading ? "Searching" : "Search for content or paste URLs"}
            </div>
          )}
        </div>

        {/* Footer */}
        {results.length > 0 && (
          <div className="px-5 py-3 border-t border-gray-100 flex items-center justify-between bg-gray-50">
            <div className="flex items-center gap-3">
              {!isImporting && selected.size > 0 && (
                <>
                  <span className="text-sm text-gray-600">
                    {selected.size} selected
                  </span>
                  <button
                    onClick={() => setSelected(new Set())}
                    className="text-xs text-gray-400 hover:text-gray-600"
                  >
                    Clear
                  </button>
                </>
              )}
              {!isImporting && selected.size === 0 && results.some((r) => !importedUrls.has(r.url)) && (
                <button
                  onClick={() => setSelected(new Set(results.filter((r) => !importedUrls.has(r.url)).map((r) => r.url)))}
                  className="text-xs text-gray-400 hover:text-gray-600"
                >
                  Select all
                </button>
              )}
            </div>
            <button
              onClick={handleImport}
              disabled={selected.size === 0 || isImporting}
              className="px-4 py-2 bg-accent text-white rounded-lg text-sm font-medium hover:bg-accent-dark disabled:bg-gray-300 disabled:cursor-not-allowed flex items-center gap-2"
            >
              {isImporting ? (
                <>
                  <svg className="w-4 h-4 animate-spin" fill="none" viewBox="0 0 24 24">
                    <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
                    <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z" />
                  </svg>
                  Importing
                </>
              ) : (
                <>Import {selected.size}</>
              )}
            </button>
          </div>
        )}
      </div>
    </div>
  );
}
