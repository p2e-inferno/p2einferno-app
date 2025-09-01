import React from "react";
import { ChevronDown, ChevronRight } from "lucide-react";

interface Column {
  key: string;
  label: string;
  mobilePriority?: "high" | "medium" | "low"; // Priority for mobile display
  render?: (value: any, row: any) => React.ReactNode;
  className?: string;
}

interface AdminResponsiveTableProps {
  columns: Column[];
  data: any[];
  emptyMessage?: string;
  className?: string;
}

export default function AdminResponsiveTable({
  columns,
  data,
  emptyMessage = "No data available",
  className = "",
}: AdminResponsiveTableProps) {
  const [expandedRows, setExpandedRows] = React.useState<Set<string>>(new Set());

  const toggleRow = (rowId: string) => {
    const newExpanded = new Set(expandedRows);
    if (newExpanded.has(rowId)) {
      newExpanded.delete(rowId);
    } else {
      newExpanded.add(rowId);
    }
    setExpandedRows(newExpanded);
  };

  const getHighPriorityColumns = () => columns.filter(col => col.mobilePriority === "high");
  const getMediumPriorityColumns = () => columns.filter(col => col.mobilePriority === "medium");

  if (data.length === 0) {
    return (
      <div className="text-center py-12">
        <p className="text-gray-400">{emptyMessage}</p>
      </div>
    );
  }

  return (
    <div className={`space-y-4 ${className}`}>
      {/* Desktop Table - Hidden on mobile */}
      <div className="hidden lg:block overflow-x-auto">
        <table className="w-full border-collapse">
          <thead>
            <tr className="border-b border-gray-800">
              {columns.map((column) => (
                <th
                  key={column.key}
                  className={`py-3 px-4 text-left text-sm font-medium text-gray-400 ${column.className || ""}`}
                >
                  {column.label}
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {data.map((row, index) => (
              <tr
                key={row.id || index}
                className="border-b border-gray-800 hover:bg-gray-900/50 transition-colors"
              >
                {columns.map((column) => (
                  <td
                    key={column.key}
                    className={`py-3 px-4 text-sm text-gray-300 ${column.className || ""}`}
                  >
                    {column.render ? column.render(row[column.key], row) : row[column.key]}
                  </td>
                ))}
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      {/* Mobile Cards - Visible only on mobile */}
      <div className="lg:hidden space-y-3">
        {data.map((row, index) => {
          const rowId = row.id || index;
          const isExpanded = expandedRows.has(rowId);
          const highPriorityCols = getHighPriorityColumns();
          const mediumPriorityCols = getMediumPriorityColumns();

          return (
            <div
              key={rowId}
              className="bg-gray-900 border border-gray-800 rounded-lg overflow-hidden"
            >
              {/* Primary Info (Always visible) */}
              <div className="p-4">
                <div className="flex items-center justify-between">
                  <div className="flex-1 min-w-0">
                    {highPriorityCols.map((column) => (
                      <div key={column.key} className="mb-2 last:mb-0">
                        <span className="text-xs text-gray-500 uppercase tracking-wide">
                          {column.label}
                        </span>
                        <div className="text-sm text-gray-300 mt-1">
                          {column.render ? column.render(row[column.key], row) : row[column.key]}
                        </div>
                      </div>
                    ))}
                  </div>
                  <button
                    onClick={() => toggleRow(rowId)}
                    className="ml-4 p-2 text-gray-400 hover:text-white transition-colors"
                    aria-label={isExpanded ? "Collapse row" : "Expand row"}
                  >
                    {isExpanded ? (
                      <ChevronDown className="h-4 w-4" />
                    ) : (
                      <ChevronRight className="h-4 w-4" />
                    )}
                  </button>
                </div>
              </div>

              {/* Expandable Details */}
              {isExpanded && (
                <div className="border-t border-gray-800 bg-gray-950/50">
                  <div className="p-4 space-y-3">
                    {mediumPriorityCols.map((column) => (
                      <div key={column.key}>
                        <span className="text-xs text-gray-500 uppercase tracking-wide">
                          {column.label}
                        </span>
                        <div className="text-sm text-gray-300 mt-1">
                          {column.render ? column.render(row[column.key], row) : row[column.key]}
                        </div>
                      </div>
                    ))}
                    
                    {/* Low priority columns shown in expanded view */}
                    {columns
                      .filter(col => !col.mobilePriority || col.mobilePriority === "low")
                      .map((column) => (
                        <div key={column.key}>
                          <span className="text-xs text-gray-500 uppercase tracking-wide">
                            {column.label}
                          </span>
                          <div className="text-sm text-gray-300 mt-1">
                            {column.render ? column.render(row[column.key], row) : row[column.key]}
                          </div>
                        </div>
                      ))}
                  </div>
                </div>
              )}
            </div>
          );
        })}
      </div>
    </div>
  );
}
