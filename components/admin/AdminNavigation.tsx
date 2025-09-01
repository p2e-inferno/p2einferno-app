import React from "react";
import Link from "next/link";
import { useRouter } from "next/router";
import { HomeIcon, BookOpen, Users, Award, FileText, CreditCard } from "lucide-react";

interface AdminNavigationProps {
  onClick?: () => void;
  variant?: "desktop" | "mobile";
}

export const adminNavItems = [
  { name: "Dashboard", href: "/admin", icon: HomeIcon },
  { name: "Bootcamps", href: "/admin/bootcamps", icon: BookOpen },
  { name: "Cohorts", href: "/admin/cohorts", icon: Users },
  { name: "Applications", href: "/admin/applications", icon: FileText },
  { name: "Payments", href: "/admin/payments", icon: CreditCard },
  { name: "Quests", href: "/admin/quests", icon: Award },
];

export default function AdminNavigation({
  onClick,
  variant = "desktop",
}: AdminNavigationProps) {
  const router = useRouter();

  const isActive = (path: string) => {
    // For the exact root admin path - only highlight when exactly on /admin
    if (path === "/admin") {
      return router.pathname === "/admin";
    }

    // For other paths, check if the current path matches or starts with the nav item path
    return router.pathname === path || router.pathname.startsWith(`${path}/`);
  };

  // Adjust styles based on variant
  const linkClass =
    variant === "desktop"
      ? "group flex items-center px-4 py-3 text-sm font-medium rounded-md"
      : "group flex items-center px-4 py-3 text-base font-medium rounded-md";

  const iconClass = variant === "desktop" ? "mr-3 h-5 w-5" : "mr-3 h-6 w-6";

  return (
    <nav
      className={
        variant === "desktop" ? "flex-1 px-2 space-y-1" : "flex-1 space-y-2"
      }
    >
      {adminNavItems.map((item) => (
        <Link
          key={item.name}
          href={item.href}
          onClick={onClick}
          className={`${linkClass} ${
            isActive(item.href)
              ? "bg-steel-red text-white"
              : "text-gray-300 hover:bg-gray-800 hover:text-white"
          }`}
        >
          <item.icon
            className={`${iconClass} ${
              isActive(item.href)
                ? "text-white"
                : "text-gray-400 group-hover:text-white"
            }`}
            aria-hidden="true"
          />
          {item.name}
        </Link>
      ))}

      <Link
        href="/"
        onClick={onClick}
        className={`${linkClass} text-gray-400 hover:text-white ${
          variant === "mobile" ? "hover:bg-gray-800" : ""
        }`}
      >
        <HomeIcon className={`${iconClass} text-gray-400`} />
        Back to App
      </Link>
    </nav>
  );
}
