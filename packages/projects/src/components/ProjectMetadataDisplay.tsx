"use client";

import React from "react";

interface ProjectMetadataDisplayProps {
  metadata: any;
  updatedAt?: string;
  userName?: string;
}

export const ProjectMetadataDisplay: React.FC<ProjectMetadataDisplayProps> = ({
  // metadata,
  updatedAt,
  // userName,
}) => {
  return (
    <div>
      <div className="flex items-center gap-1.5 text-sm text-gray-600">
        <svg
          className="w-4 h-4"
          fill="none"
          stroke="currentColor"
          viewBox="0 0 24 24"
        >
          <path
            strokeLinecap="round"
            strokeLinejoin="round"
            strokeWidth={1.5}
            d="M12 8v4l3 3m6-3a9 9 0 11-18 0 9 9 0 0118 0z"
          />
        </svg>
        <span>
          {updatedAt &&
            new Date(updatedAt).toLocaleDateString("en-US", {
              month: "short",
              day: "numeric",
              year: "numeric",
            })}
        </span>
      </div>
    </div>
  );
};
