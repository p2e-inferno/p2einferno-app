import { useCallback, useEffect, useMemo, useState } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { useAdminApi } from "@/hooks/useAdminApi";
import { Loader2, Trash2, Save } from "lucide-react";
import Toggle from "@/components/ui/toggle";
import {
  isValidSchemaKey,
  normalizeSchemaKey,
} from "@/lib/attestation/schemas/schema-key-utils";

type EasNetworkRow = {
  name: string;
  chainId: number;
  displayName: string;
  isTestnet: boolean;
  enabled: boolean;
  easContractAddress: string;
  schemaRegistryAddress: string;
  eip712ProxyAddress?: string | null;
  easScanBaseUrl?: string | null;
  explorerBaseUrl?: string | null;
  rpcUrl?: string | null;
  source?: string | null;
};

type EasConfigPanelProps = {
  onChanged?: () => void | Promise<void>;
};

const isValidAddress = (value: string): boolean =>
  /^0x[a-fA-F0-9]{40}$/.test(value);

type SchemaKeyRow = {
  key: string;
  label: string;
  description?: string | null;
  active: boolean;
};

export default function EasConfigPanel({ onChanged }: EasConfigPanelProps) {
  const { adminFetch } = useAdminApi({ suppressToasts: true });
  const [networks, setNetworks] = useState<EasNetworkRow[]>([]);
  const [schemaKeys, setSchemaKeys] = useState<SchemaKeyRow[]>([]);
  const [loading, setLoading] = useState(false);
  const [loadingKeys, setLoadingKeys] = useState(false);
  const [showDisabled, setShowDisabled] = useState(false);
  const [savingName, setSavingName] = useState<string | null>(null);
  const [savingKey, setSavingKey] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState<string | null>(null);

  const [newNetwork, setNewNetwork] = useState({
    name: "",
    chainId: "",
    displayName: "",
    isTestnet: false,
    enabled: false,
    easContractAddress: "",
    schemaRegistryAddress: "",
    eip712ProxyAddress: "",
    easScanBaseUrl: "",
    explorerBaseUrl: "",
    rpcUrl: "",
  });

  const [newSchemaKey, setNewSchemaKey] = useState({
    key: "",
    label: "",
    description: "",
    active: true,
  });

  const loadNetworks = useCallback(async () => {
    setLoading(true);
    setError(null);
    setSuccess(null);
    const { data, error } = await adminFetch<{ networks: EasNetworkRow[] }>(
      "/api/admin/eas-networks?includeDisabled=1",
    );
    if (error) {
      setLoading(false);
      setError(error);
      return;
    }
    const sorted = [...(data?.networks || [])].sort((a, b) => {
      if (a.enabled === b.enabled) {
        return a.name.localeCompare(b.name);
      }
      return a.enabled ? -1 : 1;
    });
    setNetworks(sorted);
    setLoading(false);
  }, [adminFetch]);

  const loadSchemaKeys = useCallback(async () => {
    setLoadingKeys(true);
    const { data, error } = await adminFetch<{ keys: SchemaKeyRow[] }>(
      "/api/admin/eas-schema-keys?includeDisabled=1",
    );
    if (error) {
      setLoadingKeys(false);
      setError(error);
      return;
    }
    setSchemaKeys(data?.keys || []);
    setLoadingKeys(false);
  }, [adminFetch]);

  useEffect(() => {
    loadNetworks();
    loadSchemaKeys();
  }, [loadNetworks, loadSchemaKeys]);

  const canCreate = useMemo(() => {
    if (!newNetwork.name || !newNetwork.chainId || !newNetwork.displayName)
      return false;
    if (!isValidAddress(newNetwork.easContractAddress)) return false;
    if (!isValidAddress(newNetwork.schemaRegistryAddress)) return false;
    if (
      newNetwork.eip712ProxyAddress &&
      !isValidAddress(newNetwork.eip712ProxyAddress)
    )
      return false;
    return true;
  }, [newNetwork]);

  const handleToggle = async (row: EasNetworkRow) => {
    setError(null);
    setSuccess(null);
    setSavingName(row.name);
    try {
      const { error } = await adminFetch(
        `/api/admin/eas-networks/${row.name}`,
        {
          method: "PATCH",
          body: JSON.stringify({
            enabled: !row.enabled,
          }),
        },
      );

      if (error) {
        setError(error);
        return;
      }

      setNetworks((prev) =>
        prev.map((n) =>
          n.name === row.name ? { ...n, enabled: !n.enabled } : n,
        ),
      );
      setSuccess("Network updated");
      await onChanged?.();
    } catch (err: any) {
      setError(err?.message || "Failed to update network");
    } finally {
      setSavingName(null);
    }
  };

  const handleSave = async (row: EasNetworkRow) => {
    setError(null);
    setSuccess(null);
    setSavingName(row.name);
    try {
      const { error } = await adminFetch(
        `/api/admin/eas-networks/${row.name}`,
        {
          method: "PATCH",
          body: JSON.stringify({
            displayName: row.displayName,
            isTestnet: row.isTestnet,
            enabled: row.enabled,
            easContractAddress: row.easContractAddress,
            schemaRegistryAddress: row.schemaRegistryAddress,
            eip712ProxyAddress: row.eip712ProxyAddress || null,
            easScanBaseUrl: row.easScanBaseUrl || null,
            explorerBaseUrl: row.explorerBaseUrl || null,
            rpcUrl: row.rpcUrl || null,
          }),
        },
      );

      if (error) {
        setError(error);
        return;
      }

      setSuccess("Network saved");
      await onChanged?.();
    } catch (err: any) {
      setError(err?.message || "Failed to save network");
    } finally {
      setSavingName(null);
    }
  };

  const handleDelete = async (name: string) => {
    setError(null);
    setSuccess(null);
    setSavingName(name);
    try {
      const { error } = await adminFetch(`/api/admin/eas-networks/${name}`, {
        method: "DELETE",
        body: JSON.stringify({}),
      });

      if (error) {
        setError(error);
        return;
      }

      setNetworks((prev) => prev.filter((n) => n.name !== name));
      setSuccess("Network deleted");
      await onChanged?.();
    } catch (err: any) {
      setError(err?.message || "Failed to delete network");
    } finally {
      setSavingName(null);
    }
  };

  const handleCreate = async () => {
    if (!canCreate) return;
    setError(null);
    setSuccess(null);
    setSavingName("new");
    try {
      const { error } = await adminFetch("/api/admin/eas-networks", {
        method: "POST",
        body: JSON.stringify({
          name: newNetwork.name,
          chainId: Number(newNetwork.chainId),
          displayName: newNetwork.displayName,
          isTestnet: Boolean(newNetwork.isTestnet),
          enabled: Boolean(newNetwork.enabled),
          easContractAddress: newNetwork.easContractAddress,
          schemaRegistryAddress: newNetwork.schemaRegistryAddress,
          eip712ProxyAddress: newNetwork.eip712ProxyAddress || null,
          easScanBaseUrl: newNetwork.easScanBaseUrl || null,
          explorerBaseUrl: newNetwork.explorerBaseUrl || null,
          rpcUrl: newNetwork.rpcUrl || null,
        }),
      });

      if (error) {
        setError(error);
        return;
      }

      setSuccess("Network created");
      setNewNetwork({
        name: "",
        chainId: "",
        displayName: "",
        isTestnet: false,
        enabled: false,
        easContractAddress: "",
        schemaRegistryAddress: "",
        eip712ProxyAddress: "",
        easScanBaseUrl: "",
        explorerBaseUrl: "",
        rpcUrl: "",
      });
      await loadNetworks();
      await onChanged?.();
    } catch (err: any) {
      setError(err?.message || "Failed to create network");
    } finally {
      setSavingName(null);
    }
  };

  const updateRow = (name: string, patch: Partial<EasNetworkRow>) => {
    setNetworks((prev) =>
      prev.map((n) => (n.name === name ? { ...n, ...patch } : n)),
    );
  };

  const updateSchemaKey = (key: string, patch: Partial<SchemaKeyRow>) => {
    setSchemaKeys((prev) =>
      prev.map((k) => (k.key === key ? { ...k, ...patch } : k)),
    );
  };

  const handleCreateSchemaKey = async () => {
    setError(null);
    setSuccess(null);
    setSavingKey("new");
    const normalizedKey = normalizeSchemaKey(newSchemaKey.key);
    if (!normalizedKey || !isValidSchemaKey(normalizedKey) || !newSchemaKey.label) {
      setSavingKey(null);
      setError("Schema key and label are required");
      return;
    }
    try {
      const { error } = await adminFetch("/api/admin/eas-schema-keys", {
        method: "POST",
        body: JSON.stringify({
          key: normalizedKey,
          label: newSchemaKey.label,
          description: newSchemaKey.description || null,
          active: Boolean(newSchemaKey.active),
        }),
      });
      if (error) {
        setError(error);
        return;
      }
      setSuccess("Schema key created");
      setNewSchemaKey({ key: "", label: "", description: "", active: true });
      await loadSchemaKeys();
    } finally {
      setSavingKey(null);
    }
  };

  const handleSaveSchemaKey = async (row: SchemaKeyRow) => {
    setError(null);
    setSuccess(null);
    setSavingKey(row.key);
    try {
      const { error } = await adminFetch(`/api/admin/eas-schema-keys/${row.key}`, {
        method: "PATCH",
        body: JSON.stringify({
          label: row.label,
          description: row.description || null,
          active: Boolean(row.active),
        }),
      });
      if (error) {
        setError(error);
        return;
      }
      setSuccess("Schema key saved");
    } finally {
      setSavingKey(null);
    }
  };

  const handleDisableSchemaKey = async (key: string) => {
    setError(null);
    setSuccess(null);
    setSavingKey(key);
    try {
      const { error } = await adminFetch(`/api/admin/eas-schema-keys/${key}`, {
        method: "DELETE",
        body: JSON.stringify({}),
      });
      if (error) {
        setError(error);
        return;
      }
      setSchemaKeys((prev) =>
        prev.map((k) => (k.key === key ? { ...k, active: false } : k)),
      );
      setSuccess("Schema key disabled");
    } finally {
      setSavingKey(null);
    }
  };

  const visibleNetworks = useMemo(() => {
    const list = showDisabled ? networks : networks.filter((n) => n.enabled);
    return list;
  }, [networks, showDisabled]);

  return (
    <div className="space-y-4">
      <div className="flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <div className="text-lg font-semibold text-white">EAS Config</div>
          <div className="text-sm text-gray-400">
            Manage networks and EAS contract configuration.
          </div>
        </div>
        <div className="flex w-full flex-col gap-2 sm:w-auto sm:flex-row sm:items-center">
          <div className="flex items-center gap-3 text-sm text-gray-200">
            <span className="text-sm text-gray-300">Show disabled</span>
            <Toggle
              checked={showDisabled}
              onCheckedChange={setShowDisabled}
              ariaLabel="Toggle disabled networks"
            />
          </div>
          <Button
            variant="secondary"
            onClick={loadNetworks}
            disabled={loading}
            className="w-full sm:w-auto"
            type="button"
          >
            {loading ? (
              <span className="inline-flex items-center gap-2">
                <Loader2 className="h-4 w-4 animate-spin" />
                Loading
              </span>
            ) : (
              "Refresh"
            )}
          </Button>
        </div>
      </div>

      {error && (
        <div className="rounded-md border border-red-900/60 bg-red-950/40 p-3 text-sm text-red-200">
          {error}
        </div>
      )}
      {success && (
        <div className="rounded-md border border-green-900/60 bg-green-950/30 p-3 text-sm text-green-200">
          {success}
        </div>
      )}

      <div className="rounded-md border border-gray-800 bg-gray-950 p-4">
        <div className="text-sm font-semibold text-white">Add Network</div>
        <div className="mt-3 grid grid-cols-1 gap-3 sm:grid-cols-2">
          <Input
            placeholder="name (e.g., base)"
            value={newNetwork.name}
            onChange={(e) =>
              setNewNetwork((p) => ({ ...p, name: e.target.value.trim() }))
            }
          />
          <Input
            placeholder="chainId (e.g., 8453)"
            value={newNetwork.chainId}
            onChange={(e) =>
              setNewNetwork((p) => ({ ...p, chainId: e.target.value }))
            }
          />
          <Input
            placeholder="display name"
            value={newNetwork.displayName}
            onChange={(e) =>
              setNewNetwork((p) => ({ ...p, displayName: e.target.value }))
            }
          />
          <div className="flex items-center gap-3 text-sm text-gray-200">
            <span>Testnet</span>
            <Toggle
              checked={newNetwork.isTestnet}
              onCheckedChange={(checked) =>
                setNewNetwork((p) => ({ ...p, isTestnet: checked }))
              }
              ariaLabel="Toggle testnet"
            />
          </div>
          <div className="flex items-center gap-3 text-sm text-gray-200">
            <span>Enabled</span>
            <Toggle
              checked={newNetwork.enabled}
              onCheckedChange={(checked) =>
                setNewNetwork((p) => ({ ...p, enabled: checked }))
              }
              ariaLabel="Toggle enabled"
            />
          </div>
          <div />
          <Input
            placeholder="EAS contract address"
            value={newNetwork.easContractAddress}
            onChange={(e) =>
              setNewNetwork((p) => ({
                ...p,
                easContractAddress: e.target.value,
              }))
            }
          />
          <Input
            placeholder="SchemaRegistry address"
            value={newNetwork.schemaRegistryAddress}
            onChange={(e) =>
              setNewNetwork((p) => ({
                ...p,
                schemaRegistryAddress: e.target.value,
              }))
            }
          />
          <Input
            placeholder="EIP712Proxy (optional)"
            value={newNetwork.eip712ProxyAddress}
            onChange={(e) =>
              setNewNetwork((p) => ({
                ...p,
                eip712ProxyAddress: e.target.value,
              }))
            }
          />
          <Input
            placeholder="EAS Scan base URL (optional)"
            value={newNetwork.easScanBaseUrl}
            onChange={(e) =>
              setNewNetwork((p) => ({ ...p, easScanBaseUrl: e.target.value }))
            }
          />
          <Input
            placeholder="Explorer base URL (optional)"
            value={newNetwork.explorerBaseUrl}
            onChange={(e) =>
              setNewNetwork((p) => ({ ...p, explorerBaseUrl: e.target.value }))
            }
          />
          <Input
            placeholder="RPC URL (optional override)"
            value={newNetwork.rpcUrl}
            onChange={(e) =>
              setNewNetwork((p) => ({ ...p, rpcUrl: e.target.value }))
            }
          />
        </div>
        <div className="mt-4">
          <Button
            className="w-full sm:w-auto"
            disabled={!canCreate || savingName === "new"}
            onClick={handleCreate}
            type="button"
          >
            {savingName === "new" ? (
              <span className="inline-flex items-center gap-2">
                <Loader2 className="h-4 w-4 animate-spin" />
                Creating
              </span>
            ) : (
              "Create Network"
            )}
          </Button>
        </div>
      </div>

      <div className="space-y-3">
        {visibleNetworks.map((n) => (
          <div
            key={n.name}
            className="rounded-md border border-gray-800 bg-gray-950 p-4"
          >
            <div className="flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
              <div className="flex flex-wrap items-center gap-2">
                <div className="text-sm font-semibold text-white">{n.name}</div>
                <Badge
                  variant="outline"
                  className="whitespace-nowrap border-gray-700 text-gray-300"
                >
                  chainId: {n.chainId}
                </Badge>
                {n.enabled ? (
                  <Badge
                    variant="outline"
                    className="whitespace-nowrap border-green-700 text-green-300"
                  >
                    enabled
                  </Badge>
                ) : (
                  <Badge
                    variant="outline"
                    className="whitespace-nowrap border-gray-700 text-gray-400"
                  >
                    disabled
                  </Badge>
                )}
                {n.isTestnet && (
                  <Badge
                    variant="outline"
                    className="whitespace-nowrap border-yellow-700 text-yellow-300"
                  >
                    testnet
                  </Badge>
                )}
              </div>
              <div className="flex w-full flex-col gap-2 sm:w-auto sm:flex-row">
                <Button
                  variant="secondary"
                  className="w-full sm:w-auto"
                  disabled={savingName === n.name}
                  onClick={() => handleToggle(n)}
                  type="button"
                >
                  {savingName === n.name ? (
                    <span className="inline-flex items-center gap-2">
                      <Loader2 className="h-4 w-4 animate-spin" />
                      Saving
                    </span>
                  ) : n.enabled ? (
                    "Disable"
                  ) : (
                    "Enable"
                  )}
                </Button>
                <Button
                  variant="secondary"
                  className="w-full sm:w-auto"
                  disabled={savingName === n.name}
                  onClick={() => handleSave(n)}
                  type="button"
                >
                  <span className="inline-flex items-center gap-2">
                    <Save className="h-4 w-4" />
                    Save
                  </span>
                </Button>
                <Button
                  variant="destructive"
                  className="w-full sm:w-auto"
                  disabled={savingName === n.name}
                  onClick={() => handleDelete(n.name)}
                  type="button"
                >
                  <span className="inline-flex items-center gap-2">
                    <Trash2 className="h-4 w-4" />
                    Delete
                  </span>
                </Button>
              </div>
            </div>

            <div className="mt-3 grid grid-cols-1 gap-3 sm:grid-cols-2">
              <Input
                value={n.displayName}
                onChange={(e) =>
                  updateRow(n.name, { displayName: e.target.value })
                }
                placeholder="display name"
              />
              <div className="flex items-center gap-3 text-sm text-gray-200">
                <span>Testnet</span>
                <Toggle
                  checked={n.isTestnet}
                  onCheckedChange={(checked) =>
                    updateRow(n.name, { isTestnet: checked })
                  }
                  ariaLabel={`Toggle ${n.name} testnet`}
                />
              </div>
              <Input
                value={n.easContractAddress}
                onChange={(e) =>
                  updateRow(n.name, { easContractAddress: e.target.value })
                }
                placeholder="EAS contract address"
              />
              <Input
                value={n.schemaRegistryAddress}
                onChange={(e) =>
                  updateRow(n.name, { schemaRegistryAddress: e.target.value })
                }
                placeholder="SchemaRegistry address"
              />
              <Input
                value={n.eip712ProxyAddress || ""}
                onChange={(e) =>
                  updateRow(n.name, { eip712ProxyAddress: e.target.value })
                }
                placeholder="EIP712Proxy (optional)"
              />
              <Input
                value={n.easScanBaseUrl || ""}
                onChange={(e) =>
                  updateRow(n.name, { easScanBaseUrl: e.target.value })
                }
                placeholder="EAS Scan base URL (optional)"
              />
              <Input
                value={n.explorerBaseUrl || ""}
                onChange={(e) =>
                  updateRow(n.name, { explorerBaseUrl: e.target.value })
                }
                placeholder="Explorer base URL (optional)"
              />
              <Input
                value={n.rpcUrl || ""}
                onChange={(e) => updateRow(n.name, { rpcUrl: e.target.value })}
                placeholder="RPC URL (optional override)"
              />
            </div>
          </div>
        ))}
        {visibleNetworks.length === 0 && !loading && (
          <div className="text-sm text-gray-400">
            No networks loaded yet. Click Refresh to load from the database.
          </div>
        )}
      </div>

      <div className="rounded-md border border-gray-800 bg-gray-950 p-4">
        <div className="flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
          <div>
            <div className="text-sm font-semibold text-white">Schema Keys</div>
            <div className="text-xs text-gray-400">
              Keys are normalized to snake_case. Disable instead of delete.
            </div>
          </div>
          <Button
            variant="secondary"
            onClick={loadSchemaKeys}
            disabled={loadingKeys}
            className="w-full sm:w-auto"
            type="button"
          >
            {loadingKeys ? (
              <span className="inline-flex items-center gap-2">
                <Loader2 className="h-4 w-4 animate-spin" />
                Loading
              </span>
            ) : (
              "Refresh Keys"
            )}
          </Button>
        </div>

        <div className="mt-4 grid grid-cols-1 gap-3 sm:grid-cols-2">
          <Input
            placeholder="schema key (e.g., daily_checkin)"
            value={newSchemaKey.key}
            onChange={(e) =>
              setNewSchemaKey((p) => ({ ...p, key: e.target.value }))
            }
          />
          <Input
            placeholder="label (e.g., Daily Check-in)"
            value={newSchemaKey.label}
            onChange={(e) =>
              setNewSchemaKey((p) => ({ ...p, label: e.target.value }))
            }
          />
          <Input
            placeholder="description (optional)"
            value={newSchemaKey.description}
            onChange={(e) =>
              setNewSchemaKey((p) => ({ ...p, description: e.target.value }))
            }
          />
                <div className="flex items-center gap-3 text-sm text-gray-200">
                  <span>Active</span>
                  <Toggle
                    checked={newSchemaKey.active}
                    onCheckedChange={(checked) =>
                      setNewSchemaKey((p) => ({ ...p, active: checked }))
                    }
                    ariaLabel="Toggle schema key active"
                  />
                </div>
        </div>
        <div className="mt-3">
          <Button
            className="w-full sm:w-auto"
            disabled={savingKey === "new"}
            onClick={handleCreateSchemaKey}
            type="button"
          >
            {savingKey === "new" ? (
              <span className="inline-flex items-center gap-2">
                <Loader2 className="h-4 w-4 animate-spin" />
                Creating
              </span>
            ) : (
              "Create Schema Key"
            )}
          </Button>
        </div>

        <div className="mt-4 space-y-3">
          {schemaKeys.map((key) => (
            <div
              key={key.key}
              className="rounded-md border border-gray-800 bg-gray-900/40 p-3"
            >
              <div className="flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
                <div className="flex flex-wrap items-center gap-2">
                  <div className="text-sm font-semibold text-white">
                    {key.key}
                  </div>
                  <Badge
                    variant="outline"
                    className="whitespace-nowrap border-gray-700 text-gray-300"
                  >
                    {key.active ? "active" : "disabled"}
                  </Badge>
                </div>
                <div className="flex w-full flex-col gap-2 sm:w-auto sm:flex-row">
                  <Button
                    variant="secondary"
                    className="w-full sm:w-auto"
                    disabled={savingKey === key.key}
                    onClick={() => handleSaveSchemaKey(key)}
                    type="button"
                  >
                    <span className="inline-flex items-center gap-2">
                      <Save className="h-4 w-4" />
                      Save
                    </span>
                  </Button>
                  <Button
                    variant="destructive"
                    className="w-full sm:w-auto"
                    disabled={savingKey === key.key}
                    onClick={() => handleDisableSchemaKey(key.key)}
                    type="button"
                  >
                    <span className="inline-flex items-center gap-2">
                      <Trash2 className="h-4 w-4" />
                      Disable
                    </span>
                  </Button>
                </div>
              </div>

              <div className="mt-3 grid grid-cols-1 gap-3 sm:grid-cols-2">
                <Input
                  value={key.label}
                  onChange={(e) =>
                    updateSchemaKey(key.key, { label: e.target.value })
                  }
                  placeholder="label"
                />
                <Input
                  value={key.description || ""}
                  onChange={(e) =>
                    updateSchemaKey(key.key, { description: e.target.value })
                  }
                  placeholder="description (optional)"
                />
                <div className="flex items-center gap-3 text-sm text-gray-200">
                  <span>Active</span>
                  <Toggle
                    checked={key.active}
                    onCheckedChange={(checked) =>
                      updateSchemaKey(key.key, { active: checked })
                    }
                    ariaLabel={`Toggle ${key.key} active`}
                  />
                </div>
              </div>
            </div>
          ))}
          {schemaKeys.length === 0 && !loadingKeys && (
            <div className="text-sm text-gray-400">
              No schema keys found yet. Create one to enable schema selection.
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
