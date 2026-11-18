import { ImageResponse } from "next/og";

export const runtime = "edge";

export function GET() {
  return new ImageResponse(
    (
      <div
        style={{
          width: "100%",
          height: "100%",
          display: "flex",
          alignItems: "center",
          justifyContent: "center",
          background: "#000000",
          borderRadius: "24px",
        }}
      >
        {/* Amber square "VG" mark */}
        <div
          style={{
            width: 120,
            height: 120,
            background: "#b45309",
            borderRadius: 16,
            display: "flex",
            alignItems: "center",
            justifyContent: "center",
            color: "#ffffff",
            fontSize: 56,
            fontWeight: 700,
            letterSpacing: -2,
          }}
        >
          VG
        </div>
      </div>
    ),
    { width: 192, height: 192 }
  );
}
