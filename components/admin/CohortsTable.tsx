import React from "react";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Edit, Trash2, Users, Calendar, BookOpen } from "lucide-react";
import AdminResponsiveTable from "./AdminResponsiveTable";
import Link from "next/link";

interface Cohort {
  id: string;
  name: string;
  bootcamp_name: string;
  start_date: string;
  end_date: string;
  max_participants: number;
  current_participants: number;
  status: "active" | "inactive" | "completed";
  created_at: string;
}

interface CohortsTableProps {
  cohorts: Cohort[];
  onEdit?: (cohort: Cohort) => void;
  onDelete?: (cohortId: string) => void;
  isLoading?: boolean;
}

export default function CohortsTable({
  cohorts,
  onEdit,
  onDelete,
  isLoading = false,
}: CohortsTableProps) {
  const getStatusBadge = (status: string) => {
    const statusConfig = {
      active: { color: "bg-green-600", label: "Active" },
      inactive: { color: "bg-gray-600", label: "Inactive" },
      completed: { color: "bg-blue-600", label: "Completed" },
    };

    const config = statusConfig[status as keyof typeof statusConfig] || statusConfig.inactive;

    return (
      <Badge className={config.color}>
        {config.label}
      </Badge>
    );
  };

  const formatDate = (dateString: string) => {
    return new Date(dateString).toLocaleDateString();
  };

  const formatParticipants = (current: number, max: number) => {
    return `${current}/${max}`;
  };

  const columns = [
    {
      key: "name",
      label: "Cohort Name",
      mobilePriority: "high" as const,
      render: (value: string) => (
        <div className="font-medium text-white">{value}</div>
      ),
    },
    {
      key: "bootcamp_name",
      label: "Bootcamp",
      mobilePriority: "high" as const,
      render: (value: string) => (
        <div className="flex items-center">
          <BookOpen className="w-4 h-4 mr-2 text-gray-400" />
          <span>{value}</span>
        </div>
      ),
    },
    {
      key: "status",
      label: "Status",
      mobilePriority: "high" as const,
      render: (value: string) => getStatusBadge(value),
    },
    {
      key: "participants",
      label: "Participants",
      mobilePriority: "medium" as const,
      render: (_: any, row: Cohort) => (
        <div className="flex items-center">
          <Users className="w-4 h-4 mr-2 text-gray-400" />
          <span>{formatParticipants(row.current_participants, row.max_participants)}</span>
        </div>
      ),
    },
    {
      key: "dates",
      label: "Duration",
      mobilePriority: "medium" as const,
      render: (_: any, row: Cohort) => (
        <div className="flex items-center">
          <Calendar className="w-4 h-4 mr-2 text-gray-400" />
          <span>{formatDate(row.start_date)} - {formatDate(row.end_date)}</span>
        </div>
      ),
    },
    {
      key: "created_at",
      label: "Created",
      mobilePriority: "low" as const,
      render: (value: string) => formatDate(value),
    },
    {
      key: "actions",
      label: "Actions",
      mobilePriority: "low" as const,
      render: (_: any, row: Cohort) => (
        <div className="flex items-center justify-end space-x-2">
          <Link href={`/admin/cohorts/${row.id}`}>
            <Button size="sm" variant="outline" className="h-8 px-3">
              <Edit className="w-4 h-4 mr-1" />
              View
            </Button>
          </Link>
          {onEdit && (
            <Button
              size="sm"
              variant="outline"
              className="h-8 px-3"
              onClick={() => onEdit(row)}
            >
              <Edit className="w-4 h-4 mr-1" />
              Edit
            </Button>
          )}
          {onDelete && (
            <Button
              size="sm"
              variant="destructive"
              className="h-8 px-3"
              onClick={() => onDelete(row.id)}
            >
              <Trash2 className="w-4 h-4 mr-1" />
              Delete
            </Button>
          )}
        </div>
      ),
    },
  ];

  if (isLoading) {
    return (
      <div className="flex justify-center items-center py-12">
        <div className="animate-spin rounded-full h-8 w-8 border-t-2 border-b-2 border-flame-yellow"></div>
      </div>
    );
  }

  return (
    <AdminResponsiveTable
      columns={columns}
      data={cohorts}
      emptyMessage="No cohorts found. Create your first cohort to get started."
      className="mt-6"
    />
  );
}
