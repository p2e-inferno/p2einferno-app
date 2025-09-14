import React, {
  useState,
  useRef,
  useEffect,
  ReactNode,
  useLayoutEffect,
} from "react";
import { createPortal } from "react-dom";

interface CustomDropdownProps {
  trigger: ReactNode;
  children: ReactNode;
  contentClassName?: string;
  align?: "end" | "start";
  onOpenChange?: (open: boolean) => void;
}

export function CustomDropdown({
  trigger,
  children,
  contentClassName = "",
  align = "end",
  onOpenChange,
}: CustomDropdownProps) {
  const [isOpen, setIsOpen] = useState(false);
  const dropdownRef = useRef<HTMLDivElement>(null);
  const triggerRef = useRef<HTMLDivElement>(null);
  const contentRef = useRef<HTMLDivElement>(null);
  const [coords, setCoords] = useState<{ top: number; left: number } | null>(
    null,
  );
  const [isPositioned, setIsPositioned] = useState(false);

  const toggleDropdown = (e: React.MouseEvent) => {
    e.stopPropagation();
    setIsOpen((v) => !v);
  };

  useEffect(() => {
    const handleClickOutside = (event: MouseEvent) => {
      const target = event.target as Node;
      const inTrigger = dropdownRef.current?.contains(target);
      const inContent = contentRef.current?.contains(target);
      if (!inTrigger && !inContent) {
        setIsOpen(false);
      }
    };

    document.addEventListener("mousedown", handleClickOutside);
    return () => {
      document.removeEventListener("mousedown", handleClickOutside);
    };
  }, []);

  // Notify parent when open state changes
  useEffect(() => {
    if (onOpenChange) onOpenChange(isOpen);
  }, [isOpen, onOpenChange]);

  // Compute viewport-aware position for the dropdown content
  const computePosition = () => {
    if (!triggerRef.current || !contentRef.current) return;

    const rect = triggerRef.current.getBoundingClientRect();
    const content = contentRef.current;
    const vw = window.innerWidth;
    const vh = window.innerHeight;
    const pad = 8; // viewport padding

    // Measure content
    const contentRect = content.getBoundingClientRect();
    const contentWidth = contentRect.width || content.offsetWidth || 0;
    const contentHeight = contentRect.height || content.offsetHeight || 0;

    // Preferred bottom placement
    let top = rect.bottom + pad;
    let left = align === "end" ? rect.right - contentWidth : rect.left;

    // Clamp horizontal within viewport
    left = Math.min(Math.max(left, pad), vw - contentWidth - pad);

    // If it overflows bottom, try placing above
    if (
      top + contentHeight + pad > vh &&
      rect.top - contentHeight - pad >= pad
    ) {
      top = rect.top - contentHeight - pad;
    }

    // Final clamp vertically
    top = Math.min(Math.max(top, pad), vh - contentHeight - pad);

    setCoords({ top, left });
    setIsPositioned(true);
  };

  // Compute immediately after mount/paint when opening
  useLayoutEffect(() => {
    if (!isOpen) return;
    setIsPositioned(false);
    computePosition();
    const t = setTimeout(() => computePosition(), 0);
    return () => clearTimeout(t);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [isOpen, align, contentClassName, children]);

  useEffect(() => {
    if (!isOpen) return;
    const raf = requestAnimationFrame(() => computePosition());
    const onResize = () => computePosition();
    const onScroll = () => computePosition();
    const ro = contentRef.current
      ? new ResizeObserver(() => computePosition())
      : null;
    if (ro && contentRef.current) ro.observe(contentRef.current);
    window.addEventListener("resize", onResize);
    window.addEventListener("scroll", onScroll, true);
    return () => {
      cancelAnimationFrame(raf);
      window.removeEventListener("resize", onResize);
      window.removeEventListener("scroll", onScroll, true);
      if (ro) ro.disconnect();
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [isOpen, align]);

  return (
    <div className="relative inline-block text-left" ref={dropdownRef}>
      <div onClick={toggleDropdown} className="cursor-pointer" ref={triggerRef}>
        {trigger}
      </div>

      {isOpen && typeof document !== "undefined"
        ? createPortal(
            <div
              ref={contentRef}
              style={{
                position: "fixed",
                top: coords ? `${coords.top}px` : undefined,
                left: coords ? `${coords.left}px` : undefined,
                visibility: isPositioned ? "visible" : "hidden",
              }}
              className={`mt-0 w-56 rounded-md bg-card shadow-lg ring-1 ring-border focus:outline-none z-[100] ${contentClassName}`}
              role="menu"
              aria-orientation="vertical"
              aria-labelledby="menu-button"
            >
              <div
                className="py-1"
                role="none"
                onClick={() => setIsOpen(false)}
              >
                {children}
              </div>
            </div>,
            document.body,
          )
        : null}
    </div>
  );
}

interface CustomDropdownItemProps {
  children: ReactNode;
  onClick?: (event: React.MouseEvent<HTMLAnchorElement, MouseEvent>) => void;
  disabled?: boolean;
}

export const CustomDropdownItem = ({
  children,
  onClick,
  disabled = false,
}: CustomDropdownItemProps) => {
  const handleClick = (
    event: React.MouseEvent<HTMLAnchorElement, MouseEvent>,
  ) => {
    event.preventDefault();
    if (!disabled && onClick) {
      onClick(event);
    }
  };

  return (
    <a
      href="#"
      onClick={handleClick}
      className={`text-foreground flex items-center w-full px-4 py-2 text-sm ${
        disabled
          ? "opacity-50 cursor-not-allowed"
          : "hover:bg-accent cursor-pointer"
      }`}
      role="menuitem"
      aria-disabled={disabled}
    >
      {children}
    </a>
  );
};

export const CustomDropdownSeparator = () => {
  return <hr className="border-border/50 my-1" />;
};

export const CustomDropdownLabel = ({ children }: { children: ReactNode }) => {
  return (
    <div className="px-4 py-2 text-sm text-muted-foreground">{children}</div>
  );
};
