import React from "react";
import ReactMarkdown from "react-markdown";

interface MarkdownTextProps {
  text: string;
  className?: string;
}

export const MarkdownText: React.FC<MarkdownTextProps> = ({
  text,
  className = "",
}) => {
  return (
    <span className={className}>
      <ReactMarkdown
        components={{
          // Override components to maintain styling
          p: ({ children }) => <span>{children}</span>,
          strong: ({ children }) => (
            <strong className="font-semibold">{children}</strong>
          ),
          em: ({ children }) => <em className="italic">{children}</em>,
          code: ({ children }) => (
            <code className="bg-gray-100 px-1 py-0.5 rounded text-xs font-mono">
              {children}
            </code>
          ),
          // Remove default paragraph styling since we want inline text
          br: () => <br />,
        }}
      >
        {text}
      </ReactMarkdown>
    </span>
  );
};
