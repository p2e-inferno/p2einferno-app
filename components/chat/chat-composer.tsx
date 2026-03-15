"use client";

import * as React from "react";
import { Send, Paperclip, X, Plus, Ban, Video } from "lucide-react";
import { useEditor, EditorContent } from "@tiptap/react";
import StarterKit from "@tiptap/starter-kit";
import Placeholder from "@tiptap/extension-placeholder";
import { AnimatePresence, motion } from "framer-motion";
import Image from "next/image";
import { toast } from "react-hot-toast";
import { upload } from "@vercel/blob/client";
import {
  buildChatAttachmentBlobPath,
  buildChatAttachmentProxyUrl,
} from "@/lib/chat/attachment-serving";
import { getChatAttachmentHandleUploadUrl } from "@/lib/chat/blob-upload-config";
import { canSubmitChatComposer } from "@/lib/chat/composer-submit";
import { validateChatAttachment } from "@/lib/chat/attachment-validation";
import { CHAT_ATTACHMENT_LIMITS } from "@/lib/chat/constants";
import type { ChatMessage } from "@/lib/chat/types";
import { getLogger } from "@/lib/utils/logger";
import { Loader2, AlertCircle } from "lucide-react";

const log = getLogger("components:chat-composer");

interface ChatAttachment {
  id: string;
  file: File;
  previewUrl: string;
  type: "image" | "video";
  status: "uploading" | "ready" | "error";
  url?: string;
  progress?: number;
}

interface UploadClientPayload {
  attachmentId: string;
  fileName: string;
  clientStartedAt: number;
}

interface ChatComposerProps {
  value: string;
  disabled: boolean;
  onChange: (value: string) => Promise<void>;
  onSubmit: (payload: {
    text: string;
    attachments?: ChatMessage["attachments"];
  }) => Promise<void>;
}

export function ChatComposer({
  value,
  disabled,
  onChange,
  onSubmit,
}: ChatComposerProps) {
  const [attachments, setAttachments] = React.useState<ChatAttachment[]>([]);
  const [dragState, setDragState] = React.useState<
    "none" | "supported" | "unsupported"
  >("none");
  const fileInputRef = React.useRef<HTMLInputElement>(null);
  const attachmentsRef = React.useRef<ChatAttachment[]>([]);

  React.useEffect(() => {
    attachmentsRef.current = attachments;
  }, [attachments]);

  const processFiles = (files: File[]) => {
    const nextAttachments = [...attachmentsRef.current];
    const uploadsToStart: Array<{ id: string; file: File }> = [];
    let limitReached = false;

    for (const file of files) {
      const { isValid, error } = validateChatAttachment(
        file,
        nextAttachments.length,
      );

      if (!isValid) {
        if (!limitReached) {
          toast.error(error || "Invalid file", {
            duration: 4000,
          });
          limitReached = true;
        }
        continue;
      }

      const isVideo = file.type.startsWith("video/");
      const attachmentId = Math.random().toString(36).substring(7);
      const attachment: ChatAttachment = {
        id: attachmentId,
        file,
        previewUrl: URL.createObjectURL(file),
        type: isVideo ? "video" : "image",
        status: "uploading",
      };
      nextAttachments.push(attachment);
      uploadsToStart.push({ id: attachmentId, file });
    }

    attachmentsRef.current = nextAttachments;
    setAttachments(nextAttachments);

    for (const uploadTarget of uploadsToStart) {
      void performUpload(uploadTarget.id, uploadTarget.file);
    }
  };

  const performUpload = async (id: string, file: File) => {
    // Sanitize filename: remove special characters and spaces to avoid CSP/API issues with SDK
    const timestamp = Date.now();
    const parts = file.name.split(".");
    const extension = parts.length > 1 ? parts.pop() : "file";
    const baseName = parts
      .join(".")
      .replace(/[^a-z0-9]/gi, "_")
      .toLowerCase();
    const blobPath = buildChatAttachmentBlobPath(
      `${baseName}-${id}-${timestamp}.${extension}`,
    );
    const startedAt = Date.now();
    const startedPerf = performance.now();
    let firstProgressAt: number | null = null;
    let reachedNinetyFiveAt: number | null = null;
    let reachedHundredAt: number | null = null;
    const clientPayload: UploadClientPayload = {
      attachmentId: id,
      fileName: file.name,
      clientStartedAt: startedAt,
    };

    log.debug("starting chat attachment upload", {
      attachmentId: id,
      fileName: file.name,
      blobPath,
      size: file.size,
      type: file.type,
      startedAt,
    });
    try {
      const newBlob = await upload(blobPath, file, {
        access: "private",
        handleUploadUrl: getChatAttachmentHandleUploadUrl(),
        clientPayload: JSON.stringify(clientPayload),
        multipart: false, // CRITICAL: Avoids platform CORS wall on vercel.com coordination API
        onUploadProgress: (progressEvent) => {
          const nowPerf = performance.now();
          if (firstProgressAt === null) {
            firstProgressAt = nowPerf;
            log.debug("chat attachment upload received first progress event", {
              attachmentId: id,
              elapsedMs: Math.round(nowPerf - startedPerf),
              loaded: progressEvent.loaded,
              total: progressEvent.total,
              percentage: progressEvent.percentage,
            });
          }
          if (reachedNinetyFiveAt === null && progressEvent.percentage >= 95) {
            reachedNinetyFiveAt = nowPerf;
            log.debug("chat attachment upload reached 95 percent", {
              attachmentId: id,
              elapsedMs: Math.round(nowPerf - startedPerf),
              loaded: progressEvent.loaded,
              total: progressEvent.total,
            });
          }
          if (reachedHundredAt === null && progressEvent.percentage >= 100) {
            reachedHundredAt = nowPerf;
            log.debug("chat attachment upload reached 100 percent", {
              attachmentId: id,
              elapsedMs: Math.round(nowPerf - startedPerf),
              loaded: progressEvent.loaded,
              total: progressEvent.total,
            });
          }
          log.debug("chat attachment upload progress", {
            attachmentId: id,
            percentage: progressEvent.percentage,
          });
          setAttachments((prev) =>
            prev.map((a) =>
              a.id === id ? { ...a, progress: progressEvent.percentage } : a,
            ),
          );
        },
      });
      const resolvedPerf = performance.now();

      log.info("chat attachment upload completed", {
        attachmentId: id,
        blobPath: newBlob.pathname,
        totalElapsedMs: Math.round(resolvedPerf - startedPerf),
        timeToFirstProgressMs:
          firstProgressAt === null
            ? null
            : Math.round(firstProgressAt - startedPerf),
        timeToNinetyFiveMs:
          reachedNinetyFiveAt === null
            ? null
            : Math.round(reachedNinetyFiveAt - startedPerf),
        timeToHundredMs:
          reachedHundredAt === null
            ? null
            : Math.round(reachedHundredAt - startedPerf),
        settleAfterHundredMs:
          reachedHundredAt === null
            ? null
            : Math.round(resolvedPerf - reachedHundredAt),
      });

      const attachmentUrl = buildChatAttachmentProxyUrl(
        newBlob.pathname,
        window.location.origin,
      );

      const readyAtPerf = performance.now();
      setAttachments((prev) =>
        prev.map((a) =>
          a.id === id ? { ...a, status: "ready", url: attachmentUrl } : a,
        ),
      );
      log.debug("chat attachment marked ready in composer state", {
        attachmentId: id,
        elapsedMs: Math.round(readyAtPerf - startedPerf),
        attachmentUrl,
      });
    } catch (error) {
      const failedAtPerf = performance.now();
      log.error("chat attachment upload failed", {
        attachmentId: id,
        elapsedMs: Math.round(failedAtPerf - startedPerf),
        error,
      });
      setAttachments((prev) =>
        prev.map((a) => (a.id === id ? { ...a, status: "error" } : a)),
      );
      toast.error(`Upload failed for ${file.name}`);
    }
  };

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
        role: "textbox",
        "aria-label": "Chat message",
      },
      handleKeyDown: (_view, event) => {
        if (event.key === "Enter" && !event.shiftKey) {
          event.preventDefault();
          void handleActionSubmit();
          return true;
        }
        return false;
      },
      handlePaste: (_view, event) => {
        const items = event.clipboardData?.items;
        if (!items) return false;

        const files: File[] = [];
        for (const item of Array.from(items)) {
          const isImage = item.type.startsWith("image/");
          const isVideo = item.type.startsWith("video/");

          if (isImage || isVideo) {
            const file = item.getAsFile();
            if (file) {
              files.push(file);
            }
          }
        }
        if (files.length > 0) {
          processFiles(files);
          return true;
        }
        return false;
      },
      handleDrop: () => {
        // Handled by the container div to support UI overlays
        return false;
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
      if (value === "" && !editor.isEmpty) {
        editor.commands.clearContent();
      } else if (value !== "" && editor.isEmpty) {
        editor.commands.setContent(value);
      }
    }
  }, [value, editor]);

  const removeAttachment = (id: string) => {
    setAttachments((prev) => {
      const found = prev.find((a) => a.id === id);
      if (found) URL.revokeObjectURL(found.previewUrl);
      const next = prev.filter((a) => a.id !== id);
      attachmentsRef.current = next;
      return next;
    });
  };

  const handleDragOver = (e: React.DragEvent) => {
    e.preventDefault();
    e.stopPropagation();

    if (disabled) return;

    if (e.dataTransfer.items && e.dataTransfer.items.length > 0) {
      const items = Array.from(e.dataTransfer.items);
      const allSupported = items.every(
        (item) =>
          item.kind === "file" &&
          CHAT_ATTACHMENT_LIMITS.allowedTypes.includes(item.type as any),
      );
      setDragState(allSupported ? "supported" : "unsupported");
    }
  };

  const handleDragLeave = (e: React.DragEvent) => {
    e.preventDefault();
    e.stopPropagation();
    setDragState("none");
  };

  const handleDrop = (e: React.DragEvent) => {
    e.preventDefault();
    e.stopPropagation();
    setDragState("none");

    if (disabled) return;

    const files = e.dataTransfer?.files;
    if (files && files.length > 0) {
      processFiles(Array.from(files));
    }
  };

  // We no longer need fileToBase64 as we use Vercel Blob URLs

  const handleActionSubmit = async () => {
    const content = editor?.getText() || "";

    // Convert attachments to LLM payload using Vercel URLs
    const encodedAttachments = attachments
      .filter((a) => a.status === "ready" && a.url)
      .map((a) => ({
        type: a.type,
        data: a.url!, // This is now a https://... URL
        name: a.file.name,
        size: a.file.size,
      }));

    if (!canSubmitChatComposer({ text: content, attachments, disabled })) {
      return;
    }

    // Clear composer immediately before the async request so the UI responds
    // right away instead of leaving attachment chips visible during the API call.
    editor?.commands.clearContent();
    attachments.forEach((a) => URL.revokeObjectURL(a.previewUrl));
    attachmentsRef.current = [];
    setAttachments([]);

    await onSubmit({
      text: content,
      attachments: encodedAttachments,
    });
  };

  const handleFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    if (e.target.files) {
      processFiles(Array.from(e.target.files));
    }
    e.target.value = "";
  };

  if (!editor) return null;

  const isSendDisabled = !canSubmitChatComposer({
    text: editor.getText(),
    attachments,
    disabled,
  });

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
                    <Video className="h-6 w-6 text-slate-400" />
                    <span className="max-w-full truncate text-[8px] text-slate-500">
                      {atat.file.name}
                    </span>
                  </div>
                )}

                {/* Upload Status Overlays */}
                {atat.status === "uploading" && (
                  <div className="absolute inset-0 flex flex-col items-center justify-center bg-slate-900/60 backdrop-blur-sm px-2">
                    <Loader2 className="h-5 w-5 animate-spin text-primary mb-1" />
                    {atat.progress !== undefined && (
                      <div className="w-full h-1 bg-white/10 rounded-full overflow-hidden">
                        <motion.div
                          className="h-full bg-primary"
                          initial={{ width: 0 }}
                          animate={{ width: `${atat.progress}%` }}
                          transition={{ duration: 0.1 }}
                        />
                      </div>
                    )}
                  </div>
                )}

                {atat.status === "error" && (
                  <div className="absolute inset-0 flex items-center justify-center bg-red-950/60 backdrop-blur-sm">
                    <AlertCircle className="h-5 w-5 text-red-400" />
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
      <div
        onDragOver={handleDragOver}
        onDragLeave={handleDragLeave}
        onDrop={handleDrop}
        className="relative flex items-end gap-2 rounded-3xl border border-white/10 bg-slate-950/80 p-2 shadow-inner ring-primary/20 transition-all focus-within:border-white/20 focus-within:ring-4"
      >
        {/* Drag Overlay */}
        <AnimatePresence>
          {dragState !== "none" && (
            <motion.div
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              className="absolute inset-0 z-10 flex items-center justify-center rounded-3xl bg-slate-900/60 backdrop-blur-[2px] pointer-events-none"
            >
              <div
                className={`flex items-center gap-2 rounded-full px-4 py-2 text-sm font-medium shadow-2xl ${
                  dragState === "supported"
                    ? "bg-emerald-500/20 text-emerald-400 border border-emerald-500/30"
                    : "bg-slate-800/60 text-slate-400 border border-white/5"
                }`}
              >
                {dragState === "supported" ? (
                  <Plus className="h-4 w-4" />
                ) : (
                  <Ban className="h-4 w-4 opacity-50" />
                )}
                <span>
                  {dragState === "supported"
                    ? "Drop to attach"
                    : "Unsupported file type"}
                </span>
              </div>
            </motion.div>
          )}
        </AnimatePresence>

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
            accept={CHAT_ATTACHMENT_LIMITS.allowedTypes.join(",")}
          />
        </button>

        <div className="min-w-0 flex-1 px-1">
          <EditorContent editor={editor} />
        </div>

        <button
          type="button"
          onClick={() => void handleActionSubmit()}
          className="flex h-10 w-10 shrink-0 items-center justify-center rounded-2xl bg-primary text-white shadow-lg shadow-primary/20 transition-all hover:bg-primary/90 hover:scale-[1.05] active:scale-[0.95] disabled:cursor-not-allowed disabled:opacity-50 disabled:grayscale"
          aria-label="Send message"
          disabled={isSendDisabled}
        >
          <Send className="h-4.5 w-4.5" />
        </button>
      </div>
    </div>
  );
}
