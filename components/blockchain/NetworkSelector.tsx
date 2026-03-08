import { useState, useEffect } from "react";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { chainMap } from "@/lib/blockchain/config/core/chain-map";

interface NetworkSelectorProps {
  chainId: string;
  onChange: (chainId: string) => void;
  label?: string;
  className?: string;
}

export function NetworkSelector({
  chainId,
  onChange,
  label = "Network",
  className = "",
}: NetworkSelectorProps) {
  const [showCustomChain, setShowCustomChain] = useState(false);

  // Sync the showCustomChain state when the chainId changes from outside (e.g. data load)
  useEffect(() => {
    const isPredefined = Object.keys(chainMap).includes(chainId);
    if (!isPredefined && chainId && chainId !== "custom") {
      setShowCustomChain(true);
    } else {
      setShowCustomChain(false);
    }
  }, [chainId]);

  const handleSelectChange = (value: string) => {
    if (value === "custom") {
      setShowCustomChain(true);
      // Don't change actual chainId yet if we're going custom
    } else {
      setShowCustomChain(false);
      onChange(value);
    }
  };

  return (
    <div className={`space-y-2 ${className}`}>
      {label && <Label className="text-white">{label}</Label>}

      <Select
        value={showCustomChain ? "custom" : chainId}
        onValueChange={handleSelectChange}
      >
        <SelectTrigger className="bg-transparent border-gray-700 text-gray-100">
          <SelectValue placeholder="Select network" />
        </SelectTrigger>
        <SelectContent>
          {Object.entries(chainMap).map(([id, chain]) => (
            <SelectItem key={id} value={id}>
              {chain.name}
            </SelectItem>
          ))}
          <SelectItem value="custom">Custom Chain...</SelectItem>
        </SelectContent>
      </Select>

      {showCustomChain && (
        <div className="pt-1 animate-in fade-in slide-in-from-top-1 duration-200">
          <Label className="text-white text-[10px] opacity-70 mb-1 block">
            Manual Chain ID
          </Label>
          <Input
            type="number"
            min={1}
            value={chainId === "custom" ? "" : chainId}
            onChange={(e) => onChange(e.target.value)}
            placeholder="e.g. 137"
            className="bg-transparent border-gray-700 text-gray-100 h-9"
          />
        </div>
      )}

      {!showCustomChain && chainId && (
        <p className="text-[10px] text-gray-500 italic">Chain ID: {chainId}</p>
      )}
    </div>
  );
}
