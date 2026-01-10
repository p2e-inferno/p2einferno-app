import React from "react";
import Link from "next/link";
import { Button } from "@/components/ui/button";
import {
  BookOpen,
  Users,
  FileText,
  Award,
  CreditCard,
  Key,
  Play,
  Coins,
  Zap,
} from "lucide-react";

const adminModules = [
  {
    title: "Bootcamps",
    description: "Create and manage bootcamp programs",
    icon: BookOpen,
    href: "/admin/bootcamps",
    color: "from-blue-600 to-blue-700",
    buttonText: "Manage Bootcamps",
  },
  {
    title: "Cohorts",
    description: "Create and manage cohorts for bootcamps",
    icon: Users,
    href: "/admin/cohorts",
    color: "from-green-600 to-green-700",
    buttonText: "Manage Cohorts",
  },
  {
    title: "Applications",
    description: "Manage user applications and resolve data inconsistencies",
    icon: FileText,
    href: "/admin/applications",
    color: "from-purple-600 to-purple-700",
    buttonText: "Manage Applications",
  },
  {
    title: "Milestones",
    description: "Create and manage learning milestones",
    subDescription: "Manage milestones from within cohort details",
    icon: Award,
    href: "/admin/cohorts",
    color: "from-yellow-600 to-yellow-700",
    buttonText: "View Cohorts",
  },
  {
    title: "Quests",
    description: "Create and manage quest programs",
    icon: Play,
    href: "/admin/quests",
    color: "from-orange-600 to-orange-700",
    buttonText: "Manage Quests",
  },
  {
    title: "Payments",
    description: "Manage payment transactions and reconcile stuck payments",
    icon: CreditCard,
    href: "/admin/payments",
    color: "from-emerald-600 to-emerald-700",
    buttonText: "Manage Payments",
  },
  {
    title: "Blockchain & Keys",
    description: "Manage lock deployments and key granting reconciliation",
    icon: Key,
    href: "/admin/blockchain",
    color: "from-indigo-600 to-indigo-700",
    buttonText: "Blockchain Tools",
  },
  {
    title: "DG Pullouts",
    description: "Configure withdrawal limits and view audit history",
    icon: Coins,
    href: "/admin/dg-pullouts",
    color: "from-teal-600 to-teal-700",
    buttonText: "Manage Pullouts",
  },
  {
    title: "Subscription Configuration",
    description: "Manage XP service fees and treasury operations",
    icon: Zap,
    href: "/admin/subscriptions/config",
    color: "from-rose-600 to-rose-700",
    buttonText: "Configure Subscriptions",
  },
];

export default function AdminDashboard() {
  return (
    <div className="space-y-8">
      {/* Welcome Section */}
      <div className="text-center mb-8 mt-6">
        <h1 className="text-3xl sm:text-4xl font-bold text-white mb-4">
          Admin Dashboard
        </h1>
        <p className="text-gray-400 text-lg max-w-2xl mx-auto">
          Welcome to the P2E Inferno management console. Manage your bootcamps,
          cohorts, quests, and more.
        </p>
      </div>

      {/* Quick Stats Section */}
      <div className="mb-8">
        <h2 className="text-2xl font-bold text-white mb-6 text-center">
          Quick Overview
        </h2>
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
          <div className="bg-gray-900 border border-gray-800 rounded-lg p-4 text-center">
            <div className="text-2xl font-bold text-flame-yellow mb-2">0</div>
            <div className="text-gray-400 text-sm">Active Cohorts</div>
          </div>
          <div className="bg-gray-900 border border-gray-800 rounded-lg p-4 text-center">
            <div className="text-2xl font-bold text-flame-yellow mb-2">0</div>
            <div className="text-gray-400 text-sm">Total Participants</div>
          </div>
          <div className="bg-gray-900 border border-gray-800 rounded-lg p-4 text-center">
            <div className="text-2xl font-bold text-flame-yellow mb-2">0</div>
            <div className="text-gray-400 text-sm">Active Quests</div>
          </div>
          <div className="bg-gray-900 border border-gray-800 rounded-lg p-4 text-center">
            <div className="text-2xl font-bold text-flame-yellow mb-2">0</div>
            <div className="text-gray-400 text-sm">Pending Applications</div>
          </div>
        </div>
      </div>

      {/* Admin Modules Grid */}
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
        {adminModules.map((module, index) => (
          <div
            key={index}
            className="bg-gray-900 border border-gray-800 rounded-lg p-6 hover:border-gray-700 transition-colors"
          >
            {/* Icon and Title */}
            <div className="flex items-start space-x-4 mb-4">
              <div
                className={`p-3 rounded-lg bg-gradient-to-r ${module.color}`}
              >
                <module.icon className="w-6 h-6 text-white" />
              </div>
              <div className="flex-1 min-w-0">
                <h3 className="text-lg font-semibold text-white mb-1">
                  {module.title}
                </h3>
              </div>
            </div>

            {/* Description */}
            <div className="mb-4">
              <p className="text-gray-300 text-sm leading-relaxed">
                {module.description}
              </p>
              {module.subDescription && (
                <p className="text-gray-400 text-sm mt-2 leading-relaxed">
                  {module.subDescription}
                </p>
              )}
            </div>

            {/* Action Button */}
            <div className="flex justify-end">
              <Link href={module.href} className="w-full">
                <Button className="w-full bg-gray-800 hover:bg-gray-700 text-white border border-gray-700">
                  {module.buttonText}
                </Button>
              </Link>
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}
