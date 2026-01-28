import React from "react";
import ReactMarkdown from "react-markdown";
import remarkGfm from "remark-gfm";
import rehypeSanitize from "rehype-sanitize";
import rehypeRaw from "rehype-raw";
import { defaultSchema } from "hast-util-sanitize";

export interface RichTextProps {
  content: string | null | undefined;
  className?: string;
}

const sanitizeSchema = {
  ...defaultSchema,
  tagNames: Array.from(
    new Set([
      ...(defaultSchema.tagNames || []),
      "p",
      "br",
      "hr",
      "strong",
      "em",
      "del",
      "ul",
      "ol",
      "li",
      "blockquote",
      "pre",
      "code",
      "h1",
      "h2",
      "h3",
      "h4",
      "h5",
      "h6",
    ]),
  ),
  attributes: {
    ...(defaultSchema.attributes || {}),
    a: [...((defaultSchema.attributes || {}).a || []), "href", "target", "rel"],
    code: [...((defaultSchema.attributes || {}).code || []), "className"],
  },
  protocols: {
    ...(defaultSchema.protocols || {}),
    href: ["http", "https", "mailto"],
  },
};

export function RichText({ content, className = "" }: RichTextProps) {
  if (!content) {
    return null;
  }

  return (
    <div
      className={`prose prose-slate prose-invert prose-sm max-w-none 
      prose-headings:text-white prose-p:text-gray-300 prose-strong:text-white prose-strong:font-bold prose-ul:text-gray-300 prose-ol:text-gray-300
      ${className}`}
    >
      <ReactMarkdown
        remarkPlugins={[remarkGfm]}
        rehypePlugins={[rehypeRaw, [rehypeSanitize, sanitizeSchema]]}
        components={{
          a: ({ href, children, ...props }) => (
            <a
              href={href}
              target="_blank"
              rel="noopener noreferrer"
              className="text-blue-400 hover:text-blue-300 underline font-medium"
              {...props}
            >
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
