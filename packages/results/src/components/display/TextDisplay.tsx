"use client";

import React, { useState } from "react";
import {
  ProcessedResults,
  ResultItem,
  getAggregatedCitationInfo,
} from "@studio/core";
import { getTagColorClasses } from "@studio/ui";

interface TextDisplayProps {
  results: ProcessedResults;
  fieldId: string;
  fieldName: string;
  selectedSentence: { fieldId: string; line: string; tags: string[] } | null;
  setSelectedSentence: React.Dispatch<
    React.SetStateAction<{
      fieldId: string;
      line: string;
      tags: string[];
    } | null>
  >;
  setSelectedTag: React.Dispatch<
    React.SetStateAction<{
      fieldId: string;
      tag: string;
      lineNumbers: number[];
    } | null>
  >;
}

export const TextDisplay: React.FC<TextDisplayProps> = ({
  results,
  fieldId,
  selectedSentence,
  setSelectedSentence,
  setSelectedTag,
}) => {
  const [copied, setCopied] = useState(false);

  // Function to copy text to clipboard
  const copyToClipboard = () => {
    if (!results?.text || !Array.isArray(results.text)) return;

    // Build plain text version
    const textLines = results.text
      .map((item: ResultItem) => item.line)
      .join("\n");

    // Copy to clipboard
    navigator.clipboard
      .writeText(textLines)
      .then(() => {
        setCopied(true);
        setTimeout(() => setCopied(false), 2000);
      })
      .catch((err) => {
        console.error("Failed to copy:", err);
      });
  };

  // Helper function to render markdown with full support
  const renderMarkdownLine = (text: string, tags: string[]) => {
    if (!text) return null;

    // Get unique tags for this line
    const uniqueTags = Array.from(new Set(tags));

    // Helper to render aggregated tag inline
    const renderTags = () => {
      if (uniqueTags.length === 0) return null;

      const citationInfo = getAggregatedCitationInfo(
        uniqueTags,
        results.lineMap
      );
      const isSelected = selectedSentence?.line === text;

      // Simple tooltip text
      const tooltipText =
        citationInfo.count === 1
          ? "View source"
          : `View ${citationInfo.count} sources`;

      return (
        <span
          onClick={(_e) => {
            // Don't stop propagation - let it bubble up to the parent line click handler
            // This makes the tag behave as part of the sentence
          }}
          className={`ml-1 inline-flex px-1.5 py-0.5 text-xs font-medium rounded cursor-pointer ${
            citationInfo.averageScore !== null
              ? getTagColorClasses(citationInfo.averageScore, isSelected)
              : "bg-gray-100 text-gray-600 hover:bg-gray-200"
          } transition-colors`}
          title={tooltipText}
        >
          {citationInfo.count}
        </span>
      );
    };

    // Check for LaTeX display math (entire line is just the formula)
    if (text.trim().startsWith("\\[") && text.trim().endsWith("\\]")) {
      const content = text.trim().slice(2, -2);
      return (
        <div className="my-2 p-3 bg-gray-50 rounded-lg overflow-x-auto">
          <code className="font-mono text-sm whitespace-pre">{content}</code>
          {renderTags()}
        </div>
      );
    }

    // Check for headings - larger sizes for better hierarchy
    if (text.startsWith("#### ")) {
      return (
        <>
          <h4 className="font-semibold text-lg mt-3 mb-2 inline">
            {renderInlineMarkdown(text.slice(5))}
          </h4>
          {renderTags()}
        </>
      );
    }
    if (text.startsWith("### ")) {
      return (
        <>
          <h3 className="font-bold text-xl mt-4 mb-2 inline">
            {renderInlineMarkdown(text.slice(4))}
          </h3>
          {renderTags()}
        </>
      );
    }
    if (text.startsWith("## ")) {
      return (
        <>
          <h2 className="font-bold text-2xl mt-5 mb-3 inline">
            {renderInlineMarkdown(text.slice(3))}
          </h2>
          {renderTags()}
        </>
      );
    }
    if (text.startsWith("# ")) {
      return (
        <>
          <h1 className="font-bold text-3xl mt-6 mb-4 inline">
            {renderInlineMarkdown(text.slice(2))}
          </h1>
          {renderTags()}
        </>
      );
    }

    // Check for list items - bigger and more indented
    if (text.match(/^[\s]*[-*+]\s+/)) {
      const indent = text.match(/^(\s*)/)?.[1]?.length || 0;
      const content = text.replace(/^[\s]*[-*+]\s+/, "");
      return (
        <div className="flex ml-8" style={{ paddingLeft: `${indent * 12}px` }}>
          <span className="mr-3 flex-shrink-0 text-lg">•</span>
          <span className="flex-1">
            {renderInlineMarkdown(content)}
            {renderTags()}
          </span>
        </div>
      );
    }

    // Check for numbered lists - less indented than bullets
    const numberedMatch = text.match(/^[\s]*(\d+)\.\s+(.*)$/);
    if (numberedMatch) {
      const indent = text.match(/^(\s*)/)?.[1]?.length || 0;
      return (
        <div className="flex ml-4" style={{ paddingLeft: `${indent * 8}px` }}>
          <span className="mr-2 flex-shrink-0 font-medium">
            {numberedMatch[1]}.
          </span>
          <span className="flex-1">
            {renderInlineMarkdown(numberedMatch[2] || "")}
            {renderTags()}
          </span>
        </div>
      );
    }

    // Check for blockquotes
    if (text.startsWith(">")) {
      const content = text.replace(/^>\s*/, "");
      return (
        <blockquote className="border-l-4 border-gray-300 pl-4 italic text-gray-600">
          {renderInlineMarkdown(content)}
          {renderTags()}
        </blockquote>
      );
    }

    // Check for horizontal rules
    if (text.match(/^[-*_]{3,}$/)) {
      return <hr className="my-3 border-gray-300" />;
    }

    // Regular paragraph
    return (
      <>
        <span>{renderInlineMarkdown(text)}</span>
        {renderTags()}
      </>
    );
  };

  // Helper function for inline markdown (bold, italic, code, links, LaTeX)
  const renderInlineMarkdown = (text: string) => {
    if (!text) return null;

    // More comprehensive regex for inline elements including LaTeX
    const regex =
      /(\\\[[\s\S]*?\\\]|\\\([\s\S]*?\\\)|\*\*(?:[^*]|\*(?!\*))+\*\*|\*(?:[^*])+\*|__[^_]+__|_[^_]+_|`[^`]+`|\[[^\]]+\]\([^)]+\))/g;
    const parts = text.split(regex);

    return parts
      .map((part, index) => {
        if (!part) return null;

        // LaTeX display math \[...\]
        if (part.startsWith("\\[") && part.endsWith("\\]")) {
          const content = part.slice(2, -2);
          return (
            <div
              key={index}
              className="my-2 p-2 bg-gray-50 rounded overflow-x-auto"
            >
              <code className="font-mono text-sm">{content}</code>
            </div>
          );
        }

        // LaTeX inline math \(...\)
        if (part.startsWith("\\(") && part.endsWith("\\)")) {
          const content = part.slice(2, -2);
          return (
            <code
              key={index}
              className="font-mono text-xs px-1 py-0.5 bg-gray-100 rounded"
            >
              {content}
            </code>
          );
        }

        // Bold with ** or __ - more prominent
        if (
          (part.startsWith("**") && part.endsWith("**") && part.length > 4) ||
          (part.startsWith("__") && part.endsWith("__") && part.length > 4)
        ) {
          const content = part.slice(2, -2);
          if (content.trim()) {
            return (
              <strong key={index} className="font-bold">
                {content}
              </strong>
            );
          }
          return part;
        }

        // Italic with * or _
        if (
          (part.startsWith("*") &&
            part.endsWith("*") &&
            !part.startsWith("**") &&
            part.length > 2) ||
          (part.startsWith("_") &&
            part.endsWith("_") &&
            !part.startsWith("__") &&
            part.length > 2)
        ) {
          const content = part.slice(1, -1);
          if (content.trim()) {
            return (
              <em key={index} className="italic">
                {content}
              </em>
            );
          }
          return part;
        }

        // Code
        if (part.startsWith("`") && part.endsWith("`") && part.length > 2) {
          const content = part.slice(1, -1);
          return (
            <code
              key={index}
              className="font-mono text-xs px-1 py-0.5 bg-gray-100 rounded"
            >
              {content}
            </code>
          );
        }

        // Link
        const linkMatch = part.match(/^\[([^\]]+)\]\(([^)]+)\)$/);
        if (linkMatch && linkMatch[1] && linkMatch[2]) {
          try {
            const url = linkMatch[2];
            if (
              url.startsWith("http://") ||
              url.startsWith("https://") ||
              url.startsWith("/") ||
              url.startsWith("#")
            ) {
              return (
                <a
                  key={index}
                  href={url}
                  className="text-accent hover:text-accent-700 underline"
                  target="_blank"
                  rel="noopener noreferrer"
                >
                  {linkMatch[1]}
                </a>
              );
            }
          } catch (e) {
            return part;
          }
        }

        return part;
      })
      .filter(Boolean);
  };

  if (!results?.text || !Array.isArray(results.text)) return null;

  return (
    <div className="relative">
      {/* Small copy button positioned outside on the right */}
      <button
        onClick={copyToClipboard}
        className="absolute -right-10 top-0 p-1.5 rounded-md text-gray-500 hover:text-gray-700 hover:bg-gray-100 transition-colors"
        title="Copy text"
      >
        {copied ? (
          <svg
            className="h-4 w-4 text-green-500"
            fill="none"
            stroke="currentColor"
            viewBox="0 0 24 24"
          >
            <path
              strokeLinecap="round"
              strokeLinejoin="round"
              strokeWidth={2}
              d="M5 13l4 4L19 7"
            />
          </svg>
        ) : (
          <svg
            className="h-4 w-4"
            fill="none"
            stroke="currentColor"
            viewBox="0 0 24 24"
          >
            <path
              strokeLinecap="round"
              strokeLinejoin="round"
              strokeWidth={2}
              d="M8 16H6a2 2 0 01-2-2V6a2 2 0 012-2h8a2 2 0 012 2v2m-6 12h8a2 2 0 002-2v-8a2 2 0 00-2-2h-8a2 2 0 00-2 2v8a2 2 0 002 2z"
            />
          </svg>
        )}
      </button>

      {/* Text content */}
      <div>
        {results.text.map((item: ResultItem, lineIndex: number) => {
          return (
            <div key={`line-${lineIndex}`} className="mb-1">
              <div
                onClick={() => {
                  // Only allow click if the line has tags
                  if (item.tags && item.tags.length > 0) {
                    if (selectedSentence?.line === item.line) {
                      setSelectedSentence(null);
                      setSelectedTag(null);
                    } else {
                      setSelectedSentence({
                        fieldId,
                        line: item.line,
                        tags: item.tags,
                      });
                      setSelectedTag(null);
                    }
                  }
                }}
                className={`text-left w-full py-1 rounded transition-colors ${
                  item.tags && item.tags.length > 0
                    ? `cursor-pointer ${
                        selectedSentence?.line === item.line
                          ? "bg-accent-50"
                          : "hover:bg-gray-50"
                      }`
                    : "cursor-default"
                }`}
              >
                <span className="inline">
                  {renderMarkdownLine(item.line, item.tags || [])}
                </span>
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
};
