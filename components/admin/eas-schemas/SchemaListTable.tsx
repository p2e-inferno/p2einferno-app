import { useMemo } from "react";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Loader2 } from "lucide-react";
import { keccak256, stringToHex } from "viem";
import { isBytes32Hex } from "@/lib/attestation/utils/hex";

export type SchemaRow = {
  id: string;
  schema_uid: string;
  name: string;
  description: string;
  category: string;
  schema_definition: string;
  schema_key?: string | null;
  revocable: boolean;
  created_at: string;
  network: string;
};

interface SchemaListTableProps {
  schemas: SchemaRow[];
  onViewDetails: (schema: SchemaRow) => void;
  loadingSchemaId?: string | null;
}

const truncate = (value: string, max = 64) =>
  value.length > max ? `${value.slice(0, max)}...` : value;

const isValidSchemaUid = (uid: string) => isBytes32Hex(uid);

const isDerivedUid = (schemaDefinition: string, uid: string) => {
  if (!schemaDefinition) return false;
  return keccak256(stringToHex(schemaDefinition)) === uid;
};

export default function SchemaListTable({
  schemas,
  onViewDetails,
  loadingSchemaId = null,
}: SchemaListTableProps) {
  const rows = useMemo(() => schemas || [], [schemas]);

  if (!rows.length) {
    return <div className="text-sm text-gray-400">No schemas found.</div>;
  }

  return (
    <div className="space-y-4">
      <div className="space-y-3 md:hidden">
        {rows.map((schema) => (
          <div
            key={schema.id}
            className="rounded-md border border-gray-800 bg-gray-950 p-4"
          >
            <div className="flex items-start justify-between gap-3">
              <div>
                <div className="text-sm font-semibold text-white">
                  {schema.name}
                </div>
                <div className="mt-1 text-xs text-gray-400">
                  {truncate(schema.schema_definition, 72)}
                </div>
              </div>
              <Button
                variant="secondary"
                className="shrink-0 min-w-[96px]"
                disabled={loadingSchemaId === schema.id}
                onClick={() => onViewDetails(schema)}
                aria-label="View details"
              >
                {loadingSchemaId === schema.id ? (
                  <span className="inline-flex items-center justify-center">
                    <Loader2 className="h-4 w-4 animate-spin" />
                  </span>
                ) : (
                  "Details"
                )}
              </Button>
            </div>
            <div className="mt-3 flex flex-wrap gap-2">
              <Badge
                variant="outline"
                className="inline-flex items-center whitespace-nowrap rounded-full border-gray-700 px-2 py-0.5 text-xs text-gray-300"
              >
                {schema.category}
              </Badge>
              {!isValidSchemaUid(schema.schema_uid) ? (
                <Badge
                  variant="outline"
                  className="inline-flex items-center whitespace-nowrap rounded-full border-red-700 px-2 py-0.5 text-xs text-red-300"
                >
                  Not on-chain
                </Badge>
              ) : isDerivedUid(schema.schema_definition, schema.schema_uid) ? (
                <Badge
                  variant="outline"
                  className="inline-flex items-center whitespace-nowrap rounded-full border-yellow-700 px-2 py-0.5 text-xs text-yellow-300"
                >
                  Hash-derived
                </Badge>
              ) : (
                <Badge
                  variant="outline"
                  className="inline-flex items-center whitespace-nowrap rounded-full border-gray-700 px-2 py-0.5 text-xs text-gray-300"
                >
                  UID set
                </Badge>
              )}
              <Badge
                variant="outline"
                className="inline-flex items-center whitespace-nowrap rounded-full border-gray-700 px-2 py-0.5 text-xs text-gray-300"
              >
                {schema.revocable ? "Revocable" : "Non-revocable"}
              </Badge>
              <Badge
                variant="outline"
                className="inline-flex items-center whitespace-nowrap rounded-full border-gray-700 px-2 py-0.5 text-xs text-gray-300"
              >
                {new Date(schema.created_at).toLocaleDateString()}
              </Badge>
            </div>
          </div>
        ))}
      </div>

      <div className="hidden md:block overflow-x-auto rounded-md border border-gray-800">
        <table className="min-w-full text-sm">
          <thead className="bg-gray-900 text-gray-300">
            <tr>
              <th className="px-4 py-2 text-left">Name</th>
              <th className="px-4 py-2 text-left">Category</th>
              <th className="px-4 py-2 text-left">Definition</th>
              <th className="px-4 py-2 text-left">Status</th>
              <th className="px-4 py-2 text-left">Revocable</th>
              <th className="px-4 py-2 text-left">Created</th>
              <th className="px-4 py-2 text-left">Actions</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-gray-800">
            {rows.map((schema) => (
              <tr key={schema.id} className="bg-gray-950 text-gray-200">
                <td className="px-4 py-2 font-medium">{schema.name}</td>
                <td className="px-4 py-2">
                  <Badge
                    variant="outline"
                    className="inline-flex items-center whitespace-nowrap rounded-full border-gray-700 px-2 py-0.5 text-xs text-gray-300"
                  >
                    {schema.category}
                  </Badge>
                </td>
                <td className="px-4 py-2">
                  {truncate(schema.schema_definition)}
                </td>
                <td className="px-4 py-2">
                  {!isValidSchemaUid(schema.schema_uid) ? (
                    <Badge
                      variant="outline"
                      className="inline-flex items-center whitespace-nowrap rounded-full border-red-700 px-2 py-0.5 text-xs text-red-300"
                    >
                      Not on-chain
                    </Badge>
                  ) : isDerivedUid(
                      schema.schema_definition,
                      schema.schema_uid,
                    ) ? (
                    <Badge
                      variant="outline"
                      className="inline-flex items-center whitespace-nowrap rounded-full border-yellow-700 px-2 py-0.5 text-xs text-yellow-300"
                    >
                      Hash-derived
                    </Badge>
                  ) : (
                    <Badge
                      variant="outline"
                      className="inline-flex items-center whitespace-nowrap rounded-full border-gray-700 px-2 py-0.5 text-xs text-gray-300"
                    >
                      UID set
                    </Badge>
                  )}
                </td>
                <td className="px-4 py-2">{schema.revocable ? "Yes" : "No"}</td>
                <td className="px-4 py-2">
                  {new Date(schema.created_at).toLocaleDateString()}
                </td>
                <td className="px-4 py-2">
                  <Button
                    variant="secondary"
                    className="min-w-[96px]"
                    disabled={loadingSchemaId === schema.id}
                    onClick={() => onViewDetails(schema)}
                    aria-label="View details"
                  >
                    {loadingSchemaId === schema.id ? (
                      <span className="inline-flex items-center justify-center">
                        <Loader2 className="h-4 w-4 animate-spin" />
                      </span>
                    ) : (
                      "Details"
                    )}
                  </Button>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}
