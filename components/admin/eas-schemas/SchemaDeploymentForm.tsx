import { useEffect, useMemo, useState } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
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
import { Check, Copy, ExternalLink, Loader2 } from "lucide-react";
import { isBytes32Hex } from "@/lib/attestation/utils/hex";
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

type DeployResponse = {
  success?: boolean;
  schemaUid?: string;
  transactionHash?: string;
  error?: string;
};

type SchemaKeyOption = {
  key: string;
  label: string;
};

interface SchemaDeploymentFormProps {
  network: { name: string; chainId: number; easScanBaseUrl?: string | null };
  onSuccess?: () => void;
}

type SchemaKeyValue = string | "__none__";

export default function SchemaDeploymentForm({
  network,
  onSuccess,
}: SchemaDeploymentFormProps) {
  const { adminFetch, loading } = useAdminApi({ suppressToasts: true });
  const { adminFetch: adminFetchKeys } = useAdminApi({ suppressToasts: true });
  const { signAdminAction, isSigning } = useAdminSignedAction();
  const [name, setName] = useState("");
  const [description, setDescription] = useState("");
  const [schemaDefinition, setSchemaDefinition] = useState("");
  const [category, setCategory] = useState<string>(CATEGORIES[0].value);
  const [revocable, setRevocable] = useState(true);
  const [schemaKey, setSchemaKey] = useState<SchemaKeyValue>("__none__");
  const [schemaKeys, setSchemaKeys] = useState<SchemaKeyOption[]>([]);
  const [keysLoading, setKeysLoading] = useState(false);
  const [result, setResult] = useState<DeployResponse | null>(null);
  const [copiedUid, setCopiedUid] = useState(false);

  const isValid = useMemo(() => {
    return (
      name.trim().length > 0 &&
      description.trim().length > 0 &&
      schemaDefinition.trim().length > 0
    );
  }, [name, description, schemaDefinition]);

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

  const handleDeploy = async () => {
    if (!isValid) return;
    try {
      const schemaDefinitionHash = keccak256(stringToHex(schemaDefinition));
      const timestamp = Math.floor(Date.now() / 1000);
      const nonce = `${Date.now()}_${Math.random().toString(36).slice(2)}`;

      const signedAction = await signAdminAction(
        {
          action: "deploy",
          network: network.name,
          schemaDefinitionHash,
          schemaUid: "",
          transactionHash: "",
          timestamp,
          nonce,
        },
        network.chainId,
      );

      const { data, error } = await adminFetch<DeployResponse>(
        `/api/admin/eas-schemas?network=${network.name}`,
        {
          method: "POST",
          headers: {
            "X-Active-Wallet": signedAction.signerAddress,
          },
          body: JSON.stringify({
            name,
            description,
            schema_definition: schemaDefinition,
            category,
            revocable,
            network: network.name,
            schema_key: schemaKey === "__none__" ? null : schemaKey,
            signedAction,
          }),
        },
      );

      if (error) {
        setResult({ error });
        return;
      }

      setResult(data || null);
      setCopiedUid(false);
      if (data?.schemaUid) {
        onSuccess?.();
      }
    } catch (err: any) {
      if (isSignatureRequestCancelled(err)) {
        return;
      }
      setResult({ error: err?.message || "Failed to deploy schema" });
    }
  };

  return (
    <div className="space-y-4">
      <div className="rounded-md border border-gray-800 bg-gray-900/40 p-4">
        <div className="text-sm text-gray-400">Target Network</div>
        <div className="text-lg font-semibold text-white">{network.name}</div>
      </div>

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
      <Textarea
        placeholder="Schema definition (e.g., address walletAddress,string greeting,uint256 timestamp)"
        value={schemaDefinition}
        onChange={(e) => setSchemaDefinition(e.target.value)}
        rows={4}
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

      <label className="flex items-center gap-2 text-sm text-gray-200">
        <input
          type="checkbox"
          checked={revocable}
          onChange={(e) => setRevocable(e.target.checked)}
        />
        Revocable
      </label>

      <Button
        className="w-full sm:w-auto min-w-[160px]"
        disabled={!isValid || loading || isSigning}
        onClick={handleDeploy}
      >
        {loading || isSigning ? (
          <span className="inline-flex items-center gap-2">
            <Loader2 className="h-4 w-4 animate-spin" />
            Deploying
          </span>
        ) : (
          "Deploy Schema"
        )}
      </Button>

      {result?.schemaUid && (
        <div className="rounded-md border border-green-700 bg-green-900/20 p-3 text-green-200">
          <div className="text-xs uppercase text-green-300">
            Deployed schema UID
          </div>
          <div className="mt-2 flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
            {network.easScanBaseUrl && isBytes32Hex(result.schemaUid) ? (
              <a
                className="font-mono text-xs break-all underline decoration-dotted"
                href={`${network.easScanBaseUrl}/schema/view/${result.schemaUid}`}
                target="_blank"
                rel="noreferrer"
              >
                {result.schemaUid}
              </a>
            ) : (
              <div className="font-mono text-xs break-all">
                {result.schemaUid}
              </div>
            )}
            <div className="flex w-full flex-col gap-2 sm:w-auto sm:flex-row">
              <Button
                variant="secondary"
                className="w-full sm:w-auto"
                onClick={async () => {
                  await navigator.clipboard.writeText(result.schemaUid || "");
                  setCopiedUid(true);
                  setTimeout(() => setCopiedUid(false), 2000);
                }}
              >
                {copiedUid ? (
                  <span className="inline-flex items-center gap-2">
                    <Check className="h-4 w-4 text-green-300" />
                    Copied
                  </span>
                ) : (
                  <span className="inline-flex items-center gap-2">
                    <Copy className="h-4 w-4" />
                    Copy UID
                  </span>
                )}
              </Button>
              {network.easScanBaseUrl && isBytes32Hex(result.schemaUid) && (
                <Button
                  variant="secondary"
                  className="w-full sm:w-auto"
                  onClick={() => {
                    window.open(
                      `${network.easScanBaseUrl}/schema/view/${result.schemaUid}`,
                      "_blank",
                      "noopener,noreferrer",
                    );
                  }}
                >
                  <span className="inline-flex items-center gap-2">
                    <ExternalLink className="h-4 w-4" />
                    View on EAS Scan
                  </span>
                </Button>
              )}
            </div>
          </div>
        </div>
      )}
      {result?.error && (
        <div className="rounded-md border border-red-700 bg-red-900/20 p-3 text-red-200">
          {result.error}
        </div>
      )}
    </div>
  );
}
