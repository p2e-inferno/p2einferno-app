import React from "react";
import Link from "next/link";
import { useRouter } from "next/router";
import { cn } from "@/lib/utils/wallet-change";
import {
  FlameIcon,
  CrystalIcon,
  SwordIcon,
  LightningIcon,
  ProfileIcon,
} from "../icons/dashboard-icons";

interface DockItem {
  id: string;
  label: string;
  href: string;
  icon: React.ComponentType<{ className?: string; size?: number }>;
  color: string;
  activeColor: string;
  pulseColor: string;
}

const dockItems: DockItem[] = [
  {
    id: "lobby",
    label: "Lobby",
    href: "/lobby",
    icon: FlameIcon,
    color: "text-flame-yellow",
    activeColor: "text-flame-orange",
    pulseColor: "shadow-flame-yellow/50",
  },
  {
    id: "quests",
    label: "Quests",
    href: "/lobby/quests",
    icon: SwordIcon,
    color: "text-magenta-400",
    activeColor: "text-magenta-300",
    pulseColor: "shadow-magenta-400/50",
  },
  {
    id: "bounties",
    label: "Bounties",
    href: "/lobby/bounties",
    icon: CrystalIcon,
    color: "text-cyan-300",
    activeColor: "text-cyan-200",
    pulseColor: "shadow-cyan-300/50",
  },
  {
    id: "events",
    label: "Events",
    href: "/lobby/events",
    icon: LightningIcon,
    color: "text-cyan-400",
    activeColor: "text-cyan-300",
    pulseColor: "shadow-cyan-400/50",
  },
  {
    id: "profile",
    label: "Profile",
    href: "/lobby/profile",
    icon: ProfileIcon,
    color: "text-purple-400",
    activeColor: "text-purple-300",
    pulseColor: "shadow-purple-400/50",
  },
];

export const BottomDock: React.FC = () => {
  const router = useRouter();

  return (
    <div className="fixed bottom-0 left-0 right-0 z-50">
      {/* Backdrop blur */}
      <div className="absolute inset-0 bg-gradient-to-t from-black/90 via-black/60 to-transparent backdrop-blur-md" />

      {/* Dock container */}
      <div className="relative mx-auto max-w-md px-4 pb-4 pt-2">
        <div className="relative rounded-2xl bg-gradient-to-r from-purple-900/80 via-indigo-900/80 to-purple-900/80 p-3 shadow-2xl shadow-purple-900/30 backdrop-blur-xl border border-purple-500/20">
          {/* Glow effect */}
          <div className="absolute inset-0 rounded-2xl bg-gradient-to-r from-cyan-500/10 via-magenta-500/10 to-cyan-500/10 animate-pulse" />

          {/* Dock items */}
          <div className="relative flex items-center justify-around">
            {dockItems.map((item) => {
              const isActive = router.pathname === item.href;
              const Icon = item.icon;

              return (
                <Link
                  key={item.id}
                  href={item.href}
                  className={cn(
                    "group relative flex flex-col items-center p-3 rounded-xl transition-all duration-300 ease-out",
                    "hover:scale-110 hover:-translate-y-1",
                    "active:scale-95",
                    isActive && "scale-110 -translate-y-1",
                  )}
                >
                  {/* Icon background */}
                  <div
                    className={cn(
                      "relative p-2 rounded-xl transition-all duration-300",
                      "bg-gradient-to-br from-white/10 to-white/5",
                      "group-hover:from-white/20 group-hover:to-white/10",
                      "group-hover:shadow-lg",
                      isActive && [
                        "shadow-lg",
                        item.pulseColor,
                        "from-white/20 to-white/10",
                      ],
                    )}
                  >
                    {/* Active indicator */}
                    {isActive && (
                      <div className="absolute -inset-0.5 rounded-xl bg-gradient-to-r from-cyan-500/50 via-magenta-500/50 to-cyan-500/50 animate-pulse" />
                    )}

                    {/* Icon */}
                    <div className="relative">
                      <Icon
                        size={24}
                        className={cn(
                          "transition-colors duration-300",
                          isActive ? item.activeColor : item.color,
                          "group-hover:drop-shadow-lg",
                        )}
                      />
                    </div>
                  </div>

                  {/* Label */}
                  <span
                    className={cn(
                      "mt-1 text-xs font-medium transition-all duration-300",
                      isActive
                        ? "text-white opacity-100"
                        : "text-faded-grey opacity-70",
                      "group-hover:text-white group-hover:opacity-100",
                    )}
                  >
                    {item.label}
                  </span>

                  {/* Hover glow */}
                  <div
                    className={cn(
                      "absolute inset-0 rounded-xl opacity-0 transition-opacity duration-300",
                      "group-hover:opacity-100",
                      "bg-gradient-to-r from-transparent via-white/5 to-transparent",
                    )}
                  />
                </Link>
              );
            })}
          </div>
        </div>

        {/* Safe area for home indicator on iOS */}
        <div className="h-safe-bottom" />
      </div>
    </div>
  );
};
