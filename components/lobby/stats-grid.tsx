import React from "react";
import { CrystalIcon, TrophyIcon, ScrollIcon } from "../icons/dashboard-icons";
import { AlertTriangle } from "lucide-react";

interface StatsGridProps {
  stats: {
    totalApplications: number;
    completedBootcamps: number;
    totalPoints: number;
    pendingPayments: number;
  };
}

/**
 * Stats grid component displaying key user metrics
 * Shows available bootcamps, completed bootcamps, pending applications, and dropouts
 */
export const StatsGrid: React.FC<StatsGridProps> = ({ stats }) => {
  return (
    <div className="grid grid-cols-2 lg:grid-cols-4 gap-4 mb-8">
      {/* Available Bootcamps */}
      <div className="bg-gradient-to-br from-purple-800/30 to-purple-900/30 rounded-xl p-4 border border-purple-500/20 backdrop-blur-sm">
        <div className="flex items-center space-x-3">
          <CrystalIcon size={32} className="text-cyan-400" />
          <div>
            <p className="text-2xl font-bold text-cyan-300">3</p>
            <p className="text-xs text-faded-grey">Available Bootcamps</p>
          </div>
        </div>
      </div>

      {/* Completed Bootcamps */}
      <div className="bg-gradient-to-br from-yellow-800/30 to-yellow-900/30 rounded-xl p-4 border border-yellow-500/20 backdrop-blur-sm">
        <div className="flex items-center space-x-3">
          <TrophyIcon size={32} className="text-yellow-400" />
          <div>
            <p className="text-2xl font-bold text-yellow-300">
              {stats.completedBootcamps}
            </p>
            <p className="text-xs text-faded-grey">Completed bootcamps</p>
          </div>
        </div>
      </div>

      {/* Pending Applications */}
      <div className="bg-gradient-to-br from-magenta-800/30 to-magenta-900/30 rounded-xl p-4 border border-magenta-500/20 backdrop-blur-sm">
        <div className="flex items-center space-x-3">
          <ScrollIcon size={32} className="text-magenta-400" />
          <div>
            <p className="text-2xl font-bold text-magenta-300">
              {stats.totalApplications}
            </p>
            <p className="text-xs text-faded-grey">Pending applications</p>
          </div>
        </div>
      </div>

      {/* Drop outs */}
      <div className="bg-gradient-to-br from-red-800/30 to-red-900/30 rounded-xl p-4 border border-red-500/20 backdrop-blur-sm">
        <div className="flex items-center space-x-3">
          <AlertTriangle size={32} className="text-red-400" />
          <div>
            <p className="text-2xl font-bold text-red-300">0</p>
            <p className="text-xs text-faded-grey">Drop outs</p>
          </div>
        </div>
      </div>
    </div>
  );
};
