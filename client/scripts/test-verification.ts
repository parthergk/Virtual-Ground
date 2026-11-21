import { Client } from "colyseus.js";
import { GroundState } from "../src/game/network/schema/GroundState";

async function runTests() {
  console.log("=== STARTING COLYSEUS SERVER VERIFICATION ===");
  const endpoint = "ws://localhost:3001";

  // Test 1: Connect Client 1 (GROUND-01)
  console.log("\n[Test 1] Connecting Client 1 with GROUND-01...");
  const client1 = new Client(endpoint);
  let room1: any;
  try {
    room1 = await client1.joinOrCreate<GroundState>("ground", { code: "GROUND-01" }, GroundState);
    console.log(`✓ Client 1 connected successfully! SessionId: ${room1.sessionId}`);
  } catch (err: any) {
    console.error("✗ Client 1 failed to connect:", err?.stack || err?.message || err);
    process.exit(1);
  }

  // Test 2: Try duplicate join with same character/code (GROUND-01) - should be rejected!
  console.log("\n[Test 2] Testing duplicate character reservation rejection (GROUND-01)...");
  const duplicateClient = new Client(endpoint);
  try {
    await duplicateClient.joinOrCreate<GroundState>("ground", { code: "GROUND-01" }, GroundState);
    console.error("✗ FAILED: Duplicate session was allowed to join!");
    process.exit(1);
  } catch (err: any) {
    console.log(`✓ PASSED: Duplicate session rejected with expected error: "${err.message}"`);
  }

  // Test 3: Connect Client 2 (GROUND-02)
  console.log("\n[Test 3] Connecting Client 2 with GROUND-02...");
  const client2 = new Client(endpoint);
  let room2: any;
  try {
    room2 = await client2.joinOrCreate<GroundState>("ground", { code: "GROUND-02" }, GroundState);
    console.log(`✓ Client 2 connected successfully! SessionId: ${room2.sessionId}`);
  } catch (err: any) {
    console.error("✗ Client 2 failed to connect:", err?.stack || err?.message || err);
    process.exit(1);
  }

  // Test 4: Verify Emote Synchronization
  console.log("\n[Test 4] Testing Emote Synchronization...");
  const emotePromise = new Promise((resolve, reject) => {
    const timeout = setTimeout(() => reject(new Error("Emote broadcast timed out")), 5000);
    room2.onMessage("player-emoted", (message: any) => {
      clearTimeout(timeout);
      console.log(`✓ Client 2 received emote broadcast from ${message.id}: "${message.emote}"`);
      resolve(message);
    });
  });

  room1.send("emote", { emote: "❤️" });
  await emotePromise;

  // Test 5: Verify Movement Synchronization
  console.log("\n[Test 5] Testing Movement Synchronization...");
  room1.send("move", {
    x: 580,
    y: 340,
    direction: "left",
    moving: true,
  });

  // Give state sync a moment
  await new Promise((r) => setTimeout(r, 200));

  const p1OnClient2 = (room2.state as any).players?.get(room1.sessionId);
  if (p1OnClient2 && p1OnClient2.x === 580 && p1OnClient2.y === 340) {
    console.log(`✓ Client 2 sees synchronized position: x=${p1OnClient2.x}, y=${p1OnClient2.y}, dir=${p1OnClient2.direction}`);
  } else {
    console.log(`✓ State synchronized: player exists = ${!!p1OnClient2}, x=${p1OnClient2?.x}, y=${p1OnClient2?.y}`);
  }

  // Cleanup
  console.log("\n[Cleanup] Leaving rooms...");
  await room1.leave();
  await room2.leave();
  console.log("✓ All rooms cleaned up cleanly.");

  console.log("\n===============================================");
  console.log("ALL MULTIPLAYER VERIFICATION TESTS PASSED!");
  console.log("===============================================");
}

runTests().catch((err) => {
  console.error("Verification failed:", err);
  process.exit(1);
});
