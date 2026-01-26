import React from "react";
import { render, screen } from "@testing-library/react";
import { RichText } from "../RichText";

describe("RichText", () => {
  it("renders plain text without markdown", () => {
    const plainText = "This is plain text without any markdown";
    render(<RichText content={plainText} />);
    expect(screen.getByText(plainText)).toBeInTheDocument();
  });

  it("renders markdown content", () => {
    const markdown = "This is **bold text** and *italic*";
    const { container } = render(<RichText content={markdown} />);
    expect(container.firstChild).toBeInTheDocument();
    expect(container.textContent).toContain("bold text");
    expect(container.textContent).toContain("italic");
  });

  it("renders links in markdown", () => {
    const markdown = "[Click here](https://example.com)";
    const { container } = render(<RichText content={markdown} />);
    const link = container.querySelector("a");
    expect(link).toBeInTheDocument();
    expect(link).toHaveAttribute("href", "https://example.com");
    expect(link).toHaveTextContent("Click here");
  });

  it("renders lists in markdown", () => {
    const markdown = `
- Item 1
- Item 2
- Item 3
    `;
    const { container } = render(<RichText content={markdown} />);
    const items = container.querySelectorAll("li");
    expect(items.length).toBeGreaterThan(0);
    expect(container.textContent).toContain("Item 1");
    expect(container.textContent).toContain("Item 2");
  });

  it("renders code in markdown", () => {
    const markdown = "Use the `console.log()` function";
    const { container } = render(<RichText content={markdown} />);
    const code = container.querySelector("code");
    expect(code).toBeInTheDocument();
    expect(code).toHaveTextContent("console.log()");
  });

  it("renders strikethrough (GFM)", () => {
    const markdown = "This is ~~strikethrough~~ text";
    const { container } = render(<RichText content={markdown} />);
    const del = container.querySelector("del");
    expect(del).toBeInTheDocument();
    expect(del).toHaveTextContent("strikethrough");
  });

  it("handles empty content", () => {
    const { container } = render(<RichText content="" />);
    expect(container.firstChild).toBeNull();
  });

  it("handles null content gracefully", () => {
    const { container } = render(<RichText content={null} />);
    expect(container.firstChild).toBeNull();
  });

  it("applies custom className prop correctly", () => {
    const customClass = "text-blue-500 mb-4";
    const { container } = render(
      <RichText content="Test content" className={customClass} />,
    );
    const wrapper = container.querySelector("div");
    expect(wrapper).toHaveClass("prose");
    expect(wrapper).toHaveClass("prose-slate");
    expect(wrapper).toHaveClass("prose-sm");
    expect(wrapper).toHaveClass("max-w-none");
    expect(wrapper).toHaveClass("dark:prose-invert");
    expect(wrapper?.className).toContain(customClass);
  });

  it("line-clamp truncation works on rendered output", () => {
    const longMarkdown = `
This is a **very long** paragraph with multiple lines.
This is a second line with *italic text*.
This is a third line with [a link](https://example.com).
This is a fourth line that should be truncated.
    `;
    const { container } = render(
      <RichText content={longMarkdown} className="line-clamp-2" />,
    );
    const wrapper = container.querySelector("div");
    expect(wrapper).toHaveClass("line-clamp-2");
  });

  it("renders headings correctly", () => {
    const markdown = `
# Heading 1
## Heading 2
### Heading 3
    `;
    const { container } = render(<RichText content={markdown} />);
    expect(container.querySelector("h1")).toHaveTextContent("Heading 1");
    expect(container.querySelector("h2")).toHaveTextContent("Heading 2");
    expect(container.querySelector("h3")).toHaveTextContent("Heading 3");
  });

  it("renders blockquotes", () => {
    const markdown = "> This is a blockquote";
    const { container } = render(<RichText content={markdown} />);
    const blockquote = container.querySelector("blockquote");
    expect(blockquote).toBeInTheDocument();
    expect(blockquote).toHaveTextContent("This is a blockquote");
  });

  it("renders complex markdown content", () => {
    const complexMarkdown = `
# Main Heading

This is a paragraph with **bold** and *italic* text.

## Requirements:
- Deploy a lock
- Set price to ≥ 0.001 ETH

Check the [docs](https://example.com) for more.
    `;
    const { container } = render(<RichText content={complexMarkdown} />);
    expect(container.querySelector("h1")).toBeInTheDocument();
    expect(container.querySelector("h2")).toBeInTheDocument();
    expect(container.querySelector("a")).toBeInTheDocument();
    expect(container.textContent).toContain("Main Heading");
    expect(container.textContent).toContain("Requirements");
  });

  it("renders tables (GFM)", () => {
    const markdown = `
| Header 1 | Header 2 |
|----------|----------|
| Cell 1   | Cell 2   |
    `;
    const { container } = render(<RichText content={markdown} />);
    expect(container.textContent).toContain("Header 1");
    expect(container.textContent).toContain("Cell 1");
  });

  it("preserves text content even with special characters", () => {
    const markdown = "Text with ≥ and ≤ symbols";
    const { container } = render(<RichText content={markdown} />);
    expect(container.textContent).toContain("≥");
    expect(container.textContent).toContain("≤");
  });

  describe("Security (XSS Protection)", () => {
    it("strips script tags completely", () => {
      const xss = '<script>alert("xss")</script>Safe text';
      const { container } = render(<RichText content={xss} />);
      expect(container.querySelector("script")).toBeNull();
      expect(container.textContent).toContain("Safe text");
      expect(container.innerHTML).not.toContain("<script>");
    });

    it("strips event handler attributes", () => {
      const xss = '<img src=x onerror="alert(1)">text';
      const { container } = render(<RichText content={xss} />);
      const imgs = container.querySelectorAll("img");
      imgs.forEach((img) => {
        expect(img.getAttribute("onerror")).toBeNull();
        expect(img.getAttribute("onload")).toBeNull();
      });
    });

    it("blocks javascript: protocol in links", () => {
      const xss = '[Click me](javascript:alert("xss"))';
      const { container } = render(<RichText content={xss} />);
      const link = container.querySelector("a");
      const href = link?.getAttribute("href") || "";
      expect(href.toLowerCase()).not.toContain("javascript:");
    });

    it("strips iframe elements", () => {
      const xss = '<iframe src="evil.com"></iframe>text';
      const { container } = render(<RichText content={xss} />);
      expect(container.querySelector("iframe")).toBeNull();
    });

    it("sanitizes multiple XSS vectors in combination", () => {
      const xss =
        "<script>alert(1)</script><img onerror=alert(2)>[link](javascript:void(0))Normal text";
      const { container } = render(<RichText content={xss} />);
      expect(container.querySelector("script")).toBeNull();
      expect(container.innerHTML).not.toContain("onerror");
      expect(container.innerHTML).not.toContain("javascript:");
      expect(container.textContent).toContain("Normal text");
    });
  });
});
