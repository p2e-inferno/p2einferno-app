import { useCallback, useMemo, useState } from "react";
import AdminLayout from "@/components/layouts/AdminLayout";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { useAdminApi } from "@/hooks/useAdminApi";
import { useAdminFetchOnce } from "@/hooks/useAdminFetchOnce";
import { useAdminAuthContext } from "@/contexts/admin-context";
import NetworkSelector, {
  type NetworkOption,
} from "@/components/admin/eas-schemas/NetworkSelector";
import SchemaDeploymentForm from "@/components/admin/eas-schemas/SchemaDeploymentForm";
import SchemaListTable, {
  type SchemaRow,
} from "@/components/admin/eas-schemas/SchemaListTable";
import SchemaSyncPanel from "@/components/admin/eas-schemas/SchemaSyncPanel";
import SchemaDetailsCard from "@/components/admin/eas-schemas/SchemaDetailsCard";
import EasConfigPanel from "@/components/admin/eas-schemas/EasConfigPanel";
import { NetworkError } from "@/components/ui/network-error";
import { Button } from "@/components/ui/button";
import {
  isSignatureRequestCancelled,
  useAdminSignedAction,
} from "@/hooks/useAdminSignedAction";
import { keccak256, stringToHex } from "viem";
import { isBytes32Hex } from "@/lib/attestation/utils/hex";

interface NetworkConfigResponse {
  schemas?: SchemaRow[];
}

type NetworkOptionWithMeta = NetworkOption & {
  chainId: number;
  easScanBaseUrl?: string | null;
  explorerBaseUrl?: string | null;
};

export default function EasSchemasAdminPage() {
  const { authenticated, isAdmin, walletAddress } = useAdminAuthContext();
  const { adminFetch } = useAdminApi({ suppressToasts: true });
  const { signAdminAction, isSigning } = useAdminSignedAction();
  const [networks, setNetworks] = useState<NetworkOptionWithMeta[]>([]);
  const [selectedNetwork, setSelectedNetwork] =
    useState<string>("base-sepolia");
  const [schemas, setSchemas] = useState<SchemaRow[]>([]);
  const [detailsOpen, setDetailsOpen] = useState(false);
  const [detailsSchema, setDetailsSchema] = useState<SchemaRow | null>(null);
  const [detailsCount, setDetailsCount] = useState(0);
  const [detailsOnChain, setDetailsOnChain] = useState(false);
  const [detailsDerivedFromDefinition, setDetailsDerivedFromDefinition] =
    useState(false);
  const [detailsError, setDetailsError] = useState<string | null>(null);
  const [detailsActionError, setDetailsActionError] = useState<string | null>(
    null,
  );
  const [detailsTarget, setDetailsTarget] = useState<SchemaRow | null>(null);
  const [isRedeploying, setIsRedeploying] = useState(false);
  const [detailsLoadingId, setDetailsLoadingId] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [isRetrying, setIsRetrying] = useState(false);

  const loadNetworks = useCallback(async () => {
    setError(null);
    const { data, error } = await adminFetch<{
      networks: NetworkOptionWithMeta[];
    }>("/api/admin/eas-networks");
    if (error) {
      setError(error);
      return;
    }
    const list = data?.networks || [];
    setNetworks(list);
    if (
      list.length > 0 &&
      !list.find((network) => network.name === selectedNetwork)
    ) {
      const first = list[0];
      if (first) {
        setSelectedNetwork(first.name);
      }
    }
  }, [adminFetch, selectedNetwork]);

  const loadSchemas = useCallback(async () => {
    setError(null);
    const { data, error } = await adminFetch<NetworkConfigResponse>(
      `/api/admin/eas-schemas?network=${selectedNetwork}`,
    );
    if (error) {
      setError(error);
      return;
    }
    setSchemas(data?.schemas || []);
  }, [adminFetch, selectedNetwork]);

  useAdminFetchOnce({
    authenticated,
    isAdmin,
    walletKey: walletAddress || null,
    keys: ["eas-networks"],
    fetcher: loadNetworks,
  });

  useAdminFetchOnce({
    authenticated,
    isAdmin,
    walletKey: walletAddress || null,
    keys: ["eas-schemas", selectedNetwork],
    fetcher: loadSchemas,
  });

  const handleRetry = async () => {
    setIsRetrying(true);
    await Promise.all([loadNetworks(), loadSchemas()]);
    setIsRetrying(false);
  };

  const selectedNetworkConfig = useMemo(() => {
    return networks.find((network) => network.name === selectedNetwork) || null;
  }, [networks, selectedNetwork]);

  const handleViewDetails = async (schema: SchemaRow) => {
    if (!selectedNetworkConfig) {
      setError("Network configuration unavailable");
      return;
    }
    setDetailsLoadingId(schema.id);
    setDetailsError(null);
    setDetailsActionError(null);
    setDetailsTarget(schema);
    const { data, error } = await adminFetch<{
      schema: SchemaRow;
      attestationCount: number;
      onChain?: boolean;
    }>(
      `/api/admin/eas-schemas/${schema.schema_uid}?network=${selectedNetwork}`,
    );
    if (error || !data?.schema) {
      setDetailsSchema(null);
      setDetailsError(error || "Failed to load schema details");
      setDetailsOpen(true);
      setDetailsLoadingId(null);
      return;
    }
    setDetailsSchema(data.schema);
    setDetailsCount(data.attestationCount || 0);
    setDetailsOnChain(Boolean(data.onChain));
    setDetailsDerivedFromDefinition(
      data.schema.schema_uid ===
        keccak256(stringToHex(data.schema.schema_definition)),
    );
    setDetailsOpen(true);
    setDetailsLoadingId(null);
  };

  const isValidSchemaUid = (uid: string) => isBytes32Hex(uid);

  const handleRetryDetails = async () => {
    if (!detailsTarget) return;
    await handleViewDetails(detailsTarget);
  };

  const handleRedeploy = async () => {
    if (!detailsSchema || !selectedNetworkConfig) return;

    setDetailsActionError(null);
    setIsRedeploying(true);
    try {
      const schemaDefinitionHash = keccak256(
        stringToHex(detailsSchema.schema_definition),
      );
      const timestamp = Math.floor(Date.now() / 1000);
      const nonce = `${Date.now()}_${Math.random().toString(36).slice(2)}`;

      const signedAction = await signAdminAction(
        {
          action: "redeploy",
          network: selectedNetworkConfig.name,
          schemaDefinitionHash,
          schemaUid: detailsSchema.schema_uid,
          transactionHash: "",
          timestamp,
          nonce,
        },
        selectedNetworkConfig.chainId,
      );

      const { data, error } = await adminFetch<{
        success?: boolean;
        schemaUid?: string;
        transactionHash?: string;
        previousSchemaUid?: string;
        error?: string;
      }>(`/api/admin/eas-schemas/${detailsSchema.schema_uid}/redeploy`, {
        method: "POST",
        headers: {
          "X-Active-Wallet": signedAction.signerAddress,
        },
        body: JSON.stringify({
          network: selectedNetworkConfig.name,
          signedAction,
        }),
      });

      if (error) {
        setDetailsActionError(error);
        return;
      }

      if (data?.schemaUid) {
        await loadSchemas();
        setDetailsSchema({
          ...detailsSchema,
          schema_uid: data.schemaUid,
        });
        setDetailsOnChain(true);
        setDetailsDerivedFromDefinition(false);
      }
    } catch (err: any) {
      if (isSignatureRequestCancelled(err)) {
        return;
      }
      setDetailsActionError(err?.message || "Failed to redeploy schema");
    } finally {
      setIsRedeploying(false);
    }
  };

  if (error) {
    return (
      <AdminLayout>
        <NetworkError
          error={error}
          onRetry={handleRetry}
          isRetrying={isRetrying}
        />
      </AdminLayout>
    );
  }

  return (
    <AdminLayout>
      <div className="space-y-6">
        <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
          <div>
            <h1 className="text-2xl font-semibold text-white">EAS Schemas</h1>
            <p className="text-sm text-gray-400">
              Deploy and manage attestation schemas per network.
            </p>
          </div>
          {networks.length > 0 && (
            <NetworkSelector
              networks={networks}
              selected={selectedNetwork}
              onChange={setSelectedNetwork}
            />
          )}
        </div>

        <Tabs defaultValue="schemas">
          <TabsList className="w-full flex-wrap justify-start">
            <TabsTrigger value="schemas">All Schemas</TabsTrigger>
            <TabsTrigger value="deploy">Deploy New</TabsTrigger>
            <TabsTrigger value="sync">Sync Existing</TabsTrigger>
            <TabsTrigger value="config">EAS Config</TabsTrigger>
          </TabsList>

          <TabsContent value="schemas">
            <SchemaListTable
              schemas={schemas}
              onViewDetails={handleViewDetails}
              loadingSchemaId={detailsLoadingId}
            />
          </TabsContent>

          <TabsContent value="deploy">
            {selectedNetworkConfig?.chainId && (
              <SchemaDeploymentForm
                network={{
                  name: selectedNetworkConfig.name,
                  chainId: selectedNetworkConfig.chainId,
                  easScanBaseUrl: selectedNetworkConfig.easScanBaseUrl,
                }}
                onSuccess={loadSchemas}
              />
            )}
          </TabsContent>

          <TabsContent value="sync">
            {selectedNetworkConfig?.chainId && (
              <SchemaSyncPanel
                network={{
                  name: selectedNetworkConfig.name,
                  chainId: selectedNetworkConfig.chainId,
                }}
                onSuccess={loadSchemas}
              />
            )}
          </TabsContent>

          <TabsContent value="config">
            {selectedNetworkConfig?.chainId && (
              <EasConfigPanel onChanged={loadNetworks} />
            )}
          </TabsContent>
        </Tabs>
      </div>

      <Dialog open={detailsOpen} onOpenChange={setDetailsOpen}>
        <DialogContent className="bg-gray-950 border border-gray-800 text-gray-100">
          <DialogHeader className="text-center sm:text-center">
            <DialogTitle className="text-center">Schema Details</DialogTitle>
          </DialogHeader>
          {detailsError && (
            <div className="rounded-md border border-red-900/60 bg-red-950/40 p-4 text-sm text-red-200">
              <div className="font-semibold">Unable to load schema details</div>
              <div className="mt-1 text-red-300/90">{detailsError}</div>
              <div className="mt-4 flex gap-2">
                <Button
                  variant="secondary"
                  onClick={handleRetryDetails}
                  disabled={isRedeploying || isSigning}
                >
                  Try Again
                </Button>
                <Button variant="ghost" onClick={() => setDetailsOpen(false)}>
                  Close
                </Button>
              </div>
            </div>
          )}
          {!detailsError && detailsSchema && (
            <SchemaDetailsCard
              schema={detailsSchema}
              attestationCount={detailsCount}
              network={{
                name: selectedNetworkConfig?.name || selectedNetwork,
              }}
              easScanBaseUrl={selectedNetworkConfig?.easScanBaseUrl || null}
              onChain={detailsOnChain}
              isValidSchemaUid={isValidSchemaUid(detailsSchema.schema_uid)}
              derivedFromDefinition={detailsDerivedFromDefinition}
              actionError={detailsActionError}
              isRedeploying={isRedeploying || isSigning}
              onRedeploy={handleRedeploy}
            />
          )}
        </DialogContent>
      </Dialog>
    </AdminLayout>
  );
}
