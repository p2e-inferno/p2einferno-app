"use client";

import * as React from "react";
import { Send, Paperclip, X, File as FileIcon } from "lucide-react";
import { useEditor, EditorContent } from "@tiptap/react";
import StarterKit from "@tiptap/starter-kit";
import Placeholder from "@tiptap/extension-placeholder";
import { AnimatePresence, motion } from "framer-motion";
import Image from "next/image";

interface ChatAttachment {
  id: string;
  file: File;
  previewUrl: string;
  type: "image" | "file";
}

interface ChatComposerProps {
  value: string;
  disabled: boolean;
  onChange: (value: string) => Promise<void>;
  onSubmit: (value: string) => Promise<void>;
}

export function ChatComposer({
  value,
  disabled,
  onChange,
  onSubmit,
}: ChatComposerProps) {
  const [attachments, setAttachments] = React.useState<ChatAttachment[]>([]);
  const fileInputRef = React.useRef<HTMLInputElement>(null);

  const editor = useEditor({
    immediatelyRender: false,
    extensions: [
      StarterKit.configure({
        heading: false,
        bulletList: false,
        orderedList: false,
        codeBlock: false,
        blockquote: false,
      }),
      Placeholder.configure({
        placeholder: "Ask anything...",
      }),
    ],
    content: value,
    editorProps: {
      attributes: {
        class:
          "prose prose-invert max-w-none focus:outline-none min-h-[40px] max-h-[200px] overflow-y-auto px-1 py-2 text-sm text-white placeholder:text-slate-500 leading-relaxed transition-all",
      },
      handleKeyDown: (_view, event) => {
        if (event.key === "Enter" && !event.shiftKey) {
          event.preventDefault();
          handleActionSubmit();
          return true;
        }
        return false;
      },
      handlePaste: (_view, event) => {
        const items = event.clipboardData?.items;
        if (!items) return false;

        let handled = false;
        for (const item of Array.from(items)) {
          if (item.type.startsWith("image/")) {
            const file = item.getAsFile();
            if (file) {
              addFile(file);
              handled = true;
            }
          }
        }
        return handled;
      },
      handleDrop: (_view, event) => {
        const files = event.dataTransfer?.files;
        if (!files || files.length === 0) return false;

        for (const file of Array.from(files)) {
          addFile(file);
        }
        return true;
      },
    },
    onUpdate: ({ editor }) => {
      const text = editor.getText();
      void onChange(text);
    },
  });

  // Sync external value (e.g. from prompt selection) to editor
  React.useEffect(() => {
    if (editor && value !== editor.getText()) {
      // Small optimization: only update if significant change, or clearing
      if (value === "" && !editor.isEmpty) {
        editor.commands.clearContent();
      } else if (value !== "" && editor.isEmpty) {
        editor.commands.setContent(value);
      }
    }
  }, [value, editor]);

  const addFile = (file: File) => {
    const isImage = file.type.startsWith("image/");
    const attachment: ChatAttachment = {
      id: Math.random().toString(36).substring(7),
      file,
      previewUrl: URL.createObjectURL(file),
      type: isImage ? "image" : "file",
    };
    setAttachments((prev) => [...prev, attachment]);
  };

  const removeAttachment = (id: string) => {
    setAttachments((prev) => {
      const found = prev.find((a) => a.id === id);
      if (found) URL.revokeObjectURL(found.previewUrl);
      return prev.filter((a) => a.id !== id);
    });
  };

  const handleActionSubmit = async () => {
    const content = editor?.getText() || "";
    if (content.trim().length === 0 && attachments.length === 0) return;

    // In a real app, we'd upload attachments here first. 
    // For now, we clear the UI as expected by the user.
    await onSubmit(content);

    // Cleanup
    editor?.commands.clearContent();
    attachments.forEach((a) => URL.revokeObjectURL(a.previewUrl));
    setAttachments([]);
  };

  const handleFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    if (e.target.files) {
      Array.from(e.target.files).forEach(addFile);
    }
    // Clear input so same file can be selected again if removed
    e.target.value = "";
  };

  if (!editor) return null;

  return (
    <div className="flex flex-col gap-2">
      {/* Attachment Chips Row */}
      <AnimatePresence>
        {attachments.length > 0 && (
          <motion.div
            initial={{ opacity: 0, height: 0 }}
            animate={{ opacity: 1, height: "auto" }}
            exit={{ opacity: 0, height: 0 }}
            className="flex flex-wrap gap-2 px-1"
          >
            {attachments.map((atat) => (
              <motion.div
                key={atat.id}
                layout
                initial={{ scale: 0.8, opacity: 0 }}
                animate={{ scale: 1, opacity: 1 }}
                exit={{ scale: 0.8, opacity: 0 }}
                className="group relative flex h-16 w-16 items-center justify-center overflow-hidden rounded-xl border border-white/10 bg-slate-800 shadow-lg"
              >
                {atat.type === "image" ? (
                  <Image
                    src={atat.previewUrl}
                    alt="preview"
                    fill
                    className="object-cover transition-transform group-hover:scale-110"
                  />
                ) : (
                  <div className="flex flex-col items-center gap-1 p-2">
                    <FileIcon className="h-6 w-6 text-slate-400" />
                    <span className="max-w-full truncate text-[8px] text-slate-500">
                      {atat.file.name}
                    </span>
                  </div>
                )}
                <button
                  type="button"
                  onClick={() => removeAttachment(atat.id)}
                  className="absolute -right-1 -top-1 flex h-6 w-6 items-center justify-center rounded-full bg-slate-900/80 text-white opacity-0 backdrop-blur-sm transition-opacity group-hover:opacity-100 hover:bg-red-500"
                >
                  <X className="h-3 w-3" />
                </button>
              </motion.div>
            ))}
          </motion.div>
        )}
      </AnimatePresence>

      {/* Main Input Area */}
      <div className="relative flex items-end gap-2 rounded-3xl border border-white/10 bg-slate-950/80 p-2 shadow-inner ring-primary/20 transition-all focus-within:border-white/20 focus-within:ring-4">
        <button
          type="button"
          onClick={() => fileInputRef.current?.click()}
          className="flex h-10 w-10 shrink-0 items-center justify-center rounded-2xl text-slate-400 transition-all hover:bg-white/5 hover:text-white disabled:opacity-50"
          aria-label="Attach file"
          disabled={disabled}
        >
          <Paperclip className="h-5 w-5" />
          <input
            type="file"
            ref={fileInputRef}
            onChange={handleFileChange}
            className="hidden"
            multiple
          />
        </button>

        <div className="min-w-0 flex-1 px-1">
          <EditorContent editor={editor} />
        </div>

        <button
          type="button"
          onClick={handleActionSubmit}
          className="flex h-10 w-10 shrink-0 items-center justify-center rounded-2xl bg-primary text-white shadow-lg shadow-primary/20 transition-all hover:bg-primary/90 hover:scale-[1.05] active:scale-[0.95] disabled:cursor-not-allowed disabled:opacity-50 disabled:grayscale"
          aria-label="Send message"
          disabled={disabled || (editor.isEmpty && attachments.length === 0)}
        >
          <Send className="h-4.5 w-4.5" />
        </button>
      </div>

    </div>
  );
}

