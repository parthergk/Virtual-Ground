import colyseusTools from "@colyseus/tools";
const config = (colyseusTools as any).default || colyseusTools;
const { listen } = colyseusTools as any;
import colyseusPkg from "colyseus";
const { Server } = colyseusPkg;
import express from "express";
import cors from "cors";
import dotenv from "dotenv";
import { GroundRoom } from "./rooms/GroundRoom.js";

dotenv.config();

const port = Number(process.env.PORT || 3001);
const rawOrigins = process.env.ALLOWED_ORIGINS || "*";
const origin = rawOrigins === "*" ? "*" : rawOrigins.split(",").map((s) => s.trim());

const appConfig = config({
  initializeExpress: (app: express.Application) => {
    app.use(cors({ origin }));
    app.use(express.json());

    // Health check endpoint
    app.get("/health", (_req: express.Request, res: express.Response) => {
      res.json({
        status: "ok",
        server: "colyseus",
        uptime: Math.floor(process.uptime()),
        timestamp: new Date().toISOString(),
      });
    });
  },

  initializeGameServer: (gameServer: any) => {
    // Register the Ground Room
    gameServer.define("ground", GroundRoom);
  },

  beforeListen: () => {
    console.log(`===============================================`);
    console.log(`Virtual Ramlila Ground Colyseus Game Server`);
    console.log(`Listening on ws://localhost:${port}`);
    console.log(`HTTP health check on http://localhost:${port}/health`);
    console.log(`===============================================`);
  },
});

listen(appConfig, port);
