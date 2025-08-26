import React, { useEffect } from "react";
import { useRouter } from "next/router";
import { usePrivy } from "@privy-io/react-auth";
import Head from "next/head";
import Link from "next/link";
import { MainLayout } from "@/components/layouts/MainLayout";
import { useUserEnrollments } from "@/hooks/useUserEnrollments";
import {
  FlameIcon,
  CrystalIcon,
} from "@/components/icons/dashboard-icons";
import {
  Calendar,
  ArrowRight,
  Users,
  Trophy,
  Clock,
  CheckCircle,
  PlayCircle,
  BookOpen,
  AlertCircle,
} from "lucide-react";

export default function EnrolledBootcampsPage() {
  const router = useRouter();
  const { ready, authenticated } = usePrivy();
  const { enrollments, loading, error } = useUserEnrollments();

  useEffect(() => {
    if (ready && !authenticated) {
      router.push("/lobby");
    }
  }, [ready, authenticated, router]);

  if (!ready || !authenticated) {
    return null;
  }

  if (loading) {
    return (
      <>
        <Head>
          <title>My Enrolled Bootcamps - P2E Inferno</title>
        </Head>
        <MainLayout>
          <div className="min-h-screen bg-background py-12">
            <div className="container mx-auto px-4">
              <div className="text-center">
                <FlameIcon size={60} className="text-flame-yellow animate-pulse mx-auto mb-4" />
                <h1 className="text-3xl font-bold mb-4">Loading Your Bootcamps...</h1>
                <div className="w-12 h-12 border-4 border-flame-yellow/20 border-t-flame-yellow rounded-full animate-spin mx-auto"></div>
              </div>
            </div>
          </div>
        </MainLayout>
      </>
    );
  }

  if (error) {
    return (
      <>
        <Head>
          <title>My Enrolled Bootcamps - P2E Inferno</title>
        </Head>
        <MainLayout>
          <div className="min-h-screen bg-background py-12">
            <div className="container mx-auto px-4">
              <div className="text-center">
                <AlertCircle size={60} className="text-red-400 mx-auto mb-4" />
                <h1 className="text-3xl font-bold mb-4 text-red-400">Error Loading Bootcamps</h1>
                <p className="text-faded-grey mb-6">{error}</p>
                <Link
                  href="/lobby"
                  className="inline-flex items-center space-x-2 bg-flame-yellow text-black px-6 py-3 rounded-xl font-medium hover:bg-flame-orange transition-all"
                >
                  <span>Back to Lobby</span>
                  <ArrowRight size={18} />
                </Link>
              </div>
            </div>
          </div>
        </MainLayout>
      </>
    );
  }

  const getStatusColor = (status: string) => {
    switch (status) {
      case 'enrolled':
      case 'active':
        return 'text-green-400';
      case 'completed':
        return 'text-blue-400';
      case 'dropped':
        return 'text-red-400';
      case 'suspended':
        return 'text-orange-400';
      default:
        return 'text-faded-grey';
    }
  };

  const getStatusIcon = (status: string) => {
    switch (status) {
      case 'enrolled':
      case 'active':
        return <PlayCircle size={16} className="text-green-400" />;
      case 'completed':
        return <CheckCircle size={16} className="text-blue-400" />;
      case 'dropped':
        return <AlertCircle size={16} className="text-red-400" />;
      case 'suspended':
        return <AlertCircle size={16} className="text-orange-400" />;
      default:
        return <Clock size={16} className="text-faded-grey" />;
    }
  };

  const calculateOverallProgress = (enrollment: any) => {
    if (!enrollment.milestone_progress) return 0;
    const { total_milestones, completed_milestones } = enrollment.milestone_progress;
    return total_milestones > 0 ? Math.round((completed_milestones / total_milestones) * 100) : 0;
  };

  return (
    <>
      <Head>
        <title>My Enrolled Bootcamps - P2E Inferno</title>
        <meta name="description" content="Track your progress in enrolled bootcamp programs" />
      </Head>

      <MainLayout>
        <div className="min-h-screen bg-background py-12">
          <div className="container mx-auto px-4">
            {/* Header */}
            <div className="text-center mb-12">
              <div className="flex justify-center mb-6">
                <FlameIcon size={80} className="text-flame-yellow" />
              </div>
              <h1 className="text-4xl lg:text-5xl font-bold font-heading mb-4">
                My Enrolled Bootcamps
              </h1>
              <p className="text-xl text-faded-grey max-w-2xl mx-auto">
                Continue your infernal journey and complete your bootcamp milestones
              </p>
            </div>

            {/* Content */}
            <div className="max-w-6xl mx-auto">
              {enrollments.length === 0 ? (
                <div className="text-center py-16">
                  <BookOpen size={80} className="text-faded-grey mx-auto mb-6" />
                  <h2 className="text-2xl font-bold mb-4">No Enrolled Bootcamps</h2>
                  <p className="text-faded-grey mb-8 max-w-md mx-auto">
                    You haven&apos;t enrolled in any bootcamps yet. Browse available programs to start your learning journey.
                  </p>
                  <div className="space-x-4">
                    <Link
                      href="/apply"
                      className="inline-flex items-center space-x-2 bg-flame-yellow text-black px-6 py-3 rounded-xl font-medium hover:bg-flame-orange transition-all"
                    >
                      <span>Browse Bootcamps</span>
                      <ArrowRight size={18} />
                    </Link>
                    <Link
                      href="/lobby"
                      className="inline-flex items-center space-x-2 border border-faded-grey/30 text-white px-6 py-3 rounded-xl font-medium hover:border-faded-grey/60 transition-all"
                    >
                      <span>Back to Lobby</span>
                    </Link>
                  </div>
                </div>
              ) : (
                <div className="space-y-6">
                  {enrollments.map((enrollment) => {
                    const overallProgress = calculateOverallProgress(enrollment);
                    const isCompleted = enrollment.enrollment_status === 'completed';
                    const isActive = enrollment.enrollment_status === 'enrolled' || enrollment.enrollment_status === 'active';

                    return (
                      <div
                        key={enrollment.id}
                        className="bg-gradient-to-br from-purple-900/20 to-indigo-900/20 rounded-2xl border border-purple-500/20 overflow-hidden"
                      >
                        {/* Header */}
                        <div className="bg-gradient-to-r from-flame-yellow/10 to-flame-orange/10 p-6 border-b border-purple-500/20">
                          <div className="flex items-center justify-between">
                            <div className="flex items-center space-x-4">
                              <div className="p-3 bg-flame-yellow/20 rounded-xl">
                                <FlameIcon size={40} className="text-flame-yellow" />
                              </div>
                              <div>
                                <h3 className="text-2xl font-bold">
                                  {enrollment.cohort.bootcamp_program.name}
                                </h3>
                                <p className="text-faded-grey">{enrollment.cohort.name}</p>
                              </div>
                            </div>
                            <div className="flex items-center space-x-3">
                              <div className={`flex items-center space-x-2 px-3 py-1 rounded-lg border ${
                                isCompleted ? 'bg-blue-500/10 border-blue-500/20' :
                                isActive ? 'bg-green-500/10 border-green-500/20' : 
                                'bg-gray-500/10 border-gray-500/20'
                              }`}>
                                {getStatusIcon(enrollment.enrollment_status)}
                                <span className={`text-sm font-medium capitalize ${getStatusColor(enrollment.enrollment_status)}`}>
                                  {enrollment.enrollment_status}
                                </span>
                              </div>
                            </div>
                          </div>
                        </div>

                        {/* Content */}
                        <div className="p-6">
                          {/* Progress Section */}
                          <div className="mb-6">
                            <div className="flex justify-between items-center mb-2">
                              <h4 className="font-bold">Overall Progress</h4>
                              <span className="text-sm text-faded-grey">{overallProgress}% Complete</span>
                            </div>
                            <div className="w-full bg-background/30 rounded-full h-3">
                              <div
                                className="bg-gradient-to-r from-flame-yellow to-flame-orange h-3 rounded-full transition-all duration-300"
                                style={{ width: `${overallProgress}%` }}
                              />
                            </div>
                          </div>

                          {/* Stats Grid */}
                          <div className="grid grid-cols-2 lg:grid-cols-4 gap-4 mb-6">
                            <div className="bg-background/30 rounded-xl p-4 text-center">
                              <Calendar size={24} className="text-cyan-400 mx-auto mb-2" />
                              <div className="font-bold">{enrollment.cohort.bootcamp_program.duration_weeks} Weeks</div>
                              <div className="text-xs text-faded-grey">Duration</div>
                            </div>
                            <div className="bg-background/30 rounded-xl p-4 text-center">
                              <Trophy size={24} className="text-cyan-400 mx-auto mb-2" />
                              <div className="font-bold">
                                {enrollment.milestone_progress?.completed_milestones || 0}/{enrollment.milestone_progress?.total_milestones || 0}
                              </div>
                              <div className="text-xs text-faded-grey">Milestones</div>
                            </div>
                            <div className="bg-background/30 rounded-xl p-4 text-center">
                              <CrystalIcon size={24} className="text-cyan-400 mx-auto mb-2" />
                              <div className="font-bold">{enrollment.cohort.bootcamp_program.max_reward_dgt.toLocaleString()} DGT</div>
                              <div className="text-xs text-faded-grey">Max Rewards</div>
                            </div>
                            <div className="bg-background/30 rounded-xl p-4 text-center">
                              <Clock size={24} className="text-cyan-400 mx-auto mb-2" />
                              <div className="font-bold">
                                {new Date(enrollment.cohort.start_date).toLocaleDateString()}
                              </div>
                              <div className="text-xs text-faded-grey">Started</div>
                            </div>
                          </div>

                          {/* Current Milestone */}
                          {enrollment.milestone_progress?.current_milestone && (
                            <div className="bg-flame-yellow/10 border border-flame-yellow/20 rounded-xl p-4 mb-6">
                              <div className="flex items-center justify-between mb-2">
                                <h5 className="font-bold text-flame-yellow">Current Milestone</h5>
                                <span className="text-sm text-flame-yellow">
                                  {Math.round(enrollment.milestone_progress.current_milestone.progress_percentage)}% Complete
                                </span>
                              </div>
                              <p className="text-sm">{enrollment.milestone_progress.current_milestone.name}</p>
                              <div className="w-full bg-flame-yellow/20 rounded-full h-2 mt-2">
                                <div
                                  className="bg-flame-yellow h-2 rounded-full transition-all duration-300"
                                  style={{ width: `${enrollment.milestone_progress.current_milestone.progress_percentage}%` }}
                                />
                              </div>
                            </div>
                          )}

                          {/* Description */}
                          <p className="text-faded-grey mb-6">
                            {enrollment.cohort.bootcamp_program.description}
                          </p>

                          {/* CTA */}
                          <div className="text-center">
                            {isActive ? (
                              <Link
                                href={`/lobby/bootcamps/${enrollment.cohort.id}`}
                                className="inline-flex items-center space-x-3 bg-flame-yellow text-black px-8 py-4 rounded-xl font-bold text-lg hover:bg-flame-orange transition-all duration-300 hover:scale-105"
                              >
                                <span>Continue Learning</span>
                                <ArrowRight size={20} />
                              </Link>
                            ) : isCompleted ? (
                              <Link
                                href={`/lobby/bootcamps/${enrollment.cohort.id}`}
                                className="inline-flex items-center space-x-3 bg-blue-600 text-white px-8 py-4 rounded-xl font-bold text-lg hover:bg-blue-700 transition-all duration-300"
                              >
                                <span>View Certificate</span>
                                <Trophy size={20} />
                              </Link>
                            ) : (
                              <div className="inline-flex items-center space-x-3 bg-gray-600 text-gray-300 px-8 py-4 rounded-xl font-bold text-lg cursor-not-allowed">
                                <span>Bootcamp {enrollment.enrollment_status}</span>
                              </div>
                            )}
                          </div>
                        </div>
                      </div>
                    );
                  })}
                </div>
              )}

              {/* Back to Lobby */}
              <div className="text-center mt-12">
                <Link
                  href="/lobby"
                  className="inline-flex items-center space-x-2 text-faded-grey hover:text-white transition-colors"
                >
                  <span>Back to Lobby</span>
                  <ArrowRight size={18} />
                </Link>
              </div>
            </div>
          </div>
        </div>
      </MainLayout>
    </>
  );
}