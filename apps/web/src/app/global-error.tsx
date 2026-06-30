"use client";

/**
 * Top-level error boundary. Catches errors thrown in the root layout itself
 * (where the section-level error.tsx can't help). Next.js requires it to render
 * its own <html>/<body>. Keeps the app from showing a blank white screen.
 */
export default function GlobalError({
  error,
  reset,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  return (
    <html lang="en">
      <body
        style={{
          margin: 0,
          minHeight: "100vh",
          display: "flex",
          alignItems: "center",
          justifyContent: "center",
          fontFamily: "system-ui, sans-serif",
          background: "#0b0b0f",
          color: "#e5e7eb",
        }}
      >
        <div style={{ maxWidth: 480, padding: 24, textAlign: "center" }}>
          <h1 style={{ fontSize: 20, fontWeight: 600 }}>
            An unexpected error occurred
          </h1>
          <p style={{ marginTop: 8, fontSize: 14, opacity: 0.7 }}>
            The application ran into a problem. You can try again.
          </p>
          {error.digest && (
            <p style={{ marginTop: 8, fontSize: 12, opacity: 0.4 }}>
              Ref: {error.digest}
            </p>
          )}
          <button
            type="button"
            onClick={() => reset()}
            style={{
              marginTop: 16,
              padding: "8px 16px",
              borderRadius: 8,
              border: "1px solid #374151",
              background: "#111827",
              color: "#e5e7eb",
              cursor: "pointer",
            }}
          >
            Try again
          </button>
        </div>
      </body>
    </html>
  );
}
