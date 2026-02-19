const PRESETS = [30, 50, 75] as const;
const BTN =
  "rounded-full bg-slate-700/70 px-3 py-1 text-[11px] text-slate-200 hover:bg-slate-700";

export function PercentPresets({
  onSelect,
  disabled,
}: {
  onSelect: (percent: number) => void;
  disabled?: boolean;
}) {
  return (
    <div className="flex gap-2">
      {PRESETS.map((p) => (
        <button
          key={p}
          type="button"
          onClick={() => onSelect(p)}
          className={BTN}
          disabled={disabled}
        >
          {p}%
        </button>
      ))}
      <button
        type="button"
        onClick={() => onSelect(100)}
        className={BTN}
        disabled={disabled}
      >
        Max
      </button>
    </div>
  );
}
