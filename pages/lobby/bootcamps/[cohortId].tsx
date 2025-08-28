import React, { useState, useEffect } from "react";
import { useRouter } from "next/router";
import { usePrivy } from "@privy-io/react-auth";
import Head from "next/head";
import Link from "next/link";
import { toast } from "react-hot-toast";
import { LobbyLayout } from "@/components/layouts/lobby-layout";
import TaskSubmissionModal from "@/components/lobby/TaskSubmissionModal";
import { 
  FlameIcon, 
  CrystalIcon 
} from "@/components/icons/dashboard-icons";
import {
  ArrowLeft,
  Trophy,
  Clock,
  CheckCircle,
  PlayCircle,
  Target,
  Zap,
  Star,
  Award,
  Calendar,
  BookOpen
} from "lucide-react";

interface MilestoneTask {
  id: string;
  title: string;
  description: string;
  task_type: string;
  reward_amount: number;
  order_index: number;
  submission_requirements: any;
  validation_criteria: any;
  requires_admin_review: boolean;
}

interface MilestoneWithProgress {
  id: string;
  name: string;
  description: string;
  order_index: number;
  duration_hours: number;
  total_reward: number;
  start_date?: string;
  end_date?: string;
  tasks: MilestoneTask[];
  user_progress?: {
    status: string;
    progress_percentage: number;
    tasks_completed: number;
    total_tasks: number;
    started_at?: string;
    completed_at?: string;
    reward_amount: number;
  };
}

interface CohortMilestonesData {
  cohort: {
    id: string;
    name: string;
    bootcamp_program: {
      name: string;
      description: string;
    };
  };
  milestones: MilestoneWithProgress[];
  overall_progress: {
    completed_milestones: number;
    total_milestones: number;
    overall_percentage: number;
    total_earned_rewards: number;
    max_possible_rewards: number;
  };
}

export default function BootcampLearningPage() {
  const router = useRouter();
  const { cohortId } = router.query;
  const { ready, authenticated, getAccessToken } = usePrivy();
  
  const [data, setData] = useState<CohortMilestonesData | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [selectedMilestone, setSelectedMilestone] = useState<string | null>(null);
  const [selectedTask, setSelectedTask] = useState<MilestoneTask | null>(null);
  const [showSubmissionModal, setShowSubmissionModal] = useState(false);

  const fetchCohortData = async () => {
    try {
      setLoading(true);
      setError(null);

      if (!authenticated || !cohortId) {
        return;
      }

      const token = await getAccessToken();
      if (!token) {
        throw new Error("Authentication required");
      }

      const response = await fetch(`/api/user/cohort/${cohortId}/milestones`, {
        method: "GET",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${token}`,
        },
      });

      if (!response.ok) {
        const errorData = await response.json().catch(() => ({}));
        throw new Error(errorData.error || "Failed to fetch cohort data");
      }

      const result = await response.json();
      setData(result.data);
    } catch (err: any) {
      console.error("Cohort data fetch error:", err);
      setError(err.message);
      toast.error("Failed to load bootcamp data");
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    if (ready && !authenticated) {
      router.push("/lobby");
    }
  }, [ready, authenticated, router]);

  useEffect(() => {
    if (ready && authenticated && cohortId) {
      fetchCohortData();
    }
  }, [ready, authenticated, cohortId]);

  if (!ready || !authenticated) {
    return null;
  }

  if (loading) {
    return (
      <>
        <Head>
          <title>Bootcamp Learning - P2E Inferno</title>
        </Head>
        <LobbyLayout>
          <div className="text-center py-16">
            <FlameIcon size={80} className="text-flame-yellow animate-pulse mx-auto mb-6" />
            <h1 className="text-3xl font-bold mb-4">Loading Bootcamp...</h1>
            <div className="w-12 h-12 border-4 border-flame-yellow/20 border-t-flame-yellow rounded-full animate-spin mx-auto"></div>
          </div>
        </LobbyLayout>
      </>
    );
  }

  if (error) {
    return (
      <>
        <Head>
          <title>Error - P2E Inferno</title>
        </Head>
        <LobbyLayout>
          <div className="text-center py-16">
            <Target size={80} className="text-red-400 mx-auto mb-6" />
            <h1 className="text-3xl font-bold mb-4 text-red-400">Error Loading Bootcamp</h1>
            <p className="text-faded-grey mb-8 max-w-md mx-auto">{error}</p>
            <div className="space-x-4">
              <button
                onClick={() => fetchCohortData()}
                className="inline-flex items-center space-x-2 bg-flame-yellow text-black px-6 py-3 rounded-xl font-medium hover:bg-flame-orange transition-all"
              >
                <span>Retry</span>
              </button>
              <Link
                href="/lobby/bootcamps/enrolled"
                className="inline-flex items-center space-x-2 border border-faded-grey/30 text-white px-6 py-3 rounded-xl font-medium hover:border-faded-grey/60 transition-all"
              >
                <ArrowLeft size={18} />
                <span>Back to Enrollments</span>
              </Link>
            </div>
          </div>
        </LobbyLayout>
      </>
    );
  }

  if (!data) {
    return (
      <>
        <Head>
          <title>Bootcamp Not Found - P2E Inferno</title>
        </Head>
        <LobbyLayout>
          <div className="text-center py-16">
            <BookOpen size={80} className="text-faded-grey mx-auto mb-6" />
            <h1 className="text-3xl font-bold mb-4">Bootcamp Not Found</h1>
            <p className="text-faded-grey mb-8 max-w-md mx-auto">
              The bootcamp you're looking for doesn't exist or you don't have access to it.
            </p>
            <Link
              href="/lobby/bootcamps/enrolled"
              className="inline-flex items-center space-x-2 bg-flame-yellow text-black px-6 py-3 rounded-xl font-medium hover:bg-flame-orange transition-all"
            >
              <ArrowLeft size={18} />
              <span>Back to Enrollments</span>
            </Link>
          </div>
        </LobbyLayout>
      </>
    );
  }

  const getStatusColor = (status: string) => {
    switch (status) {
      case 'completed':
        return 'text-green-400';
      case 'in_progress':
        return 'text-flame-yellow';
      case 'not_started':
        return 'text-faded-grey';
      default:
        return 'text-faded-grey';
    }
  };

  const getStatusIcon = (status: string) => {
    switch (status) {
      case 'completed':
        return <CheckCircle size={20} className="text-green-400" />;
      case 'in_progress':
        return <PlayCircle size={20} className="text-flame-yellow" />;
      case 'not_started':
        return <Clock size={20} className="text-faded-grey" />;
      default:
        return <Clock size={20} className="text-faded-grey" />;
    }
  };

  const handleTaskSubmit = (task: MilestoneTask) => {
    setSelectedTask(task);
    setShowSubmissionModal(true);
  };

  const handleSubmissionSuccess = () => {
    // Refetch data to update progress
    fetchCohortData();
  };

  return (
    <>
      <Head>
        <title>{data.cohort.bootcamp_program.name} - P2E Inferno</title>
        <meta name="description" content={`Complete milestones for ${data.cohort.name}`} />
      </Head>

      <LobbyLayout>
        {/* Header */}
        <div className="mb-8">
          <Link
            href="/lobby/bootcamps/enrolled"
            className="inline-flex items-center space-x-2 text-faded-grey hover:text-white transition-colors mb-6"
          >
            <ArrowLeft size={18} />
            <span>Back to Enrolled Bootcamps</span>
          </Link>

          <div className="flex items-center space-x-4 mb-6">
            <div className="p-3 bg-flame-yellow/20 rounded-xl">
              <FlameIcon size={40} className="text-flame-yellow" />
            </div>
            <div>
              <h1 className="text-4xl font-bold font-heading">
                {data.cohort.bootcamp_program.name}
              </h1>
              <p className="text-xl text-faded-grey">{data.cohort.name}</p>
            </div>
          </div>

          <p className="text-faded-grey max-w-2xl">
            {data.cohort.bootcamp_program.description}
          </p>
        </div>

        {/* Overall Progress */}
        <div className="bg-gradient-to-r from-flame-yellow/10 to-flame-orange/10 rounded-2xl border border-flame-yellow/20 p-6 mb-8">
          <div className="flex items-center justify-between mb-4">
            <h2 className="text-2xl font-bold">Your Progress</h2>
            <div className="flex items-center space-x-4">
              <div className="flex items-center space-x-2">
                <Trophy size={20} className="text-flame-yellow" />
                <span className="font-bold">{data.overall_progress.total_earned_rewards.toLocaleString()} DGT</span>
                <span className="text-faded-grey text-sm">earned</span>
              </div>
              <div className="flex items-center space-x-2">
                <Target size={20} className="text-cyan-400" />
                <span className="font-bold">{data.overall_progress.overall_percentage}%</span>
                <span className="text-faded-grey text-sm">complete</span>
              </div>
            </div>
          </div>

          <div className="grid grid-cols-1 lg:grid-cols-4 gap-6">
            <div className="bg-background/30 rounded-xl p-4 text-center">
              <Award size={24} className="text-cyan-400 mx-auto mb-2" />
              <div className="font-bold">
                {data.overall_progress.completed_milestones}/{data.overall_progress.total_milestones}
              </div>
              <div className="text-xs text-faded-grey">Milestones</div>
            </div>
            <div className="bg-background/30 rounded-xl p-4 text-center">
              <CrystalIcon size={24} className="text-cyan-400 mx-auto mb-2" />
              <div className="font-bold">{data.overall_progress.total_earned_rewards.toLocaleString()}</div>
              <div className="text-xs text-faded-grey">DGT Earned</div>
            </div>
            <div className="bg-background/30 rounded-xl p-4 text-center">
              <Star size={24} className="text-cyan-400 mx-auto mb-2" />
              <div className="font-bold">{data.overall_progress.max_possible_rewards.toLocaleString()}</div>
              <div className="text-xs text-faded-grey">Max Rewards</div>
            </div>
            <div className="bg-background/30 rounded-xl p-4 text-center">
              <Zap size={24} className="text-cyan-400 mx-auto mb-2" />
              <div className="font-bold">{data.overall_progress.overall_percentage}%</div>
              <div className="text-xs text-faded-grey">Complete</div>
            </div>
          </div>

          <div className="mt-6">
            <div className="flex justify-between items-center mb-2">
              <span className="text-sm font-medium">Overall Progress</span>
              <span className="text-sm text-faded-grey">{data.overall_progress.overall_percentage}%</span>
            </div>
            <div className="w-full bg-background/30 rounded-full h-4">
              <div
                className="bg-gradient-to-r from-flame-yellow to-flame-orange h-4 rounded-full transition-all duration-500"
                style={{ width: `${data.overall_progress.overall_percentage}%` }}
              />
            </div>
          </div>
        </div>

        {/* Milestones List */}
        <div className="space-y-6">
          {data.milestones.map((milestone, index) => {
            const isUnlocked = index === 0 || 
              (index > 0 && data.milestones[index - 1]?.user_progress?.status === 'completed');
            const isExpanded = selectedMilestone === milestone.id;
            const status = milestone.user_progress?.status || 'not_started';

            return (
              <div
                key={milestone.id}
                className={`bg-gradient-to-br from-purple-900/20 to-indigo-900/20 rounded-2xl border overflow-hidden transition-all duration-300 ${
                  isUnlocked ? 'border-purple-500/20 hover:border-purple-500/40' : 'border-gray-600/20'
                } ${isExpanded ? 'ring-2 ring-flame-yellow/30' : ''}`}
              >
                {/* Milestone Header */}
                <div 
                  className={`p-6 cursor-pointer transition-all ${
                    isUnlocked ? 'hover:bg-purple-900/10' : 'opacity-60 cursor-not-allowed'
                  }`}
                  onClick={() => isUnlocked && setSelectedMilestone(isExpanded ? null : milestone.id)}
                >
                  <div className="flex items-center justify-between">
                    <div className="flex items-center space-x-4">
                      <div className={`p-3 rounded-xl ${
                        status === 'completed' ? 'bg-green-500/20' :
                        status === 'in_progress' ? 'bg-flame-yellow/20' :
                        'bg-gray-600/20'
                      }`}>
                        {status === 'completed' ? (
                          <CheckCircle size={32} className="text-green-400" />
                        ) : status === 'in_progress' ? (
                          <PlayCircle size={32} className="text-flame-yellow" />
                        ) : isUnlocked ? (
                          <Target size={32} className="text-cyan-400" />
                        ) : (
                          <Clock size={32} className="text-gray-400" />
                        )}
                      </div>
                      <div>
                        <div className="flex items-center space-x-3 mb-1">
                          <h3 className="text-xl font-bold">{milestone.name}</h3>
                          <span className={`px-2 py-1 rounded-lg text-xs font-medium ${
                            status === 'completed' ? 'bg-green-500/20 text-green-400' :
                            status === 'in_progress' ? 'bg-flame-yellow/20 text-flame-yellow' :
                            'bg-gray-600/20 text-gray-400'
                          }`}>
                            {status === 'not_started' ? 'Not Started' : 
                             status === 'in_progress' ? 'In Progress' :
                             status === 'completed' ? 'Completed' : status}
                          </span>
                        </div>
                        <p className="text-faded-grey text-sm">{milestone.description}</p>
                      </div>
                    </div>
                    
                    <div className="text-right">
                      <div className="flex items-center space-x-2 mb-1">
                        <CrystalIcon size={16} className="text-cyan-400" />
                        <span className="font-bold">{milestone.total_reward.toLocaleString()} DGT</span>
                      </div>
                      {milestone.user_progress && (
                        <div className="text-sm text-faded-grey">
                          {milestone.user_progress.tasks_completed}/{milestone.tasks.length} tasks
                        </div>
                      )}
                    </div>
                  </div>

                  {/* Progress Bar */}
                  {milestone.user_progress && (
                    <div className="mt-4">
                      <div className="flex justify-between items-center mb-1">
                        <span className="text-sm">Progress</span>
                        <span className="text-sm text-faded-grey">
                          {Math.round(milestone.user_progress.progress_percentage)}%
                        </span>
                      </div>
                      <div className="w-full bg-background/30 rounded-full h-2">
                        <div
                          className={`h-2 rounded-full transition-all duration-300 ${
                            status === 'completed' ? 'bg-green-400' : 'bg-gradient-to-r from-flame-yellow to-flame-orange'
                          }`}
                          style={{ width: `${milestone.user_progress.progress_percentage}%` }}
                        />
                      </div>
                    </div>
                  )}
                </div>

                {/* Expanded Milestone Content */}
                {isExpanded && isUnlocked && (
                  <div className="border-t border-purple-500/20 p-6 bg-background/10">
                    {/* Milestone Info */}
                    <div className="grid grid-cols-1 lg:grid-cols-3 gap-4 mb-6">
                      <div className="bg-background/20 rounded-lg p-4">
                        <Calendar size={20} className="text-cyan-400 mb-2" />
                        <div className="font-medium">Duration</div>
                        <div className="text-sm text-faded-grey">{milestone.duration_hours} hours</div>
                      </div>
                      <div className="bg-background/20 rounded-lg p-4">
                        <BookOpen size={20} className="text-cyan-400 mb-2" />
                        <div className="font-medium">Tasks</div>
                        <div className="text-sm text-faded-grey">{milestone.tasks.length} tasks</div>
                      </div>
                      <div className="bg-background/20 rounded-lg p-4">
                        <Trophy size={20} className="text-cyan-400 mb-2" />
                        <div className="font-medium">Total Reward</div>
                        <div className="text-sm text-faded-grey">{milestone.total_reward.toLocaleString()} DGT</div>
                      </div>
                    </div>

                    {/* Tasks */}
                    <h4 className="text-lg font-bold mb-4">Milestone Tasks</h4>
                    <div className="space-y-4">
                      {milestone.tasks.map((task) => (
                        <div
                          key={task.id}
                          className="bg-background/20 rounded-lg p-4 border border-gray-600/20"
                        >
                          <div className="flex items-center justify-between">
                            <div>
                              <h5 className="font-medium">{task.title}</h5>
                              <p className="text-sm text-faded-grey mt-1">{task.description}</p>
                              <div className="flex items-center space-x-4 mt-2">
                                <span className="text-xs px-2 py-1 bg-purple-600/20 text-purple-300 rounded">
                                  {task.task_type.replace('_', ' ').replace(/\b\w/g, l => l.toUpperCase())}
                                </span>
                                <div className="flex items-center space-x-1">
                                  <CrystalIcon size={12} className="text-cyan-400" />
                                  <span className="text-sm font-medium">{task.reward_amount} DGT</span>
                                </div>
                              </div>
                            </div>
                            <button 
                              onClick={() => handleTaskSubmit(task)}
                              className="bg-flame-yellow text-black px-4 py-2 rounded-lg font-medium hover:bg-flame-orange transition-all"
                            >
                              Submit
                            </button>
                          </div>
                        </div>
                      ))}
                    </div>
                  </div>
                )}
              </div>
            );
          })}
        </div>

        {/* Empty State */}
        {data.milestones.length === 0 && (
          <div className="text-center py-16">
            <Target size={80} className="text-faded-grey mx-auto mb-6" />
            <h2 className="text-2xl font-bold mb-4">No Milestones Available</h2>
            <p className="text-faded-grey mb-8 max-w-md mx-auto">
              This bootcamp doesn't have any milestones set up yet. Check back later!
            </p>
          </div>
        )}

        {/* Task Submission Modal */}
        {selectedTask && (
          <TaskSubmissionModal
            isOpen={showSubmissionModal}
            onClose={() => {
              setShowSubmissionModal(false);
              setSelectedTask(null);
            }}
            task={selectedTask}
            onSubmissionSuccess={handleSubmissionSuccess}
          />
        )}
      </LobbyLayout>
    </>
  );
}