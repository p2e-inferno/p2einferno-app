import React, { useEffect, useMemo, useRef } from "react";
import { useEditor, EditorContent } from "@tiptap/react";
import StarterKit from "@tiptap/starter-kit";
import Link from "@tiptap/extension-link";
import Placeholder from "@tiptap/extension-placeholder";
import {
  Bold,
  Italic,
  Strikethrough,
  Link2,
  List,
  ListOrdered,
} from "lucide-react";
import { unified } from "unified";
import remarkParse from "remark-parse";
import remarkGfm from "remark-gfm";
import remarkRehype from "remark-rehype";
import rehypeStringify from "rehype-stringify";

type RichTextEditorProps = {
  value: string;
  onChange: (nextHtml: string) => void;
  placeholder?: string;
  className?: string;
  editorClassName?: string;
  disabled?: boolean;
  minHeightClassName?: string;
};

function isProbablyHtml(value: string) {
  const trimmed = value.trim();
  if (!trimmed) return false;
  return /^<([a-z][\w-]*)(\s|>)/i.test(trimmed);
}

function markdownToHtml(markdown: string) {
  try {
    return String(
      unified()
        .use(remarkParse)
        .use(remarkGfm)
        .use(remarkRehype)
        .use(rehypeStringify)
        .processSync(markdown),
    );
  } catch {
    return markdown;
  }
}

export function RichTextEditor({
  value,
  onChange,
  placeholder = "Write…",
  className = "",
  editorClassName = "",
  disabled = false,
  minHeightClassName = "min-h-[120px]",
}: RichTextEditorProps) {
  const initialHtml = useMemo(() => {
    if (!value) return "";
    return isProbablyHtml(value) ? value : markdownToHtml(value);
  }, [value]);

  const lastEmittedRef = useRef<string | null>(null);

  const editor = useEditor({
    immediatelyRender: false,
    extensions: [
      StarterKit.configure({
        heading: false,
        paragraph: {
          HTMLAttributes: {
            class: "my-2",
          },
        },
      }),
      Link.configure({
        openOnClick: false,
        linkOnPaste: true,
        HTMLAttributes: {
          rel: "noopener noreferrer",
          target: "_blank",
        },
      }),
      Placeholder.configure({
        placeholder,
      }),
    ],
    content: initialHtml,
    editable: !disabled,
    onUpdate: ({ editor: next }) => {
      const html = next.isEmpty ? "" : next.getHTML();
      lastEmittedRef.current = html;
      onChange(html);
    },
    editorProps: {
      attributes: {
        class: `prose prose-invert max-w-none focus:outline-none ${minHeightClassName} px-3 py-2 rounded-md border border-gray-700 focus:border-gray-600 focus:ring-1 focus:ring-gray-600 leading-relaxed w-full ${
          disabled ? "bg-gray-900/30 cursor-not-allowed" : "bg-transparent"
        }`,
      },
    },
  });

  useEffect(() => {
    if (!editor) return;
    editor.setEditable(!disabled);
  }, [editor, disabled]);

  useEffect(() => {
    if (!editor) return;
    // Avoid clobbering user input when our parent updates from our own onUpdate.
    if (lastEmittedRef.current === value) return;

    const nextHtml = value
      ? isProbablyHtml(value)
        ? value
        : markdownToHtml(value)
      : "";

    const current = editor.getHTML();
    if (nextHtml && current === nextHtml) return;
    if (!nextHtml && editor.isEmpty) return;

    editor.commands.setContent(nextHtml || "", { emitUpdate: false });
  }, [editor, value]);

  const toggleLink = () => {
    if (!editor) return;
    const previousUrl = editor.getAttributes("link").href as string | undefined;
    const url = window.prompt("Link URL", previousUrl || "");
    if (url === null) return;
    if (url.trim() === "") {
      editor.chain().focus().extendMarkRange("link").unsetLink().run();
      return;
    }
    editor
      .chain()
      .focus()
      .extendMarkRange("link")
      .setLink({ href: url.trim() })
      .run();
  };

  if (!editor) {
    return (
      <div
        className={`${minHeightClassName} px-3 py-2 rounded-md border border-gray-700 bg-gray-900/30 text-sm text-gray-100 ${className}`}
      >
        Loading editor...
      </div>
    );
  }

  const toolbarButtonClass =
    "inline-flex items-center justify-center rounded border border-gray-700 bg-transparent px-2 py-1 text-gray-200 hover:bg-gray-800 disabled:opacity-50";

  return (
    <div className={`space-y-0 ${className}`}>
      <div className="flex flex-wrap gap-2 border border-gray-700 border-b-0 px-2 py-2 rounded-t-md">
        <button
          type="button"
          className={toolbarButtonClass}
          onClick={() => editor.chain().focus().toggleBold().run()}
          disabled={
            disabled || !editor.can().chain().focus().toggleBold().run()
          }
          aria-label="Bold"
          title="Bold"
        >
          <Bold className="h-4 w-4" />
        </button>
        <button
          type="button"
          className={toolbarButtonClass}
          onClick={() => editor.chain().focus().toggleItalic().run()}
          disabled={
            disabled || !editor.can().chain().focus().toggleItalic().run()
          }
          aria-label="Italic"
          title="Italic"
        >
          <Italic className="h-4 w-4" />
        </button>
        <button
          type="button"
          className={toolbarButtonClass}
          onClick={() => editor.chain().focus().toggleStrike().run()}
          disabled={
            disabled || !editor.can().chain().focus().toggleStrike().run()
          }
          aria-label="Strikethrough"
          title="Strikethrough"
        >
          <Strikethrough className="h-4 w-4" />
        </button>
        <button
          type="button"
          className={toolbarButtonClass}
          onClick={() => editor.chain().focus().toggleBulletList().run()}
          disabled={disabled}
          aria-label="Bullet list"
          title="Bullet list"
        >
          <List className="h-4 w-4" />
        </button>
        <button
          type="button"
          className={toolbarButtonClass}
          onClick={() => editor.chain().focus().toggleOrderedList().run()}
          disabled={disabled}
          aria-label="Ordered list"
          title="Ordered list"
        >
          <ListOrdered className="h-4 w-4" />
        </button>
        <button
          type="button"
          className={toolbarButtonClass}
          onClick={toggleLink}
          disabled={disabled}
          aria-label="Link"
          title="Link"
        >
          <Link2 className="h-4 w-4" />
        </button>
      </div>
      <div
        className={`rounded-b-md border border-t-0 border-gray-700 ${editorClassName}`}
      >
        <EditorContent editor={editor} />
      </div>
    </div>
  );
}
