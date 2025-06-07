import React, { useState, useRef, useEffect, ReactNode } from 'react';

interface CustomDropdownProps {
  trigger: ReactNode;
  children: ReactNode;
  contentClassName?: string;
  align?: 'end' | 'start';
}

export function CustomDropdown({ trigger, children, contentClassName = '', align = 'end' }: CustomDropdownProps) {
  const [isOpen, setIsOpen] = useState(false);
  const dropdownRef = useRef<HTMLDivElement>(null);

  const toggleDropdown = (e: React.MouseEvent) => {
    e.stopPropagation();
    setIsOpen(!isOpen);
  };

  useEffect(() => {
    const handleClickOutside = (event: MouseEvent) => {
      if (dropdownRef.current && !dropdownRef.current.contains(event.target as Node)) {
        setIsOpen(false);
      }
    };

    document.addEventListener('mousedown', handleClickOutside);
    return () => {
      document.removeEventListener('mousedown', handleClickOutside);
    };
  }, []);

  const alignmentClass = align === 'end' ? 'right-0' : 'left-0';

  return (
    <div className="relative inline-block text-left" ref={dropdownRef}>
      <div onClick={toggleDropdown} className="cursor-pointer">
        {trigger}
      </div>

      {isOpen && (
        <div
          className={`absolute ${alignmentClass} mt-2 w-56 origin-top-right rounded-md bg-card shadow-lg ring-1 ring-border focus:outline-none z-50 ${contentClassName}`}
          role="menu"
          aria-orientation="vertical"
          aria-labelledby="menu-button"
        >
          <div className="py-1" role="none" onClick={() => setIsOpen(false)}>
            {children}
          </div>
        </div>
      )}
    </div>
  );
}

interface CustomDropdownItemProps {
    children: ReactNode;
    onClick?: (event: React.MouseEvent<HTMLAnchorElement, MouseEvent>) => void;
}

export const CustomDropdownItem = ({ children, onClick }: CustomDropdownItemProps) => {
    const handleClick = (event: React.MouseEvent<HTMLAnchorElement, MouseEvent>) => {
        event.preventDefault();
        if (onClick) {
            onClick(event);
        }
    };

    return (
        <a
            href="#"
            onClick={handleClick}
            className="text-foreground flex items-center w-full px-4 py-2 text-sm hover:bg-accent"
            role="menuitem"
        >
            {children}
        </a>
    )
}

export const CustomDropdownSeparator = () => {
    return <hr className="border-border/50 my-1" />;
}

export const CustomDropdownLabel = ({children}: {children: ReactNode}) => {
    return <div className="px-4 py-2 text-sm text-muted-foreground">{children}</div>
} 