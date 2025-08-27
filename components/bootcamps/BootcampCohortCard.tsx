import React, { useState } from "react";
import Link from "next/link";
import {
  FlameIcon,
  CrystalIcon,
} from "@/components/icons/dashboard-icons";
import {
  Users,
  Calendar,
  ArrowRight,
  ChevronDown,
  ChevronUp,
} from "lucide-react";
import { getCohortRegistrationStatus } from "@/lib/utils/registration-validation";
import type { BootcampWithCohorts } from "@/lib/supabase/types";

// Extended cohort type with enrollment information
interface CohortWithEnrollment {
  id: string;
  bootcamp_program_id: string;
  name: string;
  start_date: string;
  end_date: string;
  max_participants: number;
  current_participants: number;
  registration_deadline: string;
  status: "open" | "closed" | "upcoming";
  usdt_amount?: number;
  naira_amount?: number;
  is_enrolled?: boolean;
  user_enrollment_id?: string;
  created_at: string;
  updated_at: string;
}

interface BootcampWithCohortsEnrollment extends Omit<BootcampWithCohorts, 'cohorts'> {
  cohorts: CohortWithEnrollment[];
}

interface BootcampCohortCardProps {
  bootcamp: BootcampWithCohortsEnrollment;
  getPendingApplication: (cohortId: string) => any;
  defaultExpanded?: boolean;
}

interface CohortStatusInfo {
  statusText: string;
  statusColor: 'green' | 'blue' | 'red';
  statusIcon: string;
  spotsRemaining: number;
  isOpen: boolean;
  reason?: string;
  timeRemaining?: string;
  isDeadlinePassed: boolean;
  isFull: boolean;
  isRegistrationOpen: boolean;
  pendingApplication?: any;
}

export function BootcampCohortCard({ 
  bootcamp, 
  getPendingApplication,
  defaultExpanded = false 
}: BootcampCohortCardProps) {
  const [isExpanded, setIsExpanded] = useState(defaultExpanded);

  // Filter available cohorts
  const availableCohorts = bootcamp.cohorts.filter(cohort => 
    cohort.status === 'open' || cohort.status === 'upcoming' || cohort.is_enrolled
  );

  // Get cohort status display info
  const getCohortStatusInfo = (cohort: CohortWithEnrollment): CohortStatusInfo => {
    const registrationStatus = getCohortRegistrationStatus(cohort, cohort.is_enrolled || false);
    const pendingApplication = getPendingApplication(cohort.id);
    
    return {
      ...registrationStatus,
      isRegistrationOpen: registrationStatus.isOpen,
      pendingApplication,
    };
  };

  return (
    <div className="bg-gradient-to-br from-purple-900/20 to-indigo-900/20 rounded-2xl border border-purple-500/20 overflow-hidden">
      {/* Bootcamp Header */}
      <div className="bg-gradient-to-r from-flame-yellow/10 to-flame-orange/10 p-6 border-b border-purple-500/20">
        <div className="flex items-center justify-between">
          <div className="flex items-center space-x-4">
            <div className="p-3 bg-flame-yellow/20 rounded-xl">
              <FlameIcon size={40} className="text-flame-yellow" />
            </div>
            <div>
              <h3 className="text-2xl font-bold">{bootcamp.name}</h3>
              <p className="text-faded-grey">{bootcamp.description}</p>
            </div>
          </div>
          
          {/* Cohort Count Badge */}
          <div className="bg-background/30 rounded-xl px-4 py-2 text-center">
            <div className="font-bold">{availableCohorts.length}</div>
            <div className="text-xs text-faded-grey">Available</div>
          </div>
        </div>
      </div>

      {/* Bootcamp Stats */}
      <div className="p-6 border-b border-purple-500/20">
        <div className="grid grid-cols-3 gap-4">
          <div className="bg-background/30 rounded-xl p-4 text-center">
            <Calendar size={24} className="text-cyan-400 mx-auto mb-2" />
            <div className="font-bold">{bootcamp.duration_weeks} Weeks</div>
            <div className="text-xs text-faded-grey">Duration</div>
          </div>
          <div className="bg-background/30 rounded-xl p-4 text-center">
            <CrystalIcon size={24} className="text-cyan-400 mx-auto mb-2" />
            <div className="font-bold">{bootcamp.max_reward_dgt.toLocaleString()} DGT</div>
            <div className="text-xs text-faded-grey">Max Rewards</div>
          </div>
          <div className="bg-background/30 rounded-xl p-4 text-center">
            <Users size={24} className="text-cyan-400 mx-auto mb-2" />
            <div className="font-bold">{bootcamp.cohorts.length}</div>
            <div className="text-xs text-faded-grey">Total Cohorts</div>
          </div>
        </div>
      </div>

      {/* Cohorts Section */}
      <div className="p-6">
        {availableCohorts.length === 0 ? (
          <div className="text-center py-8 border-2 border-dashed border-faded-grey/30 rounded-lg">
            <p className="text-faded-grey">No cohorts available for this bootcamp yet.</p>
          </div>
        ) : (
          <>
            <button
              onClick={() => setIsExpanded(!isExpanded)}
              className="w-full flex items-center justify-between p-4 bg-background/30 rounded-xl border border-purple-500/20 hover:border-purple-500/40 transition-colors"
            >
              <div className="flex items-center space-x-3">
                <h4 className="text-xl font-bold">Select Cohort</h4>
                <span className="text-sm text-faded-grey">({availableCohorts.length} available)</span>
              </div>
              {isExpanded ? (
                <ChevronUp size={20} className="text-faded-grey" />
              ) : (
                <ChevronDown size={20} className="text-faded-grey" />
              )}
            </button>

            {isExpanded && (
              <div className="mt-4 space-y-3">
                {availableCohorts.map((cohort) => {
                  const statusInfo = getCohortStatusInfo(cohort);
                  
                  return (
                    <div key={cohort.id} className="border border-faded-grey/20 rounded-xl p-4 bg-background/20">
                      <div className="flex justify-between items-start mb-3">
                        <div>
                          <h5 className="font-bold text-lg flex items-center space-x-2">
                            <span>{cohort.name}</span>
                            {cohort.is_enrolled && (
                              <span className="bg-green-500/20 text-green-400 text-xs px-2 py-1 rounded-full">
                                Enrolled
                              </span>
                            )}
                          </h5>
                          <p className="text-sm text-faded-grey">
                            {new Date(cohort.start_date).toLocaleDateString()} - {new Date(cohort.end_date).toLocaleDateString()}
                          </p>
                        </div>
                        
                        <div className={`flex items-center space-x-2 px-3 py-1 rounded-lg border text-sm font-medium ${
                          statusInfo.statusColor === 'green' ? 'bg-green-500/10 border-green-500/20 text-green-400' :
                          statusInfo.statusColor === 'blue' ? 'bg-blue-500/10 border-blue-500/20 text-blue-400' :
                          'bg-red-500/10 border-red-500/20 text-red-400'
                        }`}>
                          <span>{statusInfo.statusIcon}</span>
                          <span>{statusInfo.statusText}</span>
                        </div>
                      </div>

                      {/* Cohort Quick Stats */}
                      <div className="grid grid-cols-2 gap-4 mb-4">
                        <div className="bg-background/40 rounded-lg p-3 text-center">
                          <div className="font-bold text-lg">{statusInfo.spotsRemaining}</div>
                          <div className="text-xs text-faded-grey">Spots Left</div>
                        </div>
                        <div className="bg-background/40 rounded-lg p-3 text-center">
                          <div className="font-bold text-lg">₦{cohort.naira_amount?.toLocaleString() || 'TBD'}</div>
                          <div className="text-xs text-faded-grey">Cost (NGN)</div>
                        </div>
                      </div>

                      {/* CTA Button */}
                      <div className="text-center">
                        {cohort.is_enrolled ? (
                          <Link
                            href={`/lobby/bootcamps/${cohort.id}`}
                            className="inline-flex items-center space-x-2 bg-green-600 text-white px-4 py-2 rounded-lg font-medium hover:bg-green-700 transition-all text-sm"
                          >
                            <span>Enter Bootcamp</span>
                            <ArrowRight size={16} />
                          </Link>
                        ) : statusInfo.isRegistrationOpen ? (
                          statusInfo.pendingApplication ? (
                            <Link
                              href={`/payment/${statusInfo.pendingApplication.id}`}
                              className="inline-flex items-center space-x-2 bg-orange-600 text-white px-4 py-2 rounded-lg font-medium hover:bg-orange-700 transition-all text-sm"
                            >
                              <span>Complete Payment</span>
                              <ArrowRight size={16} />
                            </Link>
                          ) : (
                            <Link
                              href={`/apply/${cohort.id}`}
                              className="inline-flex items-center space-x-2 bg-flame-yellow text-black px-4 py-2 rounded-lg font-medium hover:bg-flame-orange transition-all text-sm"
                            >
                              <span>Apply Now</span>
                              <ArrowRight size={16} />
                            </Link>
                          )
                        ) : (
                          <div className="inline-flex items-center space-x-2 bg-gray-600 text-gray-300 px-4 py-2 rounded-lg font-medium cursor-not-allowed text-sm">
                            <span>
                              {cohort.status === "upcoming" ? "Coming Soon" : "Registration Closed"}
                            </span>
                          </div>
                        )}
                      </div>
                    </div>
                  );
                })}
              </div>
            )}
          </>
        )}
      </div>
    </div>
  );
}