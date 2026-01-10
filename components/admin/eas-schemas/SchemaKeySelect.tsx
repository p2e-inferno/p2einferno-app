import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";

type SchemaKeyOption = {
  key: string;
  label: string;
};

interface SchemaKeySelectProps {
  value: string;
  onChange: (value: string) => void;
  options: SchemaKeyOption[];
  loading?: boolean;
  showWarning?: boolean;
  showManageHint?: boolean;
}

export default function SchemaKeySelect({
  value,
  onChange,
  options,
  loading = false,
  showWarning = true,
  showManageHint = true,
}: SchemaKeySelectProps) {
  const shouldWarn = showWarning && value === "__none__";

  return (
    <div className="space-y-2">
      {shouldWarn && (
        <div className="text-xs text-yellow-300">
          Without a schema key, this schema won’t be discoverable via schema_key
          lookups. Use only if you plan to assign a key later.
        </div>
      )}
      <Select value={value} onValueChange={onChange}>
        <SelectTrigger>
          <SelectValue
            placeholder={
              loading
                ? "Loading schema keys..."
                : "Select schema key (optional)"
            }
          />
        </SelectTrigger>
        <SelectContent>
          <SelectItem value="__none__">No schema key (optional)</SelectItem>
          {options.map((key) => (
            <SelectItem key={key.key} value={key.key}>
              {key.label} ({key.key})
            </SelectItem>
          ))}
        </SelectContent>
      </Select>
      {showManageHint && (
        <div className="text-xs text-gray-400">
          Manage keys in EAS Config → Schema Keys.
        </div>
      )}
    </div>
  );
}
