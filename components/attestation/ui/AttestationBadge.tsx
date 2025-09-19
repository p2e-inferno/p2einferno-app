/**
 * Attestation Badge Component
 * Shows the category of an attestation with appropriate styling
 */

import React from "react";
import { Badge } from "@/components/ui/badge";
import { Award, Users, Shield, Star, CheckCircle } from "lucide-react";

interface AttestationBadgeProps {
  category: "attendance" | "social" | "verification" | "review" | "achievement";
  className?: string;
}

const categoryConfig = {
  attendance: {
    label: "Attendance",
    icon: CheckCircle,
    className:
      "text-green-600 bg-green-100 dark:bg-green-900/20 border-green-200",
  },
  social: {
    label: "Social",
    icon: Users,
    className: "text-blue-600 bg-blue-100 dark:bg-blue-900/20 border-blue-200",
  },
  verification: {
    label: "Verification",
    icon: Shield,
    className:
      "text-purple-600 bg-purple-100 dark:bg-purple-900/20 border-purple-200",
  },
  review: {
    label: "Review",
    icon: Star,
    className:
      "text-orange-600 bg-orange-100 dark:bg-orange-900/20 border-orange-200",
  },
  achievement: {
    label: "Achievement",
    icon: Award,
    className:
      "text-yellow-600 bg-yellow-100 dark:bg-yellow-900/20 border-yellow-200",
  },
};

export const AttestationBadge: React.FC<AttestationBadgeProps> = ({
  category,
  className = "",
}) => {
  const config = categoryConfig[category];
  const Icon = config.icon;

  return (
    <Badge variant="outline" className={`${config.className} ${className}`}>
      <Icon className="w-3 h-3 mr-1" />
      {config.label}
    </Badge>
  );
};
