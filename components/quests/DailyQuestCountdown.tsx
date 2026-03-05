"use client";

import React, { useEffect, useState } from "react";
import { Clock } from "lucide-react";

interface DailyQuestCountdownProps {
    className?: string;
}

/**
 * Calculates the next UTC midnight in milliseconds
 */
function getNextUtcMidnight(): number {
    const now = new Date();
    return Date.UTC(
        now.getUTCFullYear(),
        now.getUTCMonth(),
        now.getUTCDate() + 1,
        0,
        0,
        0,
        0
    );
}

/**
 * Formats milliseconds into HH:MM:SS
 */
function formatHMS(ms: number): string {
    const totalSeconds = Math.max(0, Math.floor(ms / 1000));
    const hours = Math.floor(totalSeconds / 3600);
    const minutes = Math.floor((totalSeconds % 3600) / 60);
    const seconds = totalSeconds % 60;

    const h = hours.toString().padStart(2, "0");
    const m = minutes.toString().padStart(2, "0");
    const s = seconds.toString().padStart(2, "0");

    return `${h}:${m}:${s}`;
}

export const DailyQuestCountdown: React.FC<DailyQuestCountdownProps> = ({ className }) => {
    const [msRemaining, setMsRemaining] = useState<number>(0);
    const [mounted, setMounted] = useState(false);

    useEffect(() => {
        setMounted(true);

        const updateCountdown = () => {
            const now = Date.now();
            const nextReset = getNextUtcMidnight();
            setMsRemaining(nextReset - now);
        };

        updateCountdown();
        const interval = setInterval(updateCountdown, 1000);

        return () => clearInterval(interval);
    }, []);

    if (!mounted) {
        return (
            <div className={`flex items-center text-sm text-gray-400 ${className}`}>
                <Clock className="w-3.5 h-3.5 mr-1.5 opacity-70" />
                Resets in --:--:--
            </div>
        );
    }

    return (
        <div className={`flex items-center text-sm text-gray-400 ${className}`}>
            <Clock className="w-3.5 h-3.5 mr-1.5 text-cyan-500/70" />
            <span>
                Resets in <span className="font-mono text-cyan-400/90">{formatHMS(msRemaining)}</span>
            </span>
        </div>
    );
};
