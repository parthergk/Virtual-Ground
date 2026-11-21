import fs from "node:fs";
import path from "node:path";
import { AccessToken, TokenVerifier } from "livekit-server-sdk";

// Read .env.local or .env
function loadEnv() {
  const envPath = fs.existsSync(path.resolve(__dirname, "../.env.local"))
    ? path.resolve(__dirname, "../.env.local")
    : path.resolve(__dirname, "../.env");

  if (fs.existsSync(envPath)) {
    const lines = fs.readFileSync(envPath, "utf-8").split("\n");
    for (const line of lines) {
      const trimmed = line.trim();
      if (!trimmed || trimmed.startsWith("#")) continue;
      const eqIdx = trimmed.indexOf("=");
      if (eqIdx !== -1) {
        const key = trimmed.substring(0, eqIdx).trim();
        const val = trimmed.substring(eqIdx + 1).trim();
        if (!process.env[key]) {
          process.env[key] = val;
        }
      }
    }
  }
}

loadEnv();

function calculateProximityGain(distance: number): number {
  const fullVolumeDist = 150;
  const fadeDist = 350;
  const quietDist = 500;

  if (distance <= fullVolumeDist) {
    return 1.0;
  }
  if (distance <= fadeDist) {
    const t = (distance - fullVolumeDist) / (fadeDist - fullVolumeDist);
    return 1.0 - t * 0.7; // 1.0 down to 0.3
  }
  if (distance <= quietDist) {
    const t = (distance - fadeDist) / (quietDist - fadeDist);
    return 0.3 - t * 0.25; // 0.3 down to 0.05
  }
  return 0.0;
}

async function verifyVoice() {
  console.log("=== STARTING LIVEKIT VOICE & PROXIMITY VERIFICATION ===");

  const apiKey = process.env.LIVEKIT_API_KEY;
  const apiSecret = process.env.LIVEKIT_API_SECRET;
  const livekitUrl = process.env.LIVEKIT_URL || process.env.NEXT_PUBLIC_LIVEKIT_URL;

  console.log(`LiveKit URL: ${livekitUrl}`);
  console.log(`API Key present: ${Boolean(apiKey)} (Length: ${apiKey?.length || 0})`);
  console.log(`API Secret present: ${Boolean(apiSecret)} (Length: ${apiSecret?.length || 0})`);

  if (!apiKey || !apiSecret || !livekitUrl) {
    throw new Error("Missing LiveKit credentials in .env/.env.local!");
  }

  // 1. Generate Token for GROUND-01 (Aarav)
  console.log("\n[Test 1] Generating LiveKit token for GROUND-01 (Aarav)...");
  const at1 = new AccessToken(apiKey, apiSecret, {
    identity: "GROUND-01",
    name: "Aarav",
    ttl: "24h",
  });
  at1.addGrant({
    roomJoin: true,
    room: "ramlila-ground",
    canPublish: true,
    canSubscribe: true,
  });
  const token1 = await at1.toJwt();
  console.log(`✓ Token 1 generated successfully! (Length: ${token1.length})`);

  // 2. Generate Token for GROUND-02 (Kabir)
  console.log("\n[Test 2] Generating LiveKit token for GROUND-02 (Kabir)...");
  const at2 = new AccessToken(apiKey, apiSecret, {
    identity: "GROUND-02",
    name: "Kabir",
    ttl: "24h",
  });
  at2.addGrant({
    roomJoin: true,
    room: "ramlila-ground",
    canPublish: true,
    canSubscribe: true,
  });
  const token2 = await at2.toJwt();
  console.log(`✓ Token 2 generated successfully! (Length: ${token2.length})`);

  // 3. Verify Token Claims with TokenVerifier
  console.log("\n[Test 3] Verifying Token Claims...");
  const verifier = new TokenVerifier(apiKey, apiSecret);
  const claims1 = await verifier.verify(token1);
  console.log(`✓ Token 1 Claims: Identity=${claims1.sub}, Room=${claims1.video?.room}, CanPublish=${claims1.video?.canPublish}, CanSubscribe=${claims1.video?.canSubscribe}`);
  if (claims1.sub !== "GROUND-01" || claims1.video?.room !== "ramlila-ground") {
    throw new Error("Token 1 claim mismatch!");
  }

  const claims2 = await verifier.verify(token2);
  console.log(`✓ Token 2 Claims: Identity=${claims2.sub}, Room=${claims2.video?.room}, CanPublish=${claims2.video?.canPublish}, CanSubscribe=${claims2.video?.canSubscribe}`);
  if (claims2.sub !== "GROUND-02" || claims2.video?.room !== "ramlila-ground") {
    throw new Error("Token 2 claim mismatch!");
  }

  // 4. Verify Proximity Attenuation Curve Math
  console.log("\n[Test 4] Verifying Proximity Audio Rolloff Calculations...");
  const testCases = [
    { dist: 0, expected: 1.0, label: "0px (Exact same tile)" },
    { dist: 50, expected: 1.0, label: "50px (Very close, full volume)" },
    { dist: 150, expected: 1.0, label: "150px (Threshold for full volume)" },
    { dist: 250, expected: 0.65, label: "250px (Mid-fade distance)" },
    { dist: 350, expected: 0.30, label: "350px (Threshold for quiet)" },
    { dist: 425, expected: 0.175, label: "425px (Very quiet zone)" },
    { dist: 500, expected: 0.05, label: "500px (Boundary before mute)" },
    { dist: 501, expected: 0.00, label: "501px (Beyond 500px -> Muted)" },
    { dist: 800, expected: 0.00, label: "800px (Opposite side of map -> Muted)" },
  ];

  for (const tc of testCases) {
    const gain = calculateProximityGain(tc.dist);
    const pass = Math.abs(gain - tc.expected) < 0.001;
    if (!pass) {
      throw new Error(`Proximity math failed for ${tc.label}: expected ${tc.expected}, got ${gain}`);
    }
    console.log(`  ✓ ${tc.label.padEnd(40)} -> Gain: ${gain.toFixed(3)} [PASS]`);
  }

  console.log("\n=======================================================");
  console.log("ALL LIVEKIT VOICE & PROXIMITY VERIFICATIONS PASSED!");
  console.log("=======================================================");
}

verifyVoice().catch((err) => {
  console.error("Voice verification failed:", err);
  process.exit(1);
});
