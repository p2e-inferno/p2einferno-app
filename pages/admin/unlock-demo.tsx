import AdminLayout from "@/components/layouts/AdminLayout";
import { UnlockUtilsDemo } from "@/components/unlock/UnlockUtilsDemo";

export default function UnlockDemoPage() {
  return (
    <AdminLayout>
      <div className="w-full">
        <div className="mb-6">
          <h1 className="text-2xl font-bold text-white mb-2">
            Unlock Protocol Demo
          </h1>
          <p className="text-gray-400">
            Test and explore Unlock Protocol functionality including lock
            deployment, key operations, and blockchain interactions.
          </p>
        </div>

        <UnlockUtilsDemo />
      </div>
    </AdminLayout>
  );
}
