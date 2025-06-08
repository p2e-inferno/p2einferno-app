import { useCallback } from "react";

/**
 * Hook to prevent layout shifts when modals hide scrollbars
 * Provides fallback for browsers that don't support scrollbar-gutter: stable
 */
export function useScrollbarFix() {
  const getScrollbarWidth = useCallback(() => {
    // Create a temporary element to measure scrollbar width
    const outer = document.createElement("div");
    outer.style.visibility = "hidden";
    outer.style.overflow = "scroll";
    (outer.style as any).msOverflowStyle = "scrollbar"; // needed for WinJS apps
    document.body.appendChild(outer);

    const inner = document.createElement("div");
    outer.appendChild(inner);

    const scrollbarWidth = outer.offsetWidth - inner.offsetWidth;
    document.body.removeChild(outer);

    return scrollbarWidth;
  }, []);

  const preventLayoutShift = useCallback(() => {
    // Check if scrollbar-gutter is supported
    const supportsScrollbarGutter = CSS.supports("scrollbar-gutter: stable");

    if (supportsScrollbarGutter) {
      // Modern browsers with scrollbar-gutter support
      document.body.style.overflow = "hidden";
      return;
    }

    // Fallback for browsers without scrollbar-gutter support
    const currentWidth = document.body.offsetWidth;
    document.body.style.overflow = "hidden";
    const newWidth = document.body.offsetWidth;
    const scrollbarWidth = newWidth - currentWidth;

    if (scrollbarWidth > 0) {
      document.body.style.paddingRight = `${scrollbarWidth}px`;
    }
  }, []);

  const restoreLayoutShift = useCallback(() => {
    document.body.style.overflow = "";
    document.body.style.paddingRight = "";
  }, []);

  return {
    preventLayoutShift,
    restoreLayoutShift,
    getScrollbarWidth,
  };
}
