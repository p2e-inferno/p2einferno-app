import Head from "next/head";
import { useRouter } from "next/router";

export default function DeletionStatusPage() {
  const router = useRouter();
  const requestId =
    typeof router.query.id === "string" ? router.query.id : "N/A";

  return (
    <>
      <Head>
        <title>Deletion Status - Request {requestId}</title>
      </Head>
      <main className="min-h-screen grid place-items-center p-8 font-sans">
        <section className="max-w-xl w-full">
          <h1 className="text-2xl mb-3">Data Deletion Request Status</h1>
          <p className="mb-4 leading-relaxed">
            We received your request. If your account data exists in our
            systems, it will be deleted in line with our privacy policy and
            applicable laws.
          </p>
          <p className="mb-4 leading-relaxed text-sm text-gray-600">
            This page is a receipt confirmation and does not provide live
            request-tracking status.
          </p>
          <p className="mb-0 text-sm text-gray-600">
            Confirmation code:{" "}
            <span className="font-semibold">{requestId}</span>
          </p>
        </section>
      </main>
    </>
  );
}
