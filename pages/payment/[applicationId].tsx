import { useState } from "react";
import { GetServerSideProps } from "next";
import Head from "next/head";
import { useRouter } from "next/router";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { MainLayout } from "@/components/layouts/MainLayout";
import { infernalSparksProgram, formatCurrency } from "@/lib/bootcamp-data";
import { supabase, type Application } from "@/lib/supabase";

interface PaymentPageProps {
  applicationId: string;
  application: Application;
}

export const getServerSideProps: GetServerSideProps = async ({ params }) => {
  const applicationId = params?.applicationId as string;

  // Mock application data for now
  const mockApplication: Application = {
    id: applicationId,
    cohort_id: "infernal-sparks-cohort-1",
    user_email: "user@example.com",
    user_name: "John Doe",
    phone_number: "+1234567890",
    experience_level: "beginner",
    motivation: "I want to learn Web3",
    goals: ["Learn Web3 fundamentals"],
    payment_status: "pending",
    application_status: "draft",
    total_amount: 50,
    currency: "USD",
    payment_method: "fiat",
    created_at: new Date().toISOString(),
    updated_at: new Date().toISOString(),
  };

  return {
    props: {
      applicationId,
      application: mockApplication,
    },
  };
};

export default function PaymentPage({
  applicationId,
  application,
}: PaymentPageProps) {
  const router = useRouter();
  const [paymentMethod, setPaymentMethod] = useState<"fiat" | "crypto">("fiat");
  const [selectedCurrency, setSelectedCurrency] = useState<"USD" | "NGN">(
    application.currency || "USD"
  );
  const [discountCode, setDiscountCode] = useState("");
  const [isProcessing, setIsProcessing] = useState(false);

  const totalAmount =
    selectedCurrency === "NGN"
      ? infernalSparksProgram.cost_naira
      : infernalSparksProgram.cost_usd;

  const processPayment = async () => {
    setIsProcessing(true);

    try {
      // Update application status
      const { error } = await supabase
        .from("applications")
        .update({
          payment_status: "completed",
          application_status: "submitted",
        })
        .eq("id", applicationId);

      if (error) throw error;

      alert("Payment successful! Your spot is now secured.");
      router.push("/lobby");
    } catch (error) {
      console.error("Payment error:", error);
      alert("Payment failed. Please try again.");
    } finally {
      setIsProcessing(false);
    }
  };

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

              <Card className="p-8 bg-card border-faded-grey/20">
                <div className="space-y-6">
                  {/* Currency Selection */}
                  <div>
                    <h3 className="text-lg font-bold mb-4">
                      Choose Payment Currency
                    </h3>
                    <div className="grid grid-cols-2 gap-4">
                      {(["USD", "NGN"] as const).map((currency) => (
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
                        </button>
                      ))}
                    </div>
                  </div>

                  {/* Payment Method Selection */}
                  <div>
                    <h3 className="text-lg font-bold mb-4">Payment Method</h3>
                    <div className="grid grid-cols-2 gap-4">
                      <button
                        onClick={() => setPaymentMethod("fiat")}
                        className={`p-4 border rounded-lg ${
                          paymentMethod === "fiat"
                            ? "border-flame-yellow bg-flame-yellow/10"
                            : "border-faded-grey/20"
                        }`}
                      >
                        <div className="text-center">
                          <h4 className="font-bold">Fiat</h4>
                          <p className="text-sm text-faded-grey">
                            Card/Bank Transfer
                          </p>
                        </div>
                      </button>

                      <button
                        onClick={() => setPaymentMethod("crypto")}
                        className={`p-4 border rounded-lg ${
                          paymentMethod === "crypto"
                            ? "border-flame-yellow bg-flame-yellow/10"
                            : "border-faded-grey/20"
                        }`}
                      >
                        <div className="text-center">
                          <h4 className="font-bold">Crypto</h4>
                          <p className="text-sm text-faded-grey">
                            USDC/ETH/BTC
                          </p>
                        </div>
                      </button>
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
                      <Button variant="outline">Apply</Button>
                    </div>
                  </div>

                  {/* Order Summary */}
                  <div className="bg-background/50 rounded-lg p-4">
                    <h3 className="text-lg font-bold mb-4">Order Summary</h3>
                    <div className="space-y-2">
                      <div className="flex justify-between">
                        <span>Infernal Sparks Bootcamp</span>
                        <span>
                          {formatCurrency(totalAmount, selectedCurrency)}
                        </span>
                      </div>
                      <hr className="border-faded-grey/20" />
                      <div className="flex justify-between font-bold text-lg">
                        <span>Total</span>
                        <span className="text-flame-yellow">
                          {formatCurrency(totalAmount, selectedCurrency)}
                        </span>
                      </div>
                    </div>
                  </div>

                  {/* Payment Button */}
                  <Button
                    onClick={processPayment}
                    disabled={isProcessing}
                    className="w-full bg-steel-red hover:bg-steel-red/90 text-white py-3"
                  >
                    {isProcessing ? "Processing..." : "Complete Payment"}
                  </Button>

                  <p className="text-center text-sm text-faded-grey">
                    Your spot will be secured once payment is completed
                  </p>
                </div>
              </Card>
            </div>
          </div>
        </div>
      </MainLayout>
    </>
  );
}
