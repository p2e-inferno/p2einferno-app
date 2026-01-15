import React from "react";
import ReactMarkdown from "react-markdown";
import remarkGfm from "remark-gfm";
import rehypeSanitize from "rehype-sanitize";

export interface RichTextProps {
  content: string | null | undefined;
  className?: string;
}

export function RichText({ content, className = "" }: RichTextProps) {
  if (!content) {
    return null;
  }

  return (
    <div
      className={`prose prose-slate prose-sm max-w-none dark:prose-invert ${className}`}
    >
      <ReactMarkdown
        remarkPlugins={[remarkGfm]}
        rehypePlugins={[rehypeSanitize]}
        components={{
          a: ({ href, children, ...props }) => (
            <a href={href} target="_blank" rel="noopener noreferrer" {...props}>
              {children}
            </a>
          ),
        }}
      >
        {content}
      </ReactMarkdown>
    </div>
  );
}
