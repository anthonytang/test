import { useState, useEffect, useRef } from "react";
import { useAuth } from "@studio/auth";

interface SearchUser {
  id: string;
  email: string;
  name: string;
  avatar_url?: string;
  is_active: boolean;
}

export function useUserSearch(
  _projectId: string,
  excludeUserIds: string[] = []
) {
  const { getAccessToken } = useAuth();
  const [searchQuery, setSearchQuery] = useState("");
  const [searchResults, setSearchResults] = useState<SearchUser[]>([]);
  const [isSearching, setIsSearching] = useState(false);
  const [showDropdown, setShowDropdown] = useState(false);
  const [selectedEmail, setSelectedEmail] = useState<string | null>(null);

  const debounceTimer = useRef<NodeJS.Timeout>();
  const abortControllerRef = useRef<AbortController | null>(null);

  // Search logic inline in effect - no performSearch callback
  useEffect(() => {
    if (selectedEmail && searchQuery !== selectedEmail) {
      setSelectedEmail(null);
    }

    if (debounceTimer.current) {
      clearTimeout(debounceTimer.current);
    }

    debounceTimer.current = setTimeout(async () => {
      if (searchQuery.length < 3) {
        setSearchResults([]);
        setShowDropdown(false);
        return;
      }

      if (selectedEmail && searchQuery === selectedEmail) {
        setSearchResults([]);
        setShowDropdown(false);
        return;
      }

      try {
        if (abortControllerRef.current) {
          abortControllerRef.current.abort();
        }

        abortControllerRef.current = new AbortController();
        setIsSearching(true);

        const token = await getAccessToken();

        const response = await fetch(
          `/api/users/search?email=${encodeURIComponent(searchQuery)}`,
          {
            headers: {
              Authorization: `Bearer ${token}`,
            },
            signal: abortControllerRef.current.signal,
          }
        );

        if (response.ok) {
          const data = await response.json();
          if (data.success) {
            const filteredResults = (data.users || []).filter(
              (user: SearchUser) =>
                !excludeUserIds.includes(user.id) && user.is_active
            );
            setSearchResults(filteredResults);
            setShowDropdown(filteredResults.length > 0);
          } else {
            setSearchResults([]);
            setShowDropdown(false);
          }
        } else {
          setSearchResults([]);
          setShowDropdown(false);
        }
      } catch (error) {
        if (error instanceof Error && error.name === "AbortError") {
          return;
        }
        console.error("Error searching users:", error);
        setSearchResults([]);
        setShowDropdown(false);
      } finally {
        setIsSearching(false);
      }
    }, 300);

    return () => {
      if (debounceTimer.current) {
        clearTimeout(debounceTimer.current);
      }
    };
  }, [searchQuery, selectedEmail]); // ONLY these two!

  const selectUser = (user: SearchUser) => {
    setSearchQuery(user.email);
    setSelectedEmail(user.email);
    setShowDropdown(false);
    return user;
  };

  const clearSearch = () => {
    setSearchQuery("");
    setSelectedEmail(null);
    setSearchResults([]);
    setShowDropdown(false);
    if (abortControllerRef.current) {
      abortControllerRef.current.abort();
    }
  };

  return {
    searchQuery,
    setSearchQuery,
    searchResults,
    isSearching,
    showDropdown,
    setShowDropdown,
    selectUser,
    clearSearch,
  };
}
