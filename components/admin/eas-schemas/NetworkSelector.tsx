import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";

export type NetworkOption = {
  name: string;
  displayName: string;
  isTestnet: boolean;
  chainId?: number;
  explorerBaseUrl?: string | null;
};

interface NetworkSelectorProps {
  networks: NetworkOption[];
  selected: string;
  onChange: (value: string) => void;
  disabled?: boolean;
}

export default function NetworkSelector({
  networks,
  selected,
  onChange,
  disabled = false,
}: NetworkSelectorProps) {
  return (
    <div className="w-full sm:max-w-sm">
      <Select value={selected} onValueChange={onChange} disabled={disabled}>
        <SelectTrigger className="w-full">
          <SelectValue placeholder="Select network" />
        </SelectTrigger>
        <SelectContent>
          {networks.map((network) => (
            <SelectItem key={network.name} value={network.name}>
              {network.displayName}
              {network.isTestnet ? " (Testnet)" : ""}
            </SelectItem>
          ))}
        </SelectContent>
      </Select>
    </div>
  );
}
