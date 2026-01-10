import { useEffect, useMemo, useState } from "react";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Check, Copy, Loader2 } from "lucide-react";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { useAdminApi } from "@/hooks/useAdminApi";

interface SchemaDetailsCardProps {
  schema: {
    schema_uid: string;
    name: string;
    description: string;
    category: string;
    schema_definition: string;
    schema_key?: string | null;
    revocable: boolean;
    created_at: string;
  };
  attestationCount: number;
  network: { name: string };
  easScanBaseUrl?: string | null;
  onChain?: boolean;
  isValidSchemaUid?: boolean;
  derivedFromDefinition?: boolean;
  actionError?: string | null;
  isRedeploying?: boolean;
  onRedeploy?: () => void;
}

export default function SchemaDetailsCard({
  schema,
  attestationCount,
  network,
  easScanBaseUrl,
  onChain = false,
  isValidSchemaUid = true,
  derivedFromDefinition = false,
  actionError = null,
  isRedeploying = false,
  onRedeploy,
}: SchemaDetailsCardProps) {
  const { adminFetch } = useAdminApi({ suppressToasts: true });

  const schemaLink =
    easScanBaseUrl && isValidSchemaUid
      ? `${easScanBaseUrl}/schema/view/${schema.schema_uid}`
      : null;
  const [copiedUid, setCopiedUid] = useState(false);
  const [copiedDefinition, setCopiedDefinition] = useState(false);
  const [schemaKeys, setSchemaKeys] = useState<
    { key: string; label: string; active: boolean }[]
  >([]);
  const [keysLoading, setKeysLoading] = useState(false);
  const [schemaKeyValue, setSchemaKeyValue] = useState<string>(
    schema.schema_key || "__none__",
  );
  const [isSavingKey, setIsSavingKey] = useState(false);
  const [keyError, setKeyError] = useState<string | null>(null);
  const [keySaved, setKeySaved] = useState(false);

  const handleCopy = async (
    value: string,
    setCopied: (value: boolean) => void,
  ) => {
    try {
      await navigator.clipboard.writeText(value);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    } catch {
      setCopied(false);
    }
  };

  useEffect(() => {
    setSchemaKeyValue(schema.schema_key || "__none__");
  }, [schema.schema_key]);

  useEffect(() => {
    let mounted = true;
    const loadKeys = async () => {
      setKeysLoading(true);
      const { data, error } = await adminFetch<{
        keys: { key: string; label: string; active: boolean }[];
      }>("/api/admin/eas-schema-keys?includeDisabled=1");
      if (!mounted) return;
      if (!error) {
        setSchemaKeys(data?.keys || []);
      }
      setKeysLoading(false);
    };
    loadKeys();
    return () => {
      mounted = false;
    };
  }, [adminFetch]);

  const hasKeyChanged = useMemo(() => {
    const current = schema.schema_key || "__none__";
    return schemaKeyValue !== current;
  }, [schema.schema_key, schemaKeyValue]);

  const handleSaveSchemaKey = async () => {
    setKeyError(null);
    setKeySaved(false);
    if (!hasKeyChanged) return;
    setIsSavingKey(true);
    try {
      const { error } = await adminFetch(
        `/api/admin/eas-schemas/${schema.schema_uid}?network=${network.name}`,
        {
          method: "PATCH",
          body: JSON.stringify({
            schema_key: schemaKeyValue === "__none__" ? null : schemaKeyValue,
          }),
        },
      );

      if (error) {
        setKeyError(error);
        return;
      }

      setKeySaved(true);
      setTimeout(() => setKeySaved(false), 1500);
    } catch (err: any) {
      setKeyError(err?.message || "Failed to update schema key");
    } finally {
      setIsSavingKey(false);
    }
  };

  return (
    <div className="space-y-3 text-sm text-gray-200">
      <div className="text-center space-y-1">
        <div className="text-lg font-semibold text-white">{schema.name}</div>
        <div className="text-gray-400">{schema.description}</div>
      </div>
      <div className="flex flex-wrap gap-2">
        <Badge
          variant="outline"
          className="whitespace-nowrap border-gray-700 text-gray-300"
        >
          {schema.category}
        </Badge>
        <Badge
          variant="outline"
          className="whitespace-nowrap border-gray-700 text-gray-300"
        >
          {schema.revocable ? "Revocable" : "Non-revocable"}
        </Badge>
        <Badge
          variant="outline"
          className="whitespace-nowrap border-gray-700 text-gray-300"
        >
          Attestations: {attestationCount}
        </Badge>
        <Badge
          variant="outline"
          className={`whitespace-nowrap ${
            onChain
              ? "border-green-700 text-green-300"
              : "border-red-700 text-red-300"
          }`}
        >
          {onChain ? "On-chain" : "Not on-chain"}
        </Badge>
        {!onChain && derivedFromDefinition && (
          <Badge
            variant="outline"
            className="whitespace-nowrap border-yellow-700 text-yellow-300"
          >
            UID matches definition hash
          </Badge>
        )}
      </div>
      <div className="rounded-md border border-gray-800 bg-gray-900/40 p-3">
        <div className="flex items-center justify-between text-xs uppercase text-gray-400">
          <span>Schema UID</span>
          <Button
            variant="ghost"
            size="icon"
            className="h-7 w-7 text-gray-300 hover:text-white"
            onClick={() => handleCopy(schema.schema_uid, setCopiedUid)}
            aria-label="Copy schema UID"
          >
            {copiedUid ? (
              <Check className="h-4 w-4 text-green-400" />
            ) : (
              <Copy className="h-4 w-4" />
            )}
          </Button>
        </div>
        <div className="font-mono text-xs break-all text-gray-200">
          {schema.schema_uid}
        </div>
      </div>
      <div className="rounded-md border border-gray-800 bg-gray-900/40 p-3">
        <div className="flex items-center justify-between text-xs uppercase text-gray-400">
          <span>Schema Definition</span>
          <Button
            variant="ghost"
            size="icon"
            className="h-7 w-7 text-gray-300 hover:text-white"
            onClick={() =>
              handleCopy(schema.schema_definition, setCopiedDefinition)
            }
            aria-label="Copy schema definition"
          >
            {copiedDefinition ? (
              <Check className="h-4 w-4 text-green-400" />
            ) : (
              <Copy className="h-4 w-4" />
            )}
          </Button>
        </div>
        <div className="font-mono text-xs break-all text-gray-200">
          {schema.schema_definition}
        </div>
      </div>

      <div className="rounded-md border border-gray-800 bg-gray-900/40 p-3">
        <div className="text-xs uppercase text-gray-400">Schema Key</div>
        <div className="mt-2 space-y-2">
          <Select value={schemaKeyValue} onValueChange={setSchemaKeyValue}>
            <SelectTrigger>
              <SelectValue
                placeholder={
                  keysLoading ? "Loading keys..." : "Select schema key"
                }
              />
            </SelectTrigger>
            <SelectContent className="z-[200]">
              <SelectItem value="__none__">No schema key</SelectItem>
              {schemaKeys.map((k) => (
                <SelectItem key={k.key} value={k.key} disabled={!k.active}>
                  {k.label} ({k.key}){!k.active ? " — disabled" : ""}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
          <Button
            variant="secondary"
            className="w-full"
            disabled={isSavingKey || keysLoading || !hasKeyChanged}
            onClick={handleSaveSchemaKey}
          >
            {isSavingKey ? (
              <span className="inline-flex items-center justify-center gap-2">
                <Loader2 className="h-4 w-4 animate-spin" />
                Saving
              </span>
            ) : keySaved ? (
              <span className="inline-flex items-center justify-center gap-2">
                <Check className="h-4 w-4 text-green-400" />
                Saved
              </span>
            ) : (
              "Save Schema Key"
            )}
          </Button>
          {keyError && (
            <div className="rounded-md border border-red-900/60 bg-red-950/40 p-2 text-sm text-red-200">
              {keyError}
            </div>
          )}
          <div className="text-xs text-gray-400">
            Keys are managed in EAS Config → Schema Keys.
          </div>
        </div>
      </div>
      {actionError && (
        <div className="rounded-md border border-red-900/60 bg-red-950/40 p-3 text-sm text-red-200">
          {actionError}
        </div>
      )}
      <div className="flex flex-col gap-3">
        {schemaLink && (
          <Button
            variant="secondary"
            className="w-full"
            onClick={() => {
              window.open(schemaLink, "_blank", "noopener,noreferrer");
            }}
          >
            View on EAS Scan
          </Button>
        )}
        {(!onChain || !isValidSchemaUid) && onRedeploy && (
          <Button
            variant="secondary"
            onClick={onRedeploy}
            disabled={isRedeploying}
            className="w-full"
          >
            {isRedeploying ? (
              <span className="inline-flex items-center gap-2">
                <Loader2 className="h-4 w-4 animate-spin" />
                Deploying
              </span>
            ) : (
              "Deploy to EAS & Update UID"
            )}
          </Button>
        )}
      </div>
    </div>
  );
}
