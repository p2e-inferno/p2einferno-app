import { useRouter } from "next/router";

export default function DeletionStatusPage() {
  const router = useRouter();
  const requestId =
    typeof router.query.id === "string" ? router.query.id : "N/A";

  return (
    <main
      style={{
        minHeight: "100vh",
        display: "grid",
        placeItems: "center",
        padding: "2rem",
        fontFamily: "system-ui, -apple-system, Segoe UI, Roboto, sans-serif",
      }}
    >
      <section style={{ maxWidth: 680, width: "100%" }}>
        <h1 style={{ fontSize: "1.8rem", marginBottom: "0.75rem" }}>
          Data Deletion Request Status
        </h1>
        <p style={{ marginBottom: "1rem", lineHeight: 1.6 }}>
          We received your request. If your account data exists in our systems,
          it will be deleted in line with our privacy policy and applicable
          laws.
        </p>
        <p style={{ marginBottom: 0, fontSize: "0.95rem", color: "#555" }}>
          Confirmation code: <strong>{requestId}</strong>
        </p>
      </section>
    </main>
  );
}
