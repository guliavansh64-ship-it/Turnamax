"use client";

export default function GlobalError({ reset }: { error: Error; reset: () => void }) {
  return (
    <html lang="en">
      <body style={{ margin: 0, background: "#070a11", color: "#e8ecf4", fontFamily: "system-ui, sans-serif" }}>
        <main style={{ minHeight: "100vh", display: "grid", placeItems: "center", padding: 24 }}>
          <div style={{ maxWidth: 420, textAlign: "center" }}>
            <div style={{ fontSize: 34 }}>⚠</div>
            <h1 style={{ fontSize: 22, margin: "12px 0 8px" }}>The app could not load</h1>
            <p style={{ color: "#96a0b5", fontSize: 14, lineHeight: 1.6 }}>
              A server error occurred while starting this page. Your data is safe. Please reload —
              if the problem continues, contact support.
            </p>
            <button
              onClick={reset}
              style={{
                marginTop: 18,
                padding: "12px 22px",
                borderRadius: 10,
                border: "none",
                background: "#c8f32e",
                color: "#0a0e14",
                fontWeight: 800,
                cursor: "pointer",
              }}
            >
              Reload
            </button>
          </div>
        </main>
      </body>
    </html>
  );
}
