/**
 * Hook for managing attestation schemas
 */

import { useState, useEffect } from "react";
import {
  getAllSchemas,
  getSchemaByUid,
  getSchemasByCategory,
  AttestationSchema,
} from "@/lib/attestation";

export const useAttestationSchemas = (category?: string) => {
  const [schemas, setSchemas] = useState<AttestationSchema[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const fetchSchemas = async () => {
    setIsLoading(true);
    setError(null);
    try {
      const data = category
        ? await getSchemasByCategory(category)
        : await getAllSchemas();
      setSchemas(data);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to fetch schemas");
    } finally {
      setIsLoading(false);
    }
  };

  useEffect(() => {
    fetchSchemas();
  }, [category]);

  return {
    schemas,
    isLoading,
    error,
    refetch: fetchSchemas,
  };
};

export const useAttestationSchema = (schemaUid: string) => {
  const [schema, setSchema] = useState<AttestationSchema | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const fetchSchema = async () => {
    if (!schemaUid) return;

    setIsLoading(true);
    setError(null);
    try {
      const data = await getSchemaByUid(schemaUid);
      setSchema(data);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to fetch schema");
    } finally {
      setIsLoading(false);
    }
  };

  useEffect(() => {
    fetchSchema();
  }, [schemaUid]);

  return {
    schema,
    isLoading,
    error,
    refetch: fetchSchema,
  };
};
