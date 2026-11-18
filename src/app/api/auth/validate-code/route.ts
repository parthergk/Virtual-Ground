import { NextResponse } from "next/server";
import { ACCESS_CODES } from "@/config/characters";

export async function POST(req: Request) {
  try {
    const body = await req.json();
    const rawCode = String(body.code || "").trim().toUpperCase();

    if (!rawCode) {
      return NextResponse.json(
        { valid: false, message: "Please enter your personal access code." },
        { status: 400 }
      );
    }

    const entry = ACCESS_CODES[rawCode];

    if (!entry) {
      return NextResponse.json(
        {
          valid: false,
          message: "Invalid access code. Please check your assigned code and try again.",
        },
        { status: 401 }
      );
    }

    return NextResponse.json({
      valid: true,
      code: entry.code,
      character: entry.character,
      assignedTo: entry.assignedTo,
    });
  } catch (error) {
    console.error("Access code validation error:", error);
    return NextResponse.json(
      { valid: false, message: "Server error validating code. Please try again." },
      { status: 500 }
    );
  }
}
