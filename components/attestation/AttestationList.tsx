/**
 * Attestation List Component
 * Displays a list of attestations with filtering and pagination
 */

import React, { useState } from "react";
import { AttestationCard } from "./AttestationCard";
import { useUserAttestations } from "@/hooks/attestation";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Search, Filter, RefreshCw } from "lucide-react";

interface AttestationListProps {
  userAddress?: string;
  schemaUid?: string;
  category?: string;
  limit?: number;
  showSearch?: boolean;
  showFilters?: boolean;
  showRefresh?: boolean;
  className?: string;
}

export const AttestationList: React.FC<AttestationListProps> = ({
  userAddress,
  schemaUid,
  category,
  limit = 10,
  showSearch = true,
  showFilters = true,
  showRefresh = true,
  className = "",
}) => {
  const [searchQuery, setSearchQuery] = useState("");
  const [selectedCategory, setSelectedCategory] = useState<string>(
    category || "all",
  );
  const { attestations, isLoading, error, refetch } = useUserAttestations(
    userAddress,
    {
      schemaUid: schemaUid,
      category: selectedCategory !== "all" ? selectedCategory : undefined,
      limit,
      autoRefresh: false,
    },
  );

  // Filter attestations based on search query
  const filteredAttestations = attestations.filter((attestation) => {
    if (!searchQuery) return true;

    const searchLower = searchQuery.toLowerCase();
    const schemaName =
      (attestation as any).attestation_schemas?.name?.toLowerCase() || "";
    const description =
      (attestation as any).attestation_schemas?.description?.toLowerCase() ||
      "";
    const uid = attestation.attestation_uid.toLowerCase();

    return (
      schemaName.includes(searchLower) ||
      description.includes(searchLower) ||
      uid.includes(searchLower)
    );
  });

  if (isLoading) {
    return (
      <div className={`space-y-4 ${className}`}>
        <div className="flex items-center justify-center py-8">
          <RefreshCw className="w-6 h-6 animate-spin text-muted-foreground" />
          <span className="ml-2 text-muted-foreground">
            Loading attestations...
          </span>
        </div>
      </div>
    );
  }

  if (error) {
    return (
      <div className={`space-y-4 ${className}`}>
        <div className="flex items-center justify-center py-8 text-red-500">
          <span>Error loading attestations: {error}</span>
        </div>
        {showRefresh && (
          <div className="flex justify-center">
            <Button onClick={() => refetch()} variant="outline" size="sm">
              <RefreshCw className="w-4 h-4 mr-2" />
              Try Again
            </Button>
          </div>
        )}
      </div>
    );
  }

  return (
    <div className={`space-y-4 ${className}`}>
      {/* Search and Filters */}
      {(showSearch || showFilters || showRefresh) && (
        <div className="flex flex-col sm:flex-row gap-4 items-start sm:items-center">
          {/* Search */}
          {showSearch && (
            <div className="relative flex-1 max-w-sm">
              <Search className="absolute left-3 top-1/2 transform -translate-y-1/2 w-4 h-4 text-muted-foreground" />
              <Input
                placeholder="Search attestations..."
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                className="pl-10"
              />
            </div>
          )}

          {/* Filters */}
          {showFilters && (
            <div className="flex gap-2">
              <Select
                value={selectedCategory}
                onValueChange={setSelectedCategory}
              >
                <SelectTrigger className="w-[140px]">
                  <Filter className="w-4 h-4 mr-2" />
                  <SelectValue placeholder="Category" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">All Categories</SelectItem>
                  <SelectItem value="attendance">Attendance</SelectItem>
                  <SelectItem value="achievement">Achievement</SelectItem>
                  <SelectItem value="social">Social</SelectItem>
                  <SelectItem value="verification">Verification</SelectItem>
                  <SelectItem value="review">Review</SelectItem>
                </SelectContent>
              </Select>
            </div>
          )}

          {/* Refresh Button */}
          {showRefresh && (
            <Button onClick={() => refetch()} variant="outline" size="sm">
              <RefreshCw className="w-4 h-4 mr-2" />
              Refresh
            </Button>
          )}
        </div>
      )}

      {/* Attestations List */}
      {filteredAttestations.length === 0 ? (
        <div className="text-center py-8 text-muted-foreground">
          <div className="space-y-2">
            <p>No attestations found</p>
            {searchQuery && (
              <p className="text-sm">Try adjusting your search terms</p>
            )}
          </div>
        </div>
      ) : (
        <div className="grid gap-4">
          {filteredAttestations.map((attestation) => (
            <AttestationCard
              key={attestation.id}
              attestation={attestation}
              showDetails={true}
            />
          ))}
        </div>
      )}

      {/* Results Summary */}
      {filteredAttestations.length > 0 && (
        <div className="text-center text-sm text-muted-foreground">
          Showing {filteredAttestations.length} of {attestations.length}{" "}
          attestations
        </div>
      )}
    </div>
  );
};
