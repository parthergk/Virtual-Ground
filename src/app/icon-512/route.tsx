import { ImageResponse } from "next/og";

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
          borderRadius: "64px",
        }}
      >
        {/* Amber square "VG" mark */}
        <div
          style={{
            width: 320,
            height: 320,
            background: "#b45309",
            borderRadius: 48,
            display: "flex",
            alignItems: "center",
            justifyContent: "center",
            color: "#ffffff",
            fontSize: 148,
            fontWeight: 700,
            letterSpacing: -6,
          }}
        >
          VG
        </div>
      </div>
    ),
    { width: 512, height: 512 }
  );
}
