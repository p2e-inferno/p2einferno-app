import { useState } from "react";
import { GetServerSideProps } from "next";
import Head from "next/head";
import { useRouter } from "next/router";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { ProgressSteps } from "@/components/ui/progress-steps";
import { LoadingButton } from "@/components/ui/loading-button";
import { LoadingOverlay } from "@/components/ui/loading-overlay";
import { MainLayout } from "@/components/layouts/MainLayout";
import { supabase } from "@/lib/supabase/client";
import type { BootcampProgram, Cohort } from "@/lib/supabase/types";
import { applicationApi, type ApplicationData } from "@/lib/api";
import { useApiCall } from "@/hooks/useApiCall";
import toast from "react-hot-toast";
import {
  // User, Phone, Mail, Target, MessageCircle, // Icons moved to step components
  ArrowLeft,
  ArrowRight,
  CheckCircle,
} from "lucide-react";
import { useDashboardData } from "@/hooks/useDashboardData";
import { usePrivy } from "@privy-io/react-auth";
import { isRegistrationOpen } from "@/lib/utils/registration-validation";

// Import step components
import PersonalInfoStep from "@/components/apply/steps/PersonalInfoStep";
import ExperienceStep from "@/components/apply/steps/ExperienceStep";
import MotivationStep from "@/components/apply/steps/MotivationStep";
import ReviewStep from "@/components/apply/steps/ReviewStep";

interface ApplicationPageProps {
  cohortId: string;
  cohort: Cohort;
  bootcamp: BootcampProgram;
  registrationStatus: { isOpen: boolean; reason?: string | null; timeRemaining?: string };
}

// FormData remains the single source of truth for the form
interface FormData {
  user_name: string;
  user_email: string;
  phone_number: string;
  experience_level: "beginner" | "intermediate" | "advanced";
  motivation: string;
  goals: string[];
}

// applicationSteps remains here as it's used by ProgressSteps on this page
const applicationSteps = [
  {
    id: "personal",
    title: "Personal Info",
    description: "Basic details",
  },
  {
    id: "experience",
    title: "Experience",
    description: "Your background",
  },
  {
    id: "motivation",
    title: "Motivation",
    description: "Why join us?",
  },
  {
    id: "review",
    title: "Review",
    description: "Confirm details",
  },
];

// experienceLevels and goalOptions were moved to their respective step components.

export const getServerSideProps: GetServerSideProps = async ({ params }) => {
  const cohortId = params?.cohortId as string;

  if (!cohortId) {
    return {
      notFound: true,
    };
  }

  try {
    // Fetch cohort details
    const { data: cohort, error: cohortError } = await supabase
      .from("cohorts")
      .select("*")
      .eq("id", cohortId)
      .single();

    if (cohortError || !cohort) {
      return {
        notFound: true,
      };
    }

    // Fetch bootcamp details
    const { data: bootcamp, error: bootcampError } = await supabase
      .from("bootcamp_programs")
      .select("*")
      .eq("id", cohort.bootcamp_program_id)
      .single();

    if (bootcampError || !bootcamp) {
      return {
        notFound: true,
      };
    }

    // Validate registration status
    const registrationStatus = isRegistrationOpen(cohort);

    return {
      props: {
        cohortId,
        cohort,
        bootcamp,
        registrationStatus,
      },
    };
  } catch (error) {
    console.error("Error fetching cohort/bootcamp data:", error);
    return {
      notFound: true,
    };
  }
};

export default function ApplicationPage({
  cohortId,
  cohort,
  bootcamp,
  registrationStatus,
}: ApplicationPageProps) {
  const router = useRouter();
  const { getAccessToken } = usePrivy();
  const [currentStep, setCurrentStep] = useState(1);
  const [isLoading, setIsLoading] = useState(false);
  const [formData, setFormData] = useState<FormData>({
    user_name: "",
    user_email: "",
    phone_number: "",
    experience_level: "beginner",
    motivation: "",
    goals: [],
  });
  const [isValidating, setIsValidating] = useState(false);
  const [fieldErrors, setFieldErrors] = useState<
    Partial<Record<keyof FormData, string>>
  >({});

  const { data: dashboardData, loading: dashboardLoading } = useDashboardData();

  let pendingApplication = null;
  if (dashboardData && dashboardData.applications) {
    pendingApplication = dashboardData.applications.find(
      (app) => app?.cohort_id === cohortId && app?.payment_status === "pending"
    );
  }

  const updateFormData = (field: keyof FormData, value: any) => {
    setFormData((prev) => ({ ...prev, [field]: value }));
    if (fieldErrors[field]) {
      setFieldErrors((prev) => ({ ...prev, [field]: "" }));
    }
    if (field === "user_email" && value) {
      const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
      if (!emailRegex.test(value)) {
        setFieldErrors((prev) => ({
          ...prev,
          [field]: "Please enter a valid email address",
        }));
      } else {
        // Clear specific email error if it becomes valid
        setFieldErrors((prev) => {
          const newErrors = { ...prev };
          delete newErrors.user_email;
          return newErrors;
        });
      }
    }
  };

  const handleGoalToggle = (goal: string) => {
    setFormData((prev) => ({
      ...prev,
      goals: prev.goals.includes(goal)
        ? prev.goals.filter((g) => g !== goal)
        : [...prev.goals, goal],
    }));
    // Clear goals error when a goal is toggled, if the error was for empty goals
    if (fieldErrors.goals && formData.goals.length >= 0) {
      // Check length before toggle adjustment
      setFieldErrors((prev) => {
        const newErrors = { ...prev };
        delete newErrors.goals;
        return newErrors;
      });
    }
  };

  const validateStep = (step: number): boolean => {
    // Basic validation, can be expanded or made more specific if needed
    // For now, this matches the original logic.
    // More granular validation might be handled within step components or by a validation library.
    switch (step) {
      case 1:
        return !!(
          formData.user_name &&
          formData.user_email &&
          !fieldErrors.user_email && // Ensure no active email format error
          formData.phone_number
        );
      case 2:
        return !!formData.experience_level;
      case 3:
        return !!(formData.motivation && formData.goals.length > 0);
      case 4: // Review step is always "valid" to proceed to submit button
        return true;
      default:
        return false;
    }
  };

  const nextStep = async () => {
    if (validateStep(currentStep) && currentStep < 4) {
      setIsValidating(true);
      await new Promise((resolve) => setTimeout(resolve, 300));
      toast.success(`Step ${currentStep} completed!`, {
        duration: 2000,
        icon: "✅",
      });
      setCurrentStep((prev) => prev + 1);
      setIsValidating(false);
    }
  };

  const prevStep = () => {
    if (currentStep > 1) {
      setCurrentStep((prev) => prev - 1);
    }
  };

  const { isLoading: isSubmitting, execute: submitApplication } = useApiCall({
    onSuccess: (data) => {
      toast.success("🎉 Application submitted successfully!", {
        duration: 3000,
      });
      router.push(`/payment/${data.applicationId}`);
    },
    onError: (error) => {
      console.error("Application submission failed:", error);
      // Error toast is handled by useApiCall by default if showErrorToast is true
      setIsLoading(false);
    },
    showSuccessToast: false,
    showErrorToast: true,
  });

  const handleSubmitForPayment = async () => {
    const errors: Partial<Record<keyof FormData, string>> = {};
    if (!formData.user_name.trim()) errors.user_name = "Name is required";
    if (!formData.user_email.trim()) {
      errors.user_email = "Email is required";
    } else {
      const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
      if (!emailRegex.test(formData.user_email)) {
        errors.user_email = "Please enter a valid email address";
      }
    }
    if (!formData.phone_number.trim())
      errors.phone_number = "Phone number is required";
    if (!formData.motivation.trim())
      errors.motivation = "Motivation is required";
    if (formData.goals.length === 0)
      errors.goals = "Please select at least one goal";

    if (Object.keys(errors).length > 0) {
      setFieldErrors(errors);
      toast.error(
        "Please fix the errors in your application before submitting."
      );
      // Try to navigate to the first step with an error
      if (errors.user_name || errors.user_email || errors.phone_number)
        setCurrentStep(1);
      else if (errors.motivation || errors.goals) setCurrentStep(3);
      return;
    }
    setFieldErrors({}); // Clear errors if all good

    try {
      const applicationData: ApplicationData = {
        cohort_id: cohortId,
        user_email: formData.user_email.trim(),
        user_name: formData.user_name.trim(),
        phone_number: formData.phone_number.trim(),
        experience_level: formData.experience_level,
        motivation: formData.motivation.trim(),
        goals: formData.goals,
        payment_method: "fiat",
      };
      setIsLoading(true);
      // Retrieve the Privy access token, if available, to link the application
      let accessToken: string | null | undefined;
      try {
        accessToken = await getAccessToken();
      } catch (err) {
        // If unable to fetch token (e.g., user not logged-in), proceed without it
        console.warn("Unable to fetch Privy access token", err);
      }

      await submitApplication(() =>
        applicationApi.submit(applicationData, accessToken ?? undefined)
      );
    } catch (error) {
      console.error("Application submission failed (catch block):", error);
    }
  };

  const renderStep = () => {
    switch (currentStep) {
      case 1:
        return (
          <PersonalInfoStep
            formData={formData}
            updateFormData={updateFormData}
            fieldErrors={fieldErrors}
          />
        );
      case 2:
        return (
          <ExperienceStep formData={formData} updateFormData={updateFormData} />
        );
      case 3:
        return (
          <MotivationStep
            formData={formData}
            updateFormData={updateFormData}
            handleGoalToggle={handleGoalToggle}
            fieldErrors={fieldErrors}
          />
        );
      case 4:
        return <ReviewStep formData={formData} />;
      default:
        return null;
    }
  };

  // Check if registration is closed
  if (!registrationStatus.isOpen) {
    return (
      <MainLayout>
        <Head>
          <title>Registration Closed - {bootcamp.name} | P2E INFERNO</title>
        </Head>
        <div className="min-h-screen flex flex-col items-center justify-center bg-background py-12">
          <Card className="max-w-2xl w-full p-8 text-center bg-gradient-to-br from-red-900/30 to-orange-900/20 border border-red-500/20">
            <div className="mb-6">
              <div className="w-16 h-16 bg-red-500/20 rounded-full flex items-center justify-center mx-auto mb-4">
                <span className="text-2xl">🔴</span>
              </div>
              <h1 className="text-3xl font-bold mb-2 text-red-400">
                Registration Closed
              </h1>
              <h2 className="text-xl text-faded-grey mb-4">
                {bootcamp.name} - {cohort.name}
              </h2>
            </div>
            
            <div className="bg-red-500/10 border border-red-500/20 rounded-lg p-4 mb-6">
              <p className="text-red-400 font-medium mb-2">
                {registrationStatus.reason}
              </p>
              <div className="text-sm text-faded-grey space-y-1">
                <p>Registration Deadline: {new Date(cohort.registration_deadline).toLocaleDateString()} at {new Date(cohort.registration_deadline).toLocaleTimeString()}</p>
                <p>Available Spots: {cohort.max_participants - cohort.current_participants} of {cohort.max_participants}</p>
                <p>Cohort Status: {cohort.status}</p>
              </div>
            </div>

            <p className="text-faded-grey mb-8">
              Unfortunately, registration for this cohort is no longer available. 
              You can browse other available bootcamps or check back for future cohorts.
            </p>

            <div className="space-y-4">
              <Button 
                onClick={() => router.push('/apply')}
                className="w-full bg-flame-yellow text-black hover:bg-flame-orange font-medium text-lg py-3 rounded-xl"
              >
                Browse Available Bootcamps
              </Button>
              <Button 
                onClick={() => router.back()}
                variant="outline"
                className="w-full border-faded-grey/30 text-white hover:border-faded-grey/60 font-medium text-lg py-3 rounded-xl"
              >
                Go Back
              </Button>
            </div>
          </Card>
        </div>
      </MainLayout>
    );
  }

  if (pendingApplication) {
    // This part remains unchanged
    return (
      <MainLayout>
        <Head>
          <title>Complete Application - P2E Inferno</title>
        </Head>
        <div className="min-h-screen flex flex-col items-center justify-center bg-background py-12">
          <Card className="max-w-lg w-full p-8 text-center bg-gradient-to-br from-yellow-900/30 to-orange-900/20 border border-yellow-500/20">
            <CheckCircle
              size={48}
              className="mx-auto mb-4 text-flame-yellow animate-pulse"
            />
            <h2 className="text-2xl font-bold mb-2 text-flame-yellow">
              You have a pending application
            </h2>
            <p className="text-faded-grey mb-6">
              You already have a pending application for this cohort. Please
              complete your application by making payment to secure your spot.
            </p>
            <Button className="w-full bg-flame-yellow text-black hover:bg-flame-orange font-bold text-lg py-3 rounded-xl">
              <a href={`/payment/${pendingApplication.id}`}>
                Complete Application
              </a>
            </Button>
          </Card>
        </div>
      </MainLayout>
    );
  }

  return (
    <>
      <Head>
        <title>Apply - {bootcamp.name} | P2E INFERNO</title>
        <meta
          name="description"
          content={`Apply for ${bootcamp.name} - ${cohort.name}`}
        />
        <link rel="icon" href="/favicon.ico" />
      </Head>

      <MainLayout>
        <div className="min-h-screen bg-background py-12">
          <div className="container mx-auto px-4">
            <div className="max-w-4xl mx-auto">
              <div className="text-center mb-12">
                <h1 className="text-4xl font-bold font-heading mb-4">
                  Apply for {bootcamp.name}
                </h1>
                <p className="text-faded-grey mb-2">{cohort.name}</p>
                
                {/* Registration Status Banner */}
                {registrationStatus.isOpen && registrationStatus.timeRemaining && (
                  <div className="inline-flex items-center space-x-2 bg-green-500/10 border border-green-500/20 rounded-lg px-4 py-2 mb-4">
                    <span className="text-green-400 text-sm">🟢</span>
                    <span className="text-green-400 text-sm font-medium">
                      Registration Open - {registrationStatus.timeRemaining}
                    </span>
                  </div>
                )}
                
                <p className="text-faded-grey">
                  Join the next generation of Web3 enthusiasts
                </p>
              </div>

              <div className="mb-12">
                <ProgressSteps
                  steps={applicationSteps}
                  currentStep={currentStep}
                />
                <div className="mt-6">
                  <div className="flex justify-between text-sm text-faded-grey mb-2">
                    <span>Progress</span>
                    <span>{Math.round((currentStep / 4) * 100)}% Complete</span>
                  </div>
                  <div className="w-full bg-gray-200 rounded-full h-2">
                    <div
                      className="bg-flame-yellow h-2 rounded-full transition-all duration-500 ease-out"
                      style={{ width: `${(currentStep / 4) * 100}%` }}
                    ></div>
                  </div>
                </div>
              </div>

              <LoadingOverlay
                isLoading={isSubmitting || dashboardLoading} // Consider dashboardLoading for overlay as well
                message={
                  dashboardLoading
                    ? "Checking existing applications..."
                    : "Saving your application..."
                }
              >
                <Card className="p-8 bg-card border-faded-grey/20">
                  {renderStep()} {/* This now calls the new step components */}
                  <div className="flex justify-between mt-8 pt-6 border-t border-faded-grey/20">
                    <Button
                      variant="outline"
                      onClick={prevStep}
                      disabled={
                        currentStep === 1 || isSubmitting || isValidating
                      }
                      className="flex items-center gap-2"
                    >
                      <ArrowLeft className="w-4 h-4" />
                      Previous
                    </Button>

                    {currentStep < 4 ? (
                      <LoadingButton
                        onClick={nextStep}
                        loading={isValidating}
                        loadingText="Validating..."
                        disabled={!validateStep(currentStep) || isSubmitting}
                        className="flex items-center gap-2 bg-flame-yellow hover:bg-flame-yellow/90 text-black"
                      >
                        Next
                        <ArrowRight className="w-4 h-4" />
                      </LoadingButton>
                    ) : (
                      <LoadingButton
                        onClick={handleSubmitForPayment}
                        loading={isSubmitting || isLoading}
                        loadingText="Saving Application..."
                        disabled={!validateStep(currentStep) || isValidating}
                        className="flex items-center gap-2 bg-steel-red hover:bg-steel-red/90 text-white"
                      >
                        Pay Registration Fee
                        <ArrowRight className="w-4 h-4" />
                      </LoadingButton>
                    )}
                  </div>
                </Card>
              </LoadingOverlay>

              <div className="mt-8 text-center text-sm text-faded-grey">
                <p>
                  Need help? Contact us at{" "}
                  <a
                    href="mailto:support@p2einferno.com"
                    className="text-flame-yellow hover:underline"
                  >
                    support@p2einferno.com
                  </a>
                </p>
              </div>
            </div>
          </div>
        </div>
      </MainLayout>
    </>
  );
}
