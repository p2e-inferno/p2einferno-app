import Head from "next/head";
import Link from "next/link";
import { MainLayout } from "@/components/layouts/MainLayout";
import { PageHeader } from "@/components/ui/PageHeader";

// Update this when the policy content is modified.
const LAST_UPDATED = "February 20, 2026";

function PolicySection({
  title,
  children,
}: {
  title: string;
  children: React.ReactNode;
}) {
  return (
    <section className="bg-card/30 border border-border/50 rounded-2xl p-6 md:p-8">
      <h2 className="text-2xl md:text-3xl font-bold font-heading mb-4 text-flame-yellow">
        {title}
      </h2>
      <div className="space-y-3 text-faded-grey leading-relaxed">
        {children}
      </div>
    </section>
  );
}

export default function PrivacyPolicyPage() {
  return (
    <>
      <Head>
        <title>Privacy Policy | P2E INFERNO</title>
        <meta
          name="description"
          content="Read how P2E INFERNO collects, uses, and protects your data."
        />
      </Head>

      <MainLayout>
        <PageHeader
          title="Privacy Policy"
          description="How we collect, use, and protect your information while you use P2E INFERNO."
        />

        <section className="py-16 md:py-24 bg-background">
          <div className="container mx-auto px-4 max-w-4xl space-y-6">
            <div className="text-sm text-faded-grey">
              Last updated: <span className="text-white">{LAST_UPDATED}</span>
            </div>

            <PolicySection title="1. What We Collect">
              <p>
                We collect the data needed to run the platform: your login
                identity (such as Privy user ID), linked wallet addresses,
                profile details you provide, and your quest activity.
              </p>
              <p>
                Some actions are recorded onchain by design. Public blockchain
                records are not controlled by P2E INFERNO.
              </p>
            </PolicySection>

            <PolicySection title="2. How We Use Your Data">
              <p>We use your data to:</p>
              <ul className="list-disc pl-6 space-y-2">
                <li>authenticate your account and protect access,</li>
                <li>run quests, rewards, and leaderboard features,</li>
                <li>
                  prevent abuse, fraud, and duplicate account exploitation,
                </li>
                <li>improve product performance and support operations.</li>
              </ul>
            </PolicySection>

            <PolicySection title="3. GoodDollar Verification Data">
              <p>
                P2E INFERNO only stores verification status and mapping data
                needed to enforce one-user ownership rules in this app.
              </p>
              <p>
                We rely on onchain verification outcomes and do not store face
                scan images in P2E INFERNO systems.
              </p>
            </PolicySection>

            <PolicySection title="4. Sharing and Service Providers">
              <p>
                We share data only when needed to provide core functionality,
                such as wallet/auth providers, infrastructure, analytics, and
                support tooling.
              </p>
              <p>We do not sell your personal data to third parties.</p>
            </PolicySection>

            <PolicySection title="5. Data Retention">
              <p>
                We keep data only as long as needed for product operations,
                legal obligations, fraud prevention, and security reviews.
              </p>
              <p>
                Onchain records are permanent by nature and cannot be deleted by
                us.
              </p>
            </PolicySection>

            <PolicySection title="6. Your Rights and Requests">
              <p>
                You may request access to or deletion of any personal
                information we may hold by contacting info@p2einferno.com.
              </p>
              <p>
                P2E Inferno is designed to minimize data collection. We do not
                maintain permanent storage of personal data obtained through
                Meta (Facebook or WhatsApp). Messaging interactions are
                processed securely and are not retained beyond operational
                requirements.
              </p>
              <p>
                If you previously interacted with P2E Inferno via Meta services
                and would like to request deletion of any associated data, you
                may contact us directly or use Meta&apos;s data deletion request
                tools. We will honor all valid requests in accordance with
                applicable regulations.
              </p>
              <p>
                Contact:{" "}
                <a
                  href="mailto:info@p2einferno.com"
                  className="text-flame-yellow hover:underline"
                >
                  info@p2einferno.com
                </a>
              </p>
            </PolicySection>

            <PolicySection title="7. Security">
              <p>
                We use practical technical and organizational safeguards to
                protect your data. No system is 100% risk-free, but we
                continuously harden our controls.
              </p>
            </PolicySection>

            <PolicySection title="8. Updates to This Policy">
              <p>
                We may update this page as the product evolves. Material changes
                will be reflected by updating the date at the top of this page.
              </p>
            </PolicySection>

            <div className="pt-2">
              <Link
                href="/"
                className="inline-flex items-center justify-center rounded-md px-6 py-3 bg-flame-yellow text-black hover:bg-flame-yellow/90 font-semibold"
              >
                Back to Home
              </Link>
            </div>
          </div>
        </section>
      </MainLayout>
    </>
  );
}
