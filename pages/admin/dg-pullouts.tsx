import AdminLayout from "@/components/layouts/AdminLayout";
import { WithdrawalLimitsConfig } from "@/components/admin/WithdrawalLimitsConfig";

/**
 * Admin page for managing DG token pullout configuration
 * Allows admins to configure min/max withdrawal limits and view audit history
 */
export default function DGPulloutsPage() {
  return (
    <AdminLayout>
      <div className="space-y-8 p-6">
        <div className="mb-8">
          <h1 className="text-3xl font-bold text-white mb-2">
            DG Token Pullouts
          </h1>
          <p className="text-gray-400">
            Configure minimum and maximum pullout limits. Changes are logged for
            audit compliance.
          </p>
        </div>

        <WithdrawalLimitsConfig />
      </div>
    </AdminLayout>
  );
}
