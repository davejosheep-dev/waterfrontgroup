"use client";

export default function GlobalError({ error, retry }: { error: Error & { digest?: string }; retry: () => void }) {
  return (
    <html lang="en">
      <body style={{ margin: 0, background: "#f1efe9", color: "#172321", fontFamily: "system-ui, -apple-system, sans-serif" }}>
        <main style={{ minHeight: "100vh", display: "grid", placeItems: "center", padding: 24 }}>
          <section style={{ width: "min(100%, 500px)", border: "1px solid #e5e1d9", borderRadius: 12, background: "#fff", padding: 32, textAlign: "center" }}>
            <title>Waterfront operations error</title>
            <p style={{ color: "#a94f30", fontSize: 11, fontWeight: 700, letterSpacing: ".14em", textTransform: "uppercase" }}>Application recovery</p>
            <h1 style={{ margin: "8px 0 0", fontSize: 30 }}>Waterfront could not start this view</h1>
            <p style={{ color: "#66716e", lineHeight: 1.6 }}>Reload the application. Reference: {error.digest ?? "not available"}</p>
            <button type="button" onClick={() => retry()} style={{ minHeight: 40, border: 0, borderRadius: 10, background: "#216e68", color: "white", padding: "0 20px", fontWeight: 700 }}>Reload application</button>
          </section>
        </main>
      </body>
    </html>
  );
}
