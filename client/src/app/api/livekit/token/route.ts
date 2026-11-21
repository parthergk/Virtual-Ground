import { NextResponse } from "next/server";
import { AccessToken } from "livekit-server-sdk";
import { ACCESS_CODES } from "@/config/characters";

export async function POST(req: Request) {
  try {
    const body = await req.json();
    const rawCode = String(body.code || "").trim().toUpperCase();

    if (!rawCode) {
      return NextResponse.json(
        { error: "Access code is required to generate a voice token." },
        { status: 400 }
      );
    }

    // Authenticate access code
    const entry = ACCESS_CODES[rawCode];
    if (!entry) {
      return NextResponse.json(
        { error: "Unauthorized access code." },
        { status: 401 }
      );
    }

    const apiKey = process.env.LIVEKIT_API_KEY;
    const apiSecret = process.env.LIVEKIT_API_SECRET;
    const livekitUrl = process.env.LIVEKIT_URL || process.env.NEXT_PUBLIC_LIVEKIT_URL;

    if (!apiKey || !apiSecret || !livekitUrl) {
      console.warn(
        "[LiveKit Token] Missing LIVEKIT_API_KEY, LIVEKIT_API_SECRET, or LIVEKIT_URL environment variables."
      );
      return NextResponse.json(
        {
          configured: false,
          error: "LiveKit server credentials are not configured on this environment.",
        },
        { status: 503 }
      );
    }

    // Derive identity authoritatively from authenticated code
    const participantIdentity = entry.code;
    const participantName = entry.character.name;
    const roomName = "ramlila-ground";

    const at = new AccessToken(apiKey, apiSecret, {
      identity: participantIdentity,
      name: participantName,
      ttl: "24h",
    });

    at.addGrant({
      roomJoin: true,
      room: roomName,
      canPublish: true,
      canSubscribe: true,
      canPublishData: true,
    });

    const token = await at.toJwt();

    return NextResponse.json({
      configured: true,
      token,
      url: livekitUrl,
      room: roomName,
      identity: participantIdentity,
    });
  } catch (error) {
    console.error("[LiveKit Token Error]:", error);
    return NextResponse.json(
      { error: "Internal server error generating voice token." },
      { status: 500 }
    );
  }
}
