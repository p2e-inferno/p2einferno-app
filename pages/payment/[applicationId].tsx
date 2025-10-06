import { useState } from "react";
import { GetServerSideProps } from "next";
import Head from "next/head";
import { useRouter } from "next/router";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { MainLayout } from "@/components/layouts/MainLayout";
import { createAdminClient } from "@/lib/supabase/server";
import type {
  Application,
  Cohort,
  BootcampProgram,
} from "@/lib/supabase/types";
import { PaymentSummary } from "@/components/payment/PaymentSummary";
import dynamic from "next/dynamic";
import { BlockchainPayment } from "@/components/payment/BlockchainPayment";
import {
  formatCurrency,
  getPaymentMethod,
  type Currency,
} from "@/lib/utils/payment-utils";
import { CheckCircle, AlertCircle } from "lucide-react";
import { useDashboardData } from "@/hooks/useDashboardData";
import { getLogger } from "@/lib/utils/logger";

const log = getLogger("payment:[applicationId]");

// Load the Paystack component only on the client to avoid `window` references
const PaystackPayment = dynamic(
  () =>
    import("@/components/payment/PaystackPayment").then(
      (m) => m.PaystackPayment,
    ),
  { ssr: false },
);

interface PaymentPageProps {
  applicationId: string;
  application: Application;
  cohort: Cohort;
  bootcamp: BootcampProgram;
  enrolledCohortId?: string | null;
}

export const getServerSideProps: GetServerSideProps = async ({ params }) => {
  const applicationId = params?.applicationId as string;

  if (!applicationId) {
    return {
      notFound: true,
    };
  }

  try {
    // Create admin client for server-side operations
    const supabase = createAdminClient();

    // Fetch application data from database
    const { data: application, error } = await supabase
      .from("applications")
      .select("*")
      .eq("id", applicationId)
      .single();

    if (error || !application) {
      return {
        notFound: true,
      };
    }

    // Fetch cohort details
    const { data: cohort, error: cohortError } = await supabase
      .from("cohorts")
      .select("*")
      .eq("id", application.cohort_id)
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

    // Check if user is already enrolled in this bootcamp
    let enrolledCohortId: string | null = null;
    if ((application as any).user_profile_id) {
      const { data: enrollments } = await supabase
        .from("bootcamp_enrollments")
        .select("id, cohort:cohort_id ( id, bootcamp_program_id )")
        .eq("user_profile_id", (application as any).user_profile_id);

      const match = (enrollments || []).find((en: any) => {
        const c = Array.isArray(en.cohort) ? en.cohort[0] : en.cohort;
        return c?.bootcamp_program_id === bootcamp.id;
      });
      enrolledCohortId = match
        ? (Array.isArray(match.cohort) ? match.cohort[0] : match.cohort)?.id
        : null;
    }

    return {
      props: {
        applicationId,
        application,
        cohort,
        bootcamp,
        enrolledCohortId,
      },
    };
  } catch (error) {
    log.error("Error fetching application data:", error);
    return {
      notFound: true,
    };
  }
};

export default function PaymentPage({
  applicationId,
  application,
  cohort,
  bootcamp,
  enrolledCohortId,
}: PaymentPageProps) {
  const router = useRouter();
  const [selectedCurrency, setSelectedCurrency] = useState<Currency>("NGN");
  const [discountCode, setDiscountCode] = useState("");
  const [discountApplied, setDiscountApplied] = useState(false);
  const { data: dashboardData } = useDashboardData();

  const totalAmount =
    selectedCurrency === "NGN"
      ? cohort.naira_amount || 0
      : cohort.usdt_amount || 0;

  const paymentMethod = getPaymentMethod(selectedCurrency);

  const handlePaymentSuccess = () => {
    router.push("/lobby");
  };

  const applyDiscount = () => {
    // Placeholder for discount logic
    if (discountCode.toLowerCase() === "early20") {
      setDiscountApplied(true);
    }
  };

  const isPaymentCompleted = application.payment_status === "completed";
  const isAlreadyEnrolled = !!enrolledCohortId;

  return (
    <>
      <Head>
        <title>Payment - P2E INFERNO</title>
        <meta
          name="description"
          content="Complete your bootcamp registration"
        />
        <link rel="icon" href="/favicon.ico" />
      </Head>

      <MainLayout>
        <div className="min-h-screen bg-background py-12">
          <div className="container mx-auto px-4">
            <div className="max-w-2xl mx-auto">
              <h1 className="text-4xl font-bold font-heading text-center mb-8">
                Complete Your Payment
              </h1>

              <div className="space-y-6">
                {/* Application/Enrollment Status */}
                {isPaymentCompleted ? (
                  <Card className="p-4 bg-green-50 border-green-200">
                    <div className="flex items-center gap-3">
                      <CheckCircle className="w-5 h-5 text-green-600" />
                      <div>
                        <h3 className="font-bold text-green-800">
                          Payment Completed
                        </h3>
                        <p className="text-sm text-green-700">
                          Your payment has been received. You can continue your
                          learning journey now.
                        </p>
                      </div>
                    </div>
                    <div className="mt-4">
                      <Button
                        className="w-full bg-green-600 hover:bg-green-700 text-white"
                        onClick={() =>
                          router.push(
                            enrolledCohortId
                              ? `/lobby/bootcamps/${enrolledCohortId}`
                              : "/lobby",
                          )
                        }
                      >
                        Continue Learning
                      </Button>
                    </div>
                  </Card>
                ) : (
                  application.payment_status === "pending" && (
                    <Card className="p-4 bg-blue-50 border-blue-200">
                      <div className="flex items-center gap-3">
                        <AlertCircle className="w-5 h-5 text-blue-600" />
                        <div>
                          <h3 className="font-bold text-blue-800">
                            Payment Required
                          </h3>
                          <p className="text-sm text-blue-700">
                            Complete your payment to secure your spot in the
                            bootcamp
                          </p>
                        </div>
                      </div>
                    </Card>
                  )
                )}

                {/* Enrollment guard */}
                {!isPaymentCompleted && isAlreadyEnrolled && (
                  <Card className="p-4 bg-green-50 border-green-200">
                    <div className="flex items-center gap-3">
                      <CheckCircle className="w-5 h-5 text-green-600" />
                      <div>
                        <h3 className="font-bold text-green-800">
                          Already Enrolled
                        </h3>
                        <p className="text-sm text-green-700">
                          You are already enrolled in this bootcamp. No
                          additional payment is required.
                        </p>
                      </div>
                    </div>
                    <div className="mt-4">
                      <Button
                        className="w-full bg-green-600 hover:bg-green-700 text-white"
                        onClick={() =>
                          router.push(`/lobby/bootcamps/${enrolledCohortId}`)
                        }
                      >
                        Continue Learning
                      </Button>
                    </div>
                  </Card>
                )}

                <Card className="p-8 bg-card border-faded-grey/20">
                  <div className="space-y-6">
                    {/* Currency Selection */}
                    <div>
                      <h3 className="text-lg font-bold mb-4">
                        Choose Payment Currency
                      </h3>
                      <div className="grid grid-cols-2 gap-4">
                        {(["NGN", "USD"] as const).map((currency) => (
                          <button
                            key={currency}
                            onClick={() => setSelectedCurrency(currency)}
                            className={`p-4 border rounded-lg text-center transition-colors ${
                              selectedCurrency === currency
                                ? "border-flame-yellow bg-flame-yellow/10 text-flame-yellow"
                                : "border-faded-grey/20 hover:border-faded-grey/40"
                            }`}
                          >
                            <div className="font-bold">
                              {formatCurrency(
                                currency === "NGN"
                                  ? cohort.naira_amount || 0
                                  : cohort.usdt_amount || 0,
                                currency,
                              )}
                            </div>
                            <div className="text-sm text-faded-grey">
                              Pay in {currency}
                            </div>
                            <div className="text-xs text-blue-600 mt-1">
                              {currency === "NGN"
                                ? "via Paystack"
                                : "via Blockchain"}
                            </div>
                          </button>
                        ))}
                      </div>
                    </div>

                    {/* Discount Code */}
                    <div>
                      <h3 className="text-lg font-bold mb-4">Discount Code</h3>
                      <div className="flex gap-3">
                        <input
                          type="text"
                          placeholder="Enter discount code"
                          value={discountCode}
                          onChange={(e) => setDiscountCode(e.target.value)}
                          className="flex-1 px-4 py-2 border border-faded-grey/20 rounded-lg focus:ring-2 focus:ring-flame-yellow focus:border-transparent bg-background"
                        />
                        <Button variant="outline" onClick={applyDiscount}>
                          Apply
                        </Button>
                      </div>
                      {discountApplied && (
                        <p className="text-green-600 text-sm mt-2 flex items-center gap-1">
                          <CheckCircle className="w-4 h-4" />
                          Discount applied successfully!
                        </p>
                      )}
                    </div>

                    {/* Order Summary */}
                    <PaymentSummary
                      amount={totalAmount}
                      currency={selectedCurrency}
                      bootcampName={bootcamp.name}
                      cohortName={cohort.name}
                      discountAmount={discountApplied ? totalAmount * 0.2 : 0}
                    />

                    {/* Payment Component */}
                    {!isPaymentCompleted &&
                      !isAlreadyEnrolled &&
                      (paymentMethod === "paystack" ? (
                        <PaystackPayment
                          applicationId={applicationId}
                          cohortId={application.cohort_id}
                          amount={totalAmount}
                          currency={selectedCurrency}
                          email={application.user_email}
                          walletAddress={dashboardData?.profile?.wallet_address}
                          onSuccess={handlePaymentSuccess}
                        />
                      ) : (
                        <BlockchainPayment
                          applicationId={applicationId}
                          cohortId={application.cohort_id}
                          amount={totalAmount}
                          currency={selectedCurrency}
                          email={application.user_email}
                          lockAddress={cohort.lock_address || ""}
                          onSuccess={handlePaymentSuccess}
                        />
                      ))}

                    <p className="text-center text-sm text-faded-grey">
                      Your spot will be secured once payment is completed
                    </p>
                  </div>
                </Card>
              </div>
            </div>
          </div>
        </div>
      </MainLayout>
    </>
  );
}
