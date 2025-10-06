import React from "react";
import { CheckCircle, Clock, PlayCircle } from "lucide-react";

interface MilestoneProgressRingProps {
  progress: number;
  size?: number;
  status: string;
  className?: string;
}

export default function MilestoneProgressRing({
  progress,
  size = 60,
  status,
  className = "",
}: MilestoneProgressRingProps) {
  const radius = (size - 8) / 2;
  const circumference = radius * 2 * Math.PI;
  const strokeDashoffset = circumference - (progress / 100) * circumference;

  const getStatusColor = () => {
    switch (status) {
      case "completed":
        return "stroke-green-400";
      case "in_progress":
        return "stroke-flame-yellow";
      case "not_started":
        return "stroke-gray-600";
      default:
        return "stroke-gray-600";
    }
  };

  const getStatusIcon = () => {
    switch (status) {
      case "completed":
        return <CheckCircle size={size * 0.4} className="text-green-400" />;
      case "in_progress":
        return <PlayCircle size={size * 0.4} className="text-flame-yellow" />;
      case "not_started":
        return <Clock size={size * 0.4} className="text-gray-400" />;
      default:
        return <Clock size={size * 0.4} className="text-gray-400" />;
    }
  };

  return (
    <div
      className={`relative ${className}`}
      style={{ width: size, height: size }}
    >
      {/* Background Circle */}
      <svg
        className="transform -rotate-90 absolute inset-0"
        width={size}
        height={size}
      >
        <circle
          cx={size / 2}
          cy={size / 2}
          r={radius}
          stroke="rgb(75 85 99)"
          strokeWidth="4"
          fill="transparent"
        />
        {/* Progress Circle */}
        <circle
          cx={size / 2}
          cy={size / 2}
          r={radius}
          stroke="currentColor"
          strokeWidth="4"
          fill="transparent"
          strokeDasharray={circumference}
          strokeDashoffset={strokeDashoffset}
          strokeLinecap="round"
          className={`transition-all duration-500 ${getStatusColor()}`}
        />
      </svg>

      {/* Center Icon */}
      <div className="absolute inset-0 flex items-center justify-center">
        {getStatusIcon()}
      </div>

      {/* Progress Text */}
      {status === "in_progress" && (
        <div className="absolute -bottom-1 left-1/2 transform -translate-x-1/2">
          <span className="text-xs font-bold text-flame-yellow bg-background/80 px-2 py-1 rounded">
            {Math.round(progress)}%
          </span>
        </div>
      )}
    </div>
  );
}
