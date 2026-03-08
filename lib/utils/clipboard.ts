import { toast } from "react-hot-toast";
import { getLogger } from "@/lib/utils/logger";

const log = getLogger("utils:clipboard");

/**
 * Copies text to the clipboard and shows a toast notification.
 *
 * @param text - The string to copy to the clipboard.
 * @param successMessage - Optional custom success message (default: "Copied to clipboard").
 * @returns A promise that resolves when the clipboard action is completed.
 */
export async function copyToClipboard(
    text: string | null | undefined,
    successMessage: string = "Copied to clipboard"
) {
    if (!text) return;

    try {
        await navigator.clipboard.writeText(text);
        toast.success(successMessage);
    } catch (err) {
        log.error("Failed to copy text to clipboard", { err });
        toast.error("Failed to copy to clipboard");
    }
}
