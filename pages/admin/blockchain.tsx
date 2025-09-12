import React from "react";
import AdminLayout from "@/components/layouts/AdminLayout";
import { useLockManagerAdminAuth } from "@/hooks/useLockManagerAdminAuth";
import AdminAccessRequired from "@/components/admin/AdminAccessRequired";
import KeyGrantReconciliation from "@/components/admin/KeyGrantReconciliation";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Shield, Key, Cog, AlertTriangle } from "lucide-react";
import Link from "next/link";

export default function BlockchainAdminPage() {
  const { isAdmin, loading, authenticated } = useLockManagerAdminAuth();

  // Show loading state while checking authentication
  if (loading) {
    return (
      <AdminLayout>
        <div className="w-full flex justify-center items-center min-h-[400px]">
          <div className="w-12 h-12 border-4 border-flame-yellow/20 border-t-flame-yellow rounded-full animate-spin"></div>
        </div>
      </AdminLayout>
    );
  }

  // Show access required message if not authenticated or not an admin
  if (!authenticated || !isAdmin) {
    return (
      <AdminAccessRequired message="You need admin access to view blockchain tools" />
    );
  }

  return (
    <AdminLayout>
      <div className="w-full">
        <div className="mb-6 flex items-center justify-between">
          <h1 className="text-2xl font-bold text-white">
            Blockchain & Lock Management
          </h1>
        </div>

        <Tabs defaultValue="reconciliation" className="space-y-6">
          <TabsList className="grid w-full grid-cols-3 bg-gray-900/50 border-gray-800">
            <TabsTrigger
              value="reconciliation"
              className="data-[state=active]:bg-steel-red data-[state=active]:text-white"
            >
              <Key className="w-4 h-4 mr-2" />
              Key Reconciliation
            </TabsTrigger>
            <TabsTrigger
              value="locks"
              className="data-[state=active]:bg-steel-red data-[state=active]:text-white"
            >
              <Shield className="w-4 h-4 mr-2" />
              Lock Management
            </TabsTrigger>
            <TabsTrigger
              value="tools"
              className="data-[state=active]:bg-steel-red data-[state=active]:text-white"
            >
              <Cog className="w-4 h-4 mr-2" />
              Tools & Demo
            </TabsTrigger>
          </TabsList>

          {/* Key Grant Reconciliation Tab */}
          <TabsContent value="reconciliation" className="space-y-6">
            <Card className="p-4 bg-gray-900/50 border-gray-800">
              <div className="flex items-center space-x-2 mb-3">
                <AlertTriangle className="w-5 h-5 text-orange-400" />
                <h3 className="text-lg font-semibold text-white">
                  Failed Key Grants
                </h3>
              </div>
              <p className="text-gray-400 text-sm mb-4">
                Monitor and retry failed key grants that occurred during payment
                processing. These may fail due to network issues, insufficient
                gas, or blockchain connectivity problems.
              </p>
            </Card>

            <KeyGrantReconciliation />
          </TabsContent>

          {/* Lock Management Tab */}
          <TabsContent value="locks" className="space-y-6">
            <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
              <Card className="p-6 bg-gray-900/50 border-gray-800">
                <div className="flex items-center mb-4">
                  <Shield className="w-6 h-6 text-blue-400 mr-3" />
                  <h3 className="text-lg font-semibold text-white">
                    Lock Deployment Recovery
                  </h3>
                </div>
                <p className="text-gray-400 text-sm mb-4">
                  Recover from failed database creation after successful lock
                  deployment.
                </p>
                <Link href="/admin/recover-deployment">
                  <Button className="w-full bg-blue-600 hover:bg-blue-700 text-white">
                    Recovery Tools
                  </Button>
                </Link>
              </Card>

              <Card className="p-6 bg-gray-900/50 border-gray-800">
                <div className="flex items-center mb-4">
                  <Key className="w-6 h-6 text-green-400 mr-3" />
                  <h3 className="text-lg font-semibold text-white">
                    Manual Key Granting
                  </h3>
                </div>
                <p className="text-gray-400 text-sm mb-4">
                  Manually grant keys to users for specific cohorts when
                  automation fails.
                </p>
                <Link href="/admin/manual-key-grant">
                  <Button className="w-full bg-green-600 hover:bg-green-700 text-white">
                    Manual Grant
                  </Button>
                </Link>
              </Card>
            </div>

            <Card className="p-6 bg-gray-900/50 border-gray-800">
              <h3 className="text-lg font-semibold text-white mb-4">
                Lock Configuration Guidelines
              </h3>
              <div className="grid grid-cols-1 md:grid-cols-3 gap-4 text-sm">
                <div className="bg-gray-800/50 p-4 rounded">
                  <h4 className="font-medium text-blue-400 mb-2">Cohorts</h4>
                  <ul className="space-y-1 text-gray-300">
                    <li>• Unlimited expiration</li>
                    <li>• USDC pricing</li>
                    <li>• Access control for course content</li>
                    <li>• Max keys based on cohort size</li>
                  </ul>
                </div>
                <div className="bg-gray-800/50 p-4 rounded">
                  <h4 className="font-medium text-green-400 mb-2">Bootcamps</h4>
                  <ul className="space-y-1 text-gray-300">
                    <li>• 1 year expiration</li>
                    <li>• Free (0 ETH price)</li>
                    <li>• Completion certificates</li>
                    <li>• Unlimited keys</li>
                  </ul>
                </div>
                <div className="bg-gray-800/50 p-4 rounded">
                  <h4 className="font-medium text-purple-400 mb-2">Quests</h4>
                  <ul className="space-y-1 text-gray-300">
                    <li>• 1 year expiration</li>
                    <li>• Free (0 ETH price)</li>
                    <li>• Achievement badges</li>
                    <li>• Unlimited keys</li>
                  </ul>
                </div>
              </div>
            </Card>
          </TabsContent>

          {/* Tools & Demo Tab */}
          <TabsContent value="tools" className="space-y-6">
            <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
              <Card className="p-6 bg-gray-900/50 border-gray-800">
                <div className="flex items-center mb-4">
                  <Cog className="w-6 h-6 text-purple-400 mr-3" />
                  <h3 className="text-lg font-semibold text-white">
                    Unlock Protocol Demo
                  </h3>
                </div>
                <p className="text-gray-400 text-sm mb-4">
                  Test Unlock Protocol utilities including lock deployment, key
                  granting, and read operations.
                </p>
                <Link href="/admin/unlock-demo">
                  <Button className="w-full bg-purple-600 hover:bg-purple-700 text-white">
                    Open Demo
                  </Button>
                </Link>
              </Card>

              <Card className="p-6 bg-gray-900/50 border-gray-800">
                <div className="flex items-center mb-4">
                  <AlertTriangle className="w-6 h-6 text-orange-400 mr-3" />
                  <h3 className="text-lg font-semibold text-white">
                    Debug Tools
                  </h3>
                </div>
                <p className="text-gray-400 text-sm mb-4">
                  Debug payment processing, user profiles, and system integrity.
                </p>
                <Link href="/admin/debug">
                  <Button className="w-full bg-orange-600 hover:bg-orange-700 text-white">
                    Debug Console
                  </Button>
                </Link>
              </Card>
            </div>

            <Card className="p-6 bg-gray-900/50 border-gray-800">
              <h3 className="text-lg font-semibold text-white mb-4">
                Blockchain Configuration Status
              </h3>
              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                <div className="bg-gray-800/50 p-4 rounded">
                  <h4 className="font-medium text-blue-400 mb-2">
                    Server Configuration
                  </h4>
                  <p className="text-gray-300 text-sm">
                    Private key access for automated operations like key
                    granting and lock deployment from admin forms.
                  </p>
                </div>
                <div className="bg-gray-800/50 p-4 rounded">
                  <h4 className="font-medium text-green-400 mb-2">
                    Client Configuration
                  </h4>
                  <p className="text-gray-300 text-sm">
                    Public client for read operations and user-initiated
                    transactions via connected wallets.
                  </p>
                </div>
              </div>
            </Card>
          </TabsContent>
        </Tabs>
      </div>
    </AdminLayout>
  );
}
