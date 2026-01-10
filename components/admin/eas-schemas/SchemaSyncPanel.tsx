import { useEffect, useMemo, useState } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { useAdminApi } from "@/hooks/useAdminApi";
import {
  isSignatureRequestCancelled,
  useAdminSignedAction,
} from "@/hooks/useAdminSignedAction";
import { keccak256, stringToHex } from "viem";
import { isBytes32Hex } from "@/lib/attestation/utils/hex";
import { Loader2 } from "lucide-react";
import SchemaKeySelect from "@/components/admin/eas-schemas/SchemaKeySelect";

const CATEGORIES = [
  { value: "attendance", label: "Attendance" },
  { value: "social", label: "Social" },
  { value: "verification", label: "Verification" },
  { value: "review", label: "Review" },
  { value: "achievement", label: "Achievement" },
  { value: "payment", label: "Payment" },
  { value: "reward", label: "Reward" },
] as const;

interface SchemaSyncPanelProps {
  network: { name: string; chainId: number };
  onSuccess?: () => void;
}

type SchemaKeyOption = {
  key: string;
  label: string;
};

type SchemaKeyValue = string | "__none__";

export default function SchemaSyncPanel({
  network,
  onSuccess,
}: SchemaSyncPanelProps) {
  const { adminFetch, loading } = useAdminApi({ suppressToasts: true });
  const { adminFetch: adminFetchKeys } = useAdminApi({ suppressToasts: true });
  const { signAdminAction, isSigning } = useAdminSignedAction();
  const [schemaUid, setSchemaUid] = useState("");
  const [name, setName] = useState("");
  const [description, setDescription] = useState("");
  const [category, setCategory] = useState<string>(CATEGORIES[0].value);
  const [schemaKey, setSchemaKey] = useState<SchemaKeyValue>("__none__");
  const [schemaKeys, setSchemaKeys] = useState<SchemaKeyOption[]>([]);
  const [keysLoading, setKeysLoading] = useState(false);
  const [result, setResult] = useState<string | null>(null);

  const isValid = useMemo(() => {
    return (
      isBytes32Hex(schemaUid) &&
      name.trim().length > 0 &&
      description.trim().length > 0
    );
  }, [schemaUid, name, description]);

  useEffect(() => {
    let isMounted = true;
    const loadKeys = async () => {
      setKeysLoading(true);
      const { data, error } = await adminFetchKeys<{ keys: SchemaKeyOption[] }>(
        "/api/admin/eas-schema-keys",
      );
      if (!isMounted) return;
      if (!error) {
        setSchemaKeys(data?.keys || []);
      }
      setKeysLoading(false);
    };
    loadKeys();
    return () => {
      isMounted = false;
    };
  }, [adminFetchKeys]);

  const handleSync = async () => {
    if (!isValid) return;

    try {
      const timestamp = Math.floor(Date.now() / 1000);
      const nonce = `${Date.now()}_${Math.random().toString(36).slice(2)}`;

      const signedAction = await signAdminAction(
        {
          action: "sync",
          network: network.name,
          schemaDefinitionHash: keccak256(stringToHex("")),
          schemaUid,
          transactionHash: "",
          timestamp,
          nonce,
        },
        network.chainId,
      );

      const { data, error } = await adminFetch(`/api/admin/eas-schemas/sync`, {
        method: "POST",
        body: JSON.stringify({
          schemaUid,
          name,
          description,
          category,
          network: network.name,
          schema_key: schemaKey === "__none__" ? null : schemaKey,
          signedAction,
        }),
      });

      if (error) {
        setResult(error);
        return;
      }

      setResult(data?.message || "Schema synced successfully");
      onSuccess?.();
    } catch (err: any) {
      if (isSignatureRequestCancelled(err)) {
        return;
      }
      setResult(err?.message || "Failed to sync schema");
    }
  };

  return (
    <div className="space-y-4">
      <div className="rounded-md border border-gray-800 bg-gray-900/40 p-4">
        <div className="text-sm text-gray-400">Source Network</div>
        <div className="text-lg font-semibold text-white">{network.name}</div>
      </div>

      <Input
        placeholder="Schema UID (0x...)"
        value={schemaUid}
        onChange={(e) => setSchemaUid(e.target.value)}
      />
      <Input
        placeholder="Schema name"
        value={name}
        onChange={(e) => setName(e.target.value)}
      />
      <Input
        placeholder="Schema description"
        value={description}
        onChange={(e) => setDescription(e.target.value)}
      />
      <Select value={category} onValueChange={setCategory}>
        <SelectTrigger>
          <SelectValue placeholder="Select category" />
        </SelectTrigger>
        <SelectContent>
          {CATEGORIES.map((cat) => (
            <SelectItem key={cat.value} value={cat.value}>
              {cat.label}
            </SelectItem>
          ))}
        </SelectContent>
      </Select>
      <SchemaKeySelect
        value={schemaKey}
        onChange={setSchemaKey}
        options={schemaKeys}
        loading={keysLoading}
      />

      <Button
        className="w-full sm:w-auto min-w-[140px]"
        disabled={!isValid || loading || isSigning}
        onClick={handleSync}
      >
        {loading || isSigning ? (
          <span className="inline-flex items-center gap-2">
            <Loader2 className="h-4 w-4 animate-spin" />
            Syncing
          </span>
        ) : (
          "Sync Schema"
        )}
      </Button>

      {result && (
        <div className="rounded-md border border-gray-800 bg-gray-900/40 p-3 text-gray-200">
          {result}
        </div>
      )}
    </div>
  );
}
