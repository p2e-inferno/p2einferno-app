/**
 * Reusable Lock Manager Toggle Component
 *
 * Provides a consistent toggle interface for controlling whether the server wallet
 * has been granted lock manager permissions for entity locks (bootcamps, cohorts, quests, milestones).
 *
 * Only displays when editing entities that have lock addresses.
 */

interface LockManagerToggleProps {
  /** Current state of lock manager grant */
  isGranted: boolean;
  /** Callback when toggle state changes */
  onToggle: (granted: boolean) => void;
  /** Lock address - toggle only shows if this exists */
  lockAddress?: string;
  /** Whether we're in editing mode - toggle only shows during editing */
  isEditing?: boolean;
  /** Optional custom label for the toggle */
  label?: string;
  /** Optional custom description */
  description?: string;
}

export default function LockManagerToggle({
  isGranted,
  onToggle,
  lockAddress: _lockAddress,
  isEditing: _isEditing = true,
  label = "Server Wallet is Lock Manager",
  description = "Toggle this if the server wallet has been granted lock manager permissions for this lock",
}: LockManagerToggleProps) {
  // Always show toggle for debugging purposes
  // if (!isEditing || !lockAddress) {
  //   return null;
  // }

  return (
    <div className="mt-3 p-3 bg-gray-800/50 border border-gray-700 rounded-lg">
      <div className="flex items-center justify-between">
        <div className="flex-1">
          <label
            htmlFor="lock-manager-toggle"
            className="text-sm font-medium text-gray-300 cursor-pointer"
          >
            {label}
          </label>
          <p className="text-xs text-gray-400 mt-1">{description}</p>
        </div>
        <div className="ml-4">
          <button
            type="button"
            id="lock-manager-toggle"
            onClick={() => onToggle(!isGranted)}
            className={`
              relative inline-flex h-6 w-11 items-center rounded-full transition-colors duration-200 ease-in-out focus:outline-none focus:ring-2 focus:ring-flame-yellow focus:ring-offset-2 focus:ring-offset-gray-900
              ${isGranted ? "bg-flame-yellow" : "bg-gray-600"}
            `}
          >
            <span
              className={`
                inline-block h-4 w-4 transform rounded-full bg-white transition-transform duration-200 ease-in-out
                ${isGranted ? "translate-x-6" : "translate-x-1"}
              `}
            />
          </button>
        </div>
      </div>
    </div>
  );
}
