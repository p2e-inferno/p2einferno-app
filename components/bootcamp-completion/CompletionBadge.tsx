import { Badge } from "@/components/ui/badge";

interface CompletionBadgeProps {
  isCompleted: boolean;
  completionDate: string | null;
  certificateIssued: boolean;
}

export function CompletionBadge({
  isCompleted,
  completionDate,
  certificateIssued,
}: CompletionBadgeProps) {
  if (!isCompleted) return null;
  return (
    <div className="flex items-center gap-2">
      <Badge variant="primary">
        Completed{" "}
        {completionDate
          ? `on ${new Date(completionDate).toLocaleDateString()}`
          : ""}
      </Badge>
      {certificateIssued && (
        <Badge variant="secondary">Certificate Claimed</Badge>
      )}
    </div>
  );
}
