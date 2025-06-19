import { useState } from "react";
import { GetServerSideProps } from "next";
import Head from "next/head";
import { useRouter } from "next/router";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { MainLayout } from "@/components/layouts/MainLayout";
import { infernalSparksProgram } from "@/lib/bootcamp-data";
import { supabase, type Application } from "@/lib/supabase";
import { PaymentSummary } from "@/components/payment/PaymentSummary";
import dynamic from "next/dynamic";
import { BlockchainPayment } from "@/components/payment/BlockchainPayment";
import {
  formatCurrency,
  getPaymentMethod,
  type Currency,
} from "@/lib/payment-utils";
import { CheckCircle, AlertCircle } from "lucide-react";
import { useDashboardDataSimple } from "@/hooks/useDashboardDataSimple";

// Load the Paystack component only on the client to avoid `window` references
const PaystackPayment = dynamic(
  () =>
    import("@/components/payment/PaystackPayment").then(
      (m) => m.PaystackPayment
    ),
  { ssr: false }
);

interface PaymentPageProps {
  applicationId: string;
  application: Application;
}

export const getServerSideProps: GetServerSideProps = async ({ params }) => {
  const applicationId = params?.applicationId as string;

  if (!applicationId) {
    return {
      notFound: true,
    };
  }

  try {
    // Fetch real application data from database
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

    // Check if payment is already completed
    if (application.payment_status === "completed") {
      return {
        redirect: {
          destination: "/lobby",
          permanent: false,
        },
      };
    }

    return {
      props: {
        applicationId,
        application,
      },
    };
  } catch (error) {
    console.error("Error fetching application:", error);
    return {
      notFound: true,
    };
  }
};

export default function PaymentPage({
  applicationId,
  application,
}: PaymentPageProps) {
  const router = useRouter();
  const [selectedCurrency, setSelectedCurrency] = useState<Currency>("NGN");
  const [discountCode, setDiscountCode] = useState("");
  const [discountApplied, setDiscountApplied] = useState(false);
  const { data: dashboardData } = useDashboardDataSimple();

  const totalAmount =
    selectedCurrency === "NGN"
      ? infernalSparksProgram.cost_naira
      : infernalSparksProgram.cost_usd;

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
  console.log(application);
  console.log(totalAmount);
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
                {/* Application Status */}
                {application.payment_status === "pending" && (
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
                                  ? infernalSparksProgram.cost_naira
                                  : infernalSparksProgram.cost_usd,
                                currency
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
                      bootcampName={infernalSparksProgram.name}
                      discountAmount={discountApplied ? totalAmount * 0.2 : 0}
                    />

                    {/* Payment Component */}
                    {paymentMethod === "paystack" ? (
                      <PaystackPayment
                        applicationId={applicationId}
                        amount={
                          discountApplied ? totalAmount * 0.8 : totalAmount
                        }
                        currency={selectedCurrency}
                        email={application.user_email}
                        walletAddress={dashboardData?.profile?.wallet_address}
                        onSuccess={handlePaymentSuccess}
                      />
                    ) : (
                      <BlockchainPayment
                        applicationId={applicationId}
                        amount={
                          discountApplied ? totalAmount * 0.8 : totalAmount
                        }
                        currency={selectedCurrency}
                        email={application.user_email}
                        onSuccess={handlePaymentSuccess}
                      />
                    )}

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
