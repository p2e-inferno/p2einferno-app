import React, { useState } from "react";
import { ChevronDown, ChevronUp, BookOpen, Target } from "lucide-react";
import type { WeeklyContentCardProps } from "./types";

/**
 * WeeklyContentCard Component
 *
 * Displays weekly bootcamp content with expandable details including:
 * - Week number and title
 * - Description and topics covered
 * - Deliverables and assignments
 * - Expandable/collapsible interface
 *
 * @param content - Weekly content data
 * @param isExpanded - Whether the card is expanded (optional)
 * @param onToggleExpand - Handler for expand/collapse (optional)
 */
export const WeeklyContentCard: React.FC<WeeklyContentCardProps> = ({
  content,
  isExpanded: controlledExpanded,
  onToggleExpand,
}) => {
  const [internalExpanded, setInternalExpanded] = useState(false);

  // Use controlled state if provided, otherwise use internal state
  const isExpanded =
    controlledExpanded !== undefined ? controlledExpanded : internalExpanded;
  const toggleExpand =
    onToggleExpand || (() => setInternalExpanded(!internalExpanded));

  return (
    <div className="bg-card border border-faded-grey/20 rounded-lg overflow-hidden">
      <button
        onClick={toggleExpand}
        className="w-full p-4 text-left hover:bg-background/50 transition-colors"
      >
        <div className="flex items-center justify-between">
          <div className="flex items-center space-x-3">
            <div className="w-8 h-8 bg-flame-yellow/20 rounded-full flex items-center justify-center">
              <span className="text-flame-yellow font-bold text-sm">
                {content.week}
              </span>
            </div>
            <div>
              <h4 className="font-bold">{content.title}</h4>
              <p className="text-sm text-faded-grey">{content.description}</p>
            </div>
          </div>
          {isExpanded ? (
            <ChevronUp className="w-5 h-5 text-faded-grey" />
          ) : (
            <ChevronDown className="w-5 h-5 text-faded-grey" />
          )}
        </div>
      </button>

      {isExpanded && (
        <div className="px-4 pb-4 border-t border-faded-grey/20">
          <div className="grid md:grid-cols-2 gap-4 mt-4">
            {/* Topics */}
            <div>
              <div className="flex items-center space-x-2 mb-3">
                <BookOpen className="w-4 h-4 text-cyan-400" />
                <h5 className="font-medium">Topics Covered</h5>
              </div>
              <ul className="space-y-1">
                {content.topics.map((topic, index) => (
                  <li
                    key={index}
                    className="text-sm text-faded-grey flex items-start"
                  >
                    <span className="w-1.5 h-1.5 bg-cyan-400 rounded-full mt-2 mr-2 flex-shrink-0"></span>
                    {topic}
                  </li>
                ))}
              </ul>
            </div>

            {/* Deliverables */}
            <div>
              <div className="flex items-center space-x-2 mb-3">
                <Target className="w-4 h-4 text-flame-yellow" />
                <h5 className="font-medium">Deliverables</h5>
              </div>
              <ul className="space-y-1">
                {content.deliverables.map((deliverable, index) => (
                  <li
                    key={index}
                    className="text-sm text-faded-grey flex items-start"
                  >
                    <span className="w-1.5 h-1.5 bg-flame-yellow rounded-full mt-2 mr-2 flex-shrink-0"></span>
                    {deliverable}
                  </li>
                ))}
              </ul>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};
