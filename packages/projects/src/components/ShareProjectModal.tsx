import { useState, useEffect, useMemo } from "react";
import Image from "next/image";
import {
  ProjectWithPermissions,
  ProjectRole,
  hasPermission,
} from "@studio/core";
import { useProjectMembers } from "../hooks/useProjectMembers";
import { useUserSearch } from "../hooks/useUserSearch";

interface ShareProjectModalProps {
  project: ProjectWithPermissions;
  isOpen: boolean;
  onClose: () => void;
  onShare: (userEmail: string, role: ProjectRole) => Promise<void>;
  onRemovePermission: (userId: string) => Promise<void>;
  currentUserId: string;
}

export default function ShareProjectModal({
  project,
  isOpen,
  onClose,
  onShare,
  onRemovePermission,
  currentUserId,
}: ShareProjectModalProps) {
  const [isSharing, setIsSharing] = useState(false);

  const canManagePermissions = hasPermission(
    project.user_role,
    "manage_permissions"
  );

  // Use custom hooks for members and user search
  const {
    members,
    isLoading: isLoadingMembers,
    shareProject,
    removePermission,
  } = useProjectMembers(project.id, currentUserId, isOpen);

  const memberUserIds = useMemo(() => members.map((m) => m.user_id), [members]);
  const {
    searchQuery,
    setSearchQuery,
    searchResults,
    isSearching,
    showDropdown,
    setShowDropdown,
    selectUser,
    clearSearch,
  } = useUserSearch(project.id, memberUserIds);

  // Handle ESC key to close dropdown or modal
  useEffect(() => {
    const handleEscKey = (event: KeyboardEvent) => {
      if (event.key === "Escape" && isOpen) {
        if (showDropdown) {
          setShowDropdown(false);
        } else {
          onClose();
        }
      }
    };

    if (isOpen) {
      document.addEventListener("keydown", handleEscKey);
      return () => {
        document.removeEventListener("keydown", handleEscKey);
      };
    }
    return undefined;
  }, [isOpen, onClose, showDropdown, setShowDropdown]);

  const handleShare = async () => {
    if (!searchQuery.trim()) return;

    try {
      setIsSharing(true);
      await shareProject(searchQuery.trim(), "editor");
      await onShare(searchQuery.trim(), "editor");
      clearSearch();
    } catch (error) {
      // Error already handled in hook
    } finally {
      setIsSharing(false);
    }
  };

  const handleRemovePermission = async (userId: string) => {
    try {
      await removePermission(userId);
      await onRemovePermission(userId);
    } catch (error) {
      // Error already handled in hook
    }
  };

  const handleSelectUser = (user: any) => {
    selectUser(user);
  };

  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 bg-black/20 backdrop-blur-sm flex items-center justify-center z-50">
      <div className="bg-white rounded-2xl w-full max-w-2xl overflow-hidden shadow-sm transform transition-all max-h-[85vh] flex flex-col">
        {/* Header */}
        <div className="px-6 pt-6 pb-4 border-b border-gray-100">
          <div className="flex items-center justify-between">
            <h2 className="text-2xl text-gray-900 font-light">Share Project</h2>
            <button
              onClick={onClose}
              className="text-gray-400 hover:text-gray-600 transition-colors p-1 rounded-full hover:bg-gray-50"
              title="Close"
            >
              <svg
                xmlns="http://www.w3.org/2000/svg"
                viewBox="0 0 20 20"
                fill="currentColor"
                className="w-4 h-4"
              >
                <path d="M6.28 5.22a.75.75 0 00-1.06 1.06L8.94 10l-3.72 3.72a.75.75 0 101.06 1.06L10 11.06l3.72 3.72a.75.75 0 101.06-1.06L11.06 10l3.72-3.72a.75.75 0 00-1.06-1.06L10 8.94 6.28 5.22z" />
              </svg>
            </button>
          </div>
        </div>

        {/* Content */}
        <div className="flex-1 overflow-y-auto p-6">
          {/* Share Section */}
          {canManagePermissions && (
            <div className="mb-6">
              <h3 className="text-sm font-medium text-gray-900 mb-3">
                Share with others
              </h3>
              <div className="flex gap-3">
                <div className="flex-1 relative">
                  <input
                    type="text"
                    placeholder="Email"
                    value={searchQuery}
                    onChange={(e) => setSearchQuery(e.target.value)}
                    onKeyDown={(e) => {
                      if (
                        e.key === "Enter" &&
                        searchQuery.trim() &&
                        !isSharing
                      ) {
                        handleShare();
                      }
                    }}
                    className="w-full px-4 py-2 border border-gray-300 rounded-lg focus:outline-none focus:border-accent transition-colors"
                  />

                  {/* Search dropdown */}
                  {showDropdown && searchResults.length > 0 && (
                    <div className="absolute z-10 w-full mt-1 bg-white border border-gray-300 rounded-lg shadow-lg max-h-60 overflow-y-auto">
                      {searchResults.map((user) => (
                        <button
                          key={user.id}
                          onClick={() => handleSelectUser(user)}
                          className="w-full px-4 py-3 text-left hover:bg-gray-50 flex items-center gap-3 transition-colors"
                        >
                          {user.avatar_url ? (
                            <Image
                              src={user.avatar_url}
                              alt={user.name}
                              width={32}
                              height={32}
                              className="rounded-full"
                            />
                          ) : (
                            <div className="w-8 h-8 rounded-full bg-accent-100 flex items-center justify-center">
                              <span className="text-sm font-medium text-accent">
                                {user.name.charAt(0).toUpperCase()}
                              </span>
                            </div>
                          )}
                          <div className="flex-1 min-w-0">
                            <p className="text-sm font-medium text-gray-900 truncate">
                              {user.name}
                            </p>
                            <p className="text-xs text-gray-500 truncate">
                              {user.email}
                            </p>
                          </div>
                        </button>
                      ))}
                    </div>
                  )}

                  {isSearching && (
                    <div className="absolute right-3 top-2.5">
                      <svg
                        className="animate-spin h-5 w-5 text-gray-400"
                        xmlns="http://www.w3.org/2000/svg"
                        fill="none"
                        viewBox="0 0 24 24"
                      >
                        <circle
                          className="opacity-25"
                          cx="12"
                          cy="12"
                          r="10"
                          stroke="currentColor"
                          strokeWidth="4"
                        ></circle>
                        <path
                          className="opacity-75"
                          fill="currentColor"
                          d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"
                        ></path>
                      </svg>
                    </div>
                  )}
                </div>

                <button
                  onClick={handleShare}
                  disabled={!searchQuery.trim() || isSharing}
                  className="px-6 py-2 bg-accent text-white rounded-lg hover:bg-accent-600 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-accent transition-colors disabled:opacity-50 disabled:cursor-not-allowed whitespace-nowrap"
                >
                  Share
                </button>
              </div>
            </div>
          )}

          {/* Members List */}
          <div>
            <h3 className="text-sm font-medium text-gray-900 mb-3">
              People with access ({members.length})
            </h3>

            {isLoadingMembers ? (
              <div className="flex items-center justify-center py-8">
                <svg
                  className="animate-spin h-6 w-6 text-accent"
                  xmlns="http://www.w3.org/2000/svg"
                  fill="none"
                  viewBox="0 0 24 24"
                >
                  <circle
                    className="opacity-25"
                    cx="12"
                    cy="12"
                    r="10"
                    stroke="currentColor"
                    strokeWidth="4"
                  ></circle>
                  <path
                    className="opacity-75"
                    fill="currentColor"
                    d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"
                  ></path>
                </svg>
              </div>
            ) : members.length === 0 ? (
              <p className="text-sm text-gray-500 text-center py-8">
                No members yet
              </p>
            ) : (
              <div className="space-y-2">
                {members.map((member) => (
                  <div
                    key={member.user_id}
                    className="flex items-center gap-3 p-3 border border-gray-100 rounded-lg hover:border-gray-300 transition-colors"
                  >
                    {member.avatar_url ? (
                      <Image
                        src={member.avatar_url}
                        alt={member.name || "User"}
                        width={40}
                        height={40}
                        className="rounded-full"
                      />
                    ) : (
                      <div className="w-10 h-10 rounded-full bg-accent-100 flex items-center justify-center">
                        <span className="text-sm font-medium text-accent">
                          {member.name?.charAt(0).toUpperCase() || "?"}
                        </span>
                      </div>
                    )}

                    <div className="flex-1 min-w-0">
                      <p className="text-sm font-medium text-gray-900 truncate">
                        {member.name}
                      </p>
                      <p className="text-xs text-gray-500 truncate">
                        {member.email}
                      </p>
                    </div>

                    {canManagePermissions &&
                      member.user_id !== currentUserId && (
                        <button
                          onClick={() => handleRemovePermission(member.user_id)}
                          className="p-1.5 text-gray-400 hover:text-red-500 hover:bg-red-50 rounded transition-colors"
                          title="Remove access"
                        >
                          <svg
                            className="w-4 h-4"
                            fill="none"
                            stroke="currentColor"
                            viewBox="0 0 24 24"
                          >
                            <path
                              strokeLinecap="round"
                              strokeLinejoin="round"
                              strokeWidth="2"
                              d="M6 18L18 6M6 6l12 12"
                            />
                          </svg>
                        </button>
                      )}
                  </div>
                ))}
              </div>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}
