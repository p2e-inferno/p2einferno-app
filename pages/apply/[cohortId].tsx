import { useState, useEffect } from "react";
import { GetServerSideProps } from "next";
import Head from "next/head";
import { useRouter } from "next/router";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { ProgressSteps } from "@/components/ui/progress-steps";
import { LoadingButton } from "@/components/ui/loading-button";
import { LoadingOverlay } from "@/components/ui/loading-overlay";
import { MainLayout } from "@/components/layouts/MainLayout";
import { infernalSparksProgram } from "@/lib/bootcamp-data";
import { applicationApi, type ApplicationData } from "@/lib/api";
import { useApiCall } from "@/hooks/useApiCall";
import toast from "react-hot-toast";
import {
  User,
  Phone,
  Mail,
  Target,
  MessageCircle,
  ArrowLeft,
  ArrowRight,
  CheckCircle,
  XCircle,
} from "lucide-react";
import { useDashboardDataSimple } from "@/hooks/useDashboardDataSimple";

interface ApplicationPageProps {
  cohortId: string;
}

interface FormData {
  user_name: string;
  user_email: string;
  phone_number: string;
  experience_level: "beginner" | "intermediate" | "advanced";
  motivation: string;
  goals: string[];
}

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

const experienceLevels = [
  {
    value: "beginner" as const,
    label: "Beginner",
    description: "New to Web3 and blockchain technology",
  },
  {
    value: "intermediate" as const,
    label: "Intermediate",
    description: "Some experience with crypto or DeFi",
  },
  {
    value: "advanced" as const,
    label: "Advanced",
    description: "Experienced with Web3 protocols and tools",
  },
];

const goalOptions = [
  "Learn Web3 fundamentals",
  "Earn DG tokens",
  "Join a community",
  "Build a portfolio",
  "Career transition",
  "Skill development",
  "Networking",
  "Cryptocurrency trading",
];

export const getServerSideProps: GetServerSideProps = async ({ params }) => {
  const cohortId = params?.cohortId as string;

  if (cohortId !== "infernal-sparks-cohort-1") {
    return {
      notFound: true,
    };
  }

  return {
    props: {
      cohortId,
    },
  };
};

export default function ApplicationPage({ cohortId }: ApplicationPageProps) {
  const router = useRouter();
  const [currentStep, setCurrentStep] = useState(1);
  const [formData, setFormData] = useState<FormData>({
    user_name: "",
    user_email: "",
    phone_number: "",
    experience_level: "beginner",
    motivation: "",
    goals: [],
  });
  const [isValidating, setIsValidating] = useState(false);
  const [fieldErrors, setFieldErrors] = useState<Record<string, string>>({});

  // New: Get user dashboard data to check for pending application
  const { data: dashboardData, loading: dashboardLoading } =
    useDashboardDataSimple();

  // Check for pending application for this cohort
  let pendingApplication = null;
  if (dashboardData && dashboardData.applications) {
    pendingApplication = dashboardData.applications.find(
      (app) => app.cohort_id === cohortId && app.status === "pending"
    );
  }

  const updateFormData = (field: keyof FormData, value: any) => {
    setFormData((prev) => ({ ...prev, [field]: value }));

    // Clear field error when user starts typing
    if (fieldErrors[field]) {
      setFieldErrors((prev) => ({ ...prev, [field]: "" }));
    }

    // Real-time email validation
    if (field === "user_email" && value) {
      const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
      if (!emailRegex.test(value)) {
        setFieldErrors((prev) => ({
          ...prev,
          [field]: "Please enter a valid email address",
        }));
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
  };

  const validateStep = (step: number): boolean => {
    switch (step) {
      case 1:
        return !!(
          formData.user_name &&
          formData.user_email &&
          formData.phone_number
        );
      case 2:
        return !!formData.experience_level;
      case 3:
        return !!(formData.motivation && formData.goals.length > 0);
      case 4:
        return true;
      default:
        return false;
    }
  };

  const nextStep = async () => {
    if (validateStep(currentStep) && currentStep < 4) {
      setIsValidating(true);

      // Add a small delay to show validation feedback
      await new Promise((resolve) => setTimeout(resolve, 300));

      // Show success feedback for completed step
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

  // Initialize API call hook for application submission
  const { isLoading: isSubmitting, execute: submitApplication } = useApiCall({
    onSuccess: (data) => {
      // Show success message with more details
      toast.success("🎉 Application submitted successfully!", {
        duration: 3000,
      });

      // Small delay before navigation for better UX
      setTimeout(() => {
        router.push(`/payment/${data.applicationId}`);
      }, 1000);
    },
    onError: (error) => {
      // Custom error handling for better user experience
      console.error("Application submission failed:", error);
    },
    showSuccessToast: false, // We handle success toast manually above
    showErrorToast: true,
  });

  const handleSubmitForPayment = async () => {
    // Final validation before submission
    const errors: Record<string, string> = {};

    if (!formData.user_name.trim()) {
      errors.user_name = "Name is required";
    }

    if (!formData.user_email.trim()) {
      errors.user_email = "Email is required";
    } else {
      const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
      if (!emailRegex.test(formData.user_email)) {
        errors.user_email = "Please enter a valid email address";
      }
    }

    if (!formData.phone_number.trim()) {
      errors.phone_number = "Phone number is required";
    }

    if (!formData.motivation.trim()) {
      errors.motivation = "Motivation is required";
    }

    if (formData.goals.length === 0) {
      errors.goals = "Please select at least one goal";
    }

    if (Object.keys(errors).length > 0) {
      setFieldErrors(errors);
      toast.error(
        "Please fix the errors in your application before submitting."
      );
      return;
    }

    try {
      const applicationData: ApplicationData = {
        cohort_id: cohortId,
        user_email: formData.user_email.trim(),
        user_name: formData.user_name.trim(),
        phone_number: formData.phone_number.trim(),
        experience_level: formData.experience_level,
        motivation: formData.motivation.trim(),
        goals: formData.goals,
        payment_method: "fiat", // Default, can be changed on payment page
      };

      await submitApplication(() => applicationApi.submit(applicationData));
    } catch (error) {
      // Error handling is done by the useApiCall hook
      console.error("Application submission failed:", error);
    }
  };

  const renderStep = () => {
    switch (currentStep) {
      case 1:
        return (
          <div className="space-y-6">
            <div className="text-center mb-8">
              <h2 className="text-2xl font-bold mb-2">Personal Information</h2>
              <p className="text-faded-grey">
                Let's start with your basic details
              </p>
            </div>

            <div className="space-y-4">
              <div>
                <label className="block text-sm font-medium mb-2">
                  Full Name
                </label>
                <div className="relative">
                  <User className="absolute left-3 top-3 h-5 w-5 text-faded-grey" />
                  <input
                    type="text"
                    className="w-full pl-10 pr-4 py-3 border border-faded-grey/20 rounded-lg focus:ring-2 focus:ring-flame-yellow focus:border-transparent bg-background"
                    placeholder="Enter your full name"
                    value={formData.user_name}
                    onChange={(e) =>
                      updateFormData("user_name", e.target.value)
                    }
                  />
                </div>
              </div>

              <div>
                <label className="block text-sm font-medium mb-2">
                  Email Address
                </label>
                <div className="relative">
                  <Mail className="absolute left-3 top-3 h-5 w-5 text-faded-grey" />
                  <input
                    type="email"
                    className={`w-full pl-10 pr-4 py-3 border rounded-lg focus:ring-2 focus:border-transparent bg-background ${
                      fieldErrors.user_email
                        ? "border-red-300 focus:ring-red-500"
                        : "border-faded-grey/20 focus:ring-flame-yellow"
                    }`}
                    placeholder="Enter your email address"
                    value={formData.user_email}
                    onChange={(e) =>
                      updateFormData("user_email", e.target.value)
                    }
                  />
                </div>
                {fieldErrors.user_email && (
                  <p className="mt-1 text-sm text-red-600 flex items-center gap-1">
                    <XCircle className="w-4 h-4" />
                    {fieldErrors.user_email}
                  </p>
                )}
              </div>

              <div>
                <label className="block text-sm font-medium mb-2">
                  Phone Number
                </label>
                <div className="relative">
                  <Phone className="absolute left-3 top-3 h-5 w-5 text-faded-grey" />
                  <input
                    type="tel"
                    className="w-full pl-10 pr-4 py-3 border border-faded-grey/20 rounded-lg focus:ring-2 focus:ring-flame-yellow focus:border-transparent bg-background"
                    placeholder="Enter your phone number"
                    value={formData.phone_number}
                    onChange={(e) =>
                      updateFormData("phone_number", e.target.value)
                    }
                  />
                </div>
              </div>
            </div>
          </div>
        );

      case 2:
        return (
          <div className="space-y-6">
            <div className="text-center mb-8">
              <h2 className="text-2xl font-bold mb-2">Experience Level</h2>
              <p className="text-faded-grey">
                Help us tailor the bootcamp to your needs
              </p>
            </div>

            <div className="space-y-4">
              {experienceLevels.map((level) => (
                <button
                  key={level.value}
                  type="button"
                  onClick={() =>
                    updateFormData("experience_level", level.value)
                  }
                  className={`w-full p-6 border rounded-lg text-left transition-colors ${
                    formData.experience_level === level.value
                      ? "border-flame-yellow bg-flame-yellow/10"
                      : "border-faded-grey/20 hover:border-faded-grey/40"
                  }`}
                >
                  <div className="flex items-start gap-4">
                    <div
                      className={`w-4 h-4 rounded-full border-2 mt-1 ${
                        formData.experience_level === level.value
                          ? "border-flame-yellow bg-flame-yellow"
                          : "border-faded-grey/40"
                      }`}
                    ></div>
                    <div>
                      <h3 className="font-bold text-lg">{level.label}</h3>
                      <p className="text-faded-grey text-sm">
                        {level.description}
                      </p>
                    </div>
                  </div>
                </button>
              ))}
            </div>
          </div>
        );

      case 3:
        return (
          <div className="space-y-6">
            <div className="text-center mb-8">
              <h2 className="text-2xl font-bold mb-2">Motivation & Goals</h2>
              <p className="text-faded-grey">Tell us about your Web3 journey</p>
            </div>

            <div className="space-y-6">
              <div>
                <label className="block text-sm font-medium mb-2">
                  Why do you want to join Infernal Sparks?
                </label>
                <div className="relative">
                  <MessageCircle className="absolute left-3 top-3 h-5 w-5 text-faded-grey" />
                  <textarea
                    className="w-full pl-10 pr-4 py-3 border border-faded-grey/20 rounded-lg focus:ring-2 focus:ring-flame-yellow focus:border-transparent bg-background h-32 resize-none"
                    placeholder="Share your motivation for joining this bootcamp..."
                    value={formData.motivation}
                    onChange={(e) =>
                      updateFormData("motivation", e.target.value)
                    }
                  />
                </div>
              </div>

              <div>
                <label className="block text-sm font-medium mb-4">
                  What are your goals? (Select all that apply)
                </label>
                <div className="grid grid-cols-2 gap-3">
                  {goalOptions.map((goal) => (
                    <button
                      key={goal}
                      type="button"
                      onClick={() => handleGoalToggle(goal)}
                      className={`p-3 border rounded-lg text-sm text-left transition-colors ${
                        formData.goals.includes(goal)
                          ? "border-flame-yellow bg-flame-yellow/10 text-flame-yellow"
                          : "border-faded-grey/20 hover:border-faded-grey/40"
                      }`}
                    >
                      {goal}
                    </button>
                  ))}
                </div>
              </div>
            </div>
          </div>
        );

      case 4:
        return (
          <div className="space-y-6">
            <div className="text-center mb-8">
              <h2 className="text-2xl font-bold mb-2">Review Application</h2>
              <p className="text-faded-grey">
                Please review your information before submitting
              </p>
            </div>

            <div className="space-y-6">
              <Card className="p-6 bg-card border-faded-grey/20">
                <h3 className="font-bold mb-4 flex items-center gap-2">
                  <User className="w-5 h-5" />
                  Personal Information
                </h3>
                <div className="space-y-2 text-sm">
                  <p>
                    <span className="text-faded-grey">Name:</span>{" "}
                    {formData.user_name}
                  </p>
                  <p>
                    <span className="text-faded-grey">Email:</span>{" "}
                    {formData.user_email}
                  </p>
                  <p>
                    <span className="text-faded-grey">Phone:</span>{" "}
                    {formData.phone_number}
                  </p>
                </div>
              </Card>

              <Card className="p-6 bg-card border-faded-grey/20">
                <h3 className="font-bold mb-4 flex items-center gap-2">
                  <Target className="w-5 h-5" />
                  Experience & Goals
                </h3>
                <div className="space-y-2 text-sm">
                  <p>
                    <span className="text-faded-grey">Level:</span>{" "}
                    {formData.experience_level}
                  </p>
                  <p>
                    <span className="text-faded-grey">Goals:</span>{" "}
                    {formData.goals.join(", ")}
                  </p>
                  <p>
                    <span className="text-faded-grey">Motivation:</span>{" "}
                    {formData.motivation}
                  </p>
                </div>
              </Card>

              <Card className="p-6 bg-green-50 border-green-200">
                <div className="flex items-start gap-3">
                  <CheckCircle className="w-5 h-5 text-green-600 mt-1" />
                  <div>
                    <h3 className="font-bold text-green-800 mb-2">
                      Application Ready for Submission
                    </h3>
                    <p className="text-sm text-green-700 mb-3">
                      Your application is complete and ready to submit. After
                      clicking "Pay Registration Fee", your application will be
                      saved securely and you'll be redirected to the payment
                      page.
                    </p>
                    <div className="bg-green-100 p-3 rounded-md">
                      <p className="text-xs text-green-800 font-medium">
                        💡 Your spot is only secured after successful payment
                      </p>
                    </div>
                  </div>
                </div>
              </Card>
            </div>
          </div>
        );

      default:
        return null;
    }
  };

  // If user has a pending application, block the form and show CTA
  if (pendingApplication) {
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
            <Button
              asChild
              className="w-full bg-flame-yellow text-black hover:bg-flame-orange font-bold text-lg py-3 rounded-xl"
            >
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
        <title>Apply - {infernalSparksProgram.name} | P2E INFERNO</title>
        <meta
          name="description"
          content="Apply for the Infernal Sparks bootcamp"
        />
        <link rel="icon" href="/favicon.ico" />
      </Head>

      <MainLayout>
        <div className="min-h-screen bg-background py-12">
          <div className="container mx-auto px-4">
            <div className="max-w-4xl mx-auto">
              {/* Header */}
              <div className="text-center mb-12">
                <h1 className="text-4xl font-bold font-heading mb-4">
                  Apply for {infernalSparksProgram.name}
                </h1>
                <p className="text-faded-grey">
                  Join the next generation of Web3 enthusiasts
                </p>
              </div>

              {/* Progress Steps */}
              <div className="mb-12">
                <ProgressSteps
                  steps={applicationSteps}
                  currentStep={currentStep}
                />

                {/* Progress Bar */}
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

              {/* Form Content */}
              <LoadingOverlay
                isLoading={isSubmitting}
                message="Saving your application..."
              >
                <Card className="p-8 bg-card border-faded-grey/20">
                  {renderStep()}

                  {/* Navigation Buttons */}
                  <div className="flex justify-between mt-8 pt-6 border-t border-faded-grey/20">
                    <Button
                      variant="outline"
                      onClick={prevStep}
                      disabled={currentStep === 1}
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
                        disabled={!validateStep(currentStep)}
                        className="flex items-center gap-2 bg-flame-yellow hover:bg-flame-yellow/90 text-black"
                      >
                        Next
                        <ArrowRight className="w-4 h-4" />
                      </LoadingButton>
                    ) : (
                      <LoadingButton
                        onClick={handleSubmitForPayment}
                        loading={isSubmitting}
                        loadingText="Saving Application..."
                        disabled={!validateStep(currentStep)}
                        className="flex items-center gap-2 bg-steel-red hover:bg-steel-red/90 text-white"
                      >
                        Pay Registration Fee
                        <ArrowRight className="w-4 h-4" />
                      </LoadingButton>
                    )}
                  </div>
                </Card>
              </LoadingOverlay>

              {/* Additional Info */}
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
