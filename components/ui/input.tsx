import React from "react";

interface InputProps extends React.InputHTMLAttributes<HTMLInputElement> {}

export const Input = React.forwardRef<HTMLInputElement, InputProps>(
  ({ className = "", value, ...props }, ref) => {
    // Convert null values to empty strings to avoid React warnings
    const safeValue = value === null ? "" : value;

    return (
      <input
        className={`flex h-10 w-full rounded-md border border-gray-300 bg-transparent px-3 py-2 text-sm placeholder:text-gray-400 focus:outline-none focus:ring-2 focus:ring-gray-400 focus:ring-offset-2 disabled:cursor-not-allowed disabled:opacity-50 ${className}`}
        ref={ref}
        value={safeValue}
        {...props}
      />
    );
  }
);

Input.displayName = "Input";
