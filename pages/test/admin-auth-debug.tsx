import Head from "next/head";
import {
  AdminAuthDebugProvider,
  AdminAuthDebugPanel,
} from "@/components/admin/AdminAuthDebugPanel";

const AdminAuthDebugTestPage = () => {
  return (
    <AdminAuthDebugProvider>
      <Head>
        <title>Admin Auth Debug Test</title>
      </Head>
      <main className="mx-auto flex min-h-screen max-w-4xl flex-col gap-6 bg-slate-950 px-4 py-8 text-slate-100">
        <header className="space-y-2">
          <h1 className="text-2xl font-bold">
            Admin Authentication Debug (Isolated)
          </h1>
          <p className="text-sm text-slate-300">
            This standalone page mounts the AdminAuthProvider outside the admin
            layout so you can validate RPC behavior without legacy admin hooks
            interfering.
          </p>
          <p className="text-xs uppercase tracking-wide text-amber-300">
            Remove once validation is complete. Do not expose in production.
          </p>
        </header>

        <AdminAuthDebugPanel />
      </main>
    </AdminAuthDebugProvider>
  );
};

export default AdminAuthDebugTestPage;
