// Mock for react-markdown
const React = require("react");

function sanitizeHtml(html) {
  // Remove dangerous elements
  html = html.replace(/<script[^>]*>[\s\S]*?<\/script>/gi, "");
  html = html.replace(/<iframe[^>]*>[\s\S]*?<\/iframe>/gi, "");
  html = html.replace(/<object[^>]*>[\s\S]*?<\/object>/gi, "");
  html = html.replace(/<embed[^>]*>/gi, "");
  html = html.replace(/<applet[^>]*>[\s\S]*?<\/applet>/gi, "");

  // Remove dangerous attributes
  html = html.replace(/\s*on\w+\s*=\s*["'][^"']*["']/gi, "");
  html = html.replace(/\s*on\w+\s*=\s*[^\s>]*/gi, "");

  // Remove javascript: protocol
  html = html.replace(/href\s*=\s*["']javascript:[^"']*["']/gi, "");
  html = html.replace(/src\s*=\s*["']javascript:[^"']*["']/gi, "");

  return html;
}

function ReactMarkdown({ children, components }) {
  // Simple mock that just renders the children with basic transformations
  const content = children || "";

  // Sanitize first (simulating rehype-sanitize)
  let html = sanitizeHtml(content);

  // Apply basic transformations to test component behavior

  // Bold: **text** -> <strong>text</strong>
  html = html.replace(/\*\*(.*?)\*\*/g, "<strong>$1</strong>");

  // Italic: *text* -> <em>text</em>
  html = html.replace(/\*(.*?)\*/g, "<em>$1</em>");

  // Links: [text](url) -> <a href="url">text</a>
  html = html.replace(/\[([^\]]+)\]\(([^)]+)\)/g, (match, text, url) => {
    const props = components?.a
      ? ""
      : 'target="_blank" rel="noopener noreferrer"';
    return `<a href="${url}" ${props}>${text}</a>`;
  });

  // Code: `code` -> <code>code</code>
  html = html.replace(/`([^`]+)`/g, "<code>$1</code>");

  // Strikethrough: ~~text~~ -> <del>text</del>
  html = html.replace(/~~(.*?)~~/g, "<del>$1</del>");

  // Lists: - item -> <li>item</li>
  html = html.replace(/^- (.+)$/gm, "<li>$1</li>");
  html = html.replace(/^(\d+)\. (.+)$/gm, "<li>$2</li>");

  // Wrap consecutive list items in ul/ol
  html = html.replace(/(<li>.*<\/li>\n?)+/g, (match) => {
    return `<ul>${match}</ul>`;
  });

  // Headings
  html = html.replace(/^# (.+)$/gm, "<h1>$1</h1>");
  html = html.replace(/^## (.+)$/gm, "<h2>$1</h2>");
  html = html.replace(/^### (.+)$/gm, "<h3>$1</h3>");

  // Blockquotes
  html = html.replace(/^> (.+)$/gm, "<blockquote>$1</blockquote>");

  // Code blocks
  html = html.replace(
    /```(\w+)?\n([\s\S]*?)```/g,
    "<pre><code>$2</code></pre>",
  );

  // Tables (basic)
  const tableMatch = html.match(/\|(.+)\|\n\|[-:\s|]+\|\n((?:\|.+\|\n?)+)/);
  if (tableMatch) {
    const headers = tableMatch[1]
      .split("|")
      .filter((h) => h.trim())
      .map((h) => `<th>${h.trim()}</th>`)
      .join("");
    const rows = tableMatch[2]
      .trim()
      .split("\n")
      .map((row) => {
        const cells = row
          .split("|")
          .filter((c) => c.trim())
          .map((c) => `<td>${c.trim()}</td>`)
          .join("");
        return `<tr>${cells}</tr>`;
      })
      .join("");
    const table = `<table><thead><tr>${headers}</tr></thead><tbody>${rows}</tbody></table>`;
    html = html.replace(tableMatch[0], table);
  }

  // Task lists
  html = html.replace(
    /- \[x\] (.+)/g,
    '<li><input type="checkbox" checked /> $1</li>',
  );
  html = html.replace(/- \[ \] (.+)/g, '<li><input type="checkbox" /> $1</li>');

  // Final sanitization pass
  html = sanitizeHtml(html);

  return React.createElement("div", {
    dangerouslySetInnerHTML: { __html: html },
  });
}

module.exports = ReactMarkdown;
module.exports.default = ReactMarkdown;
