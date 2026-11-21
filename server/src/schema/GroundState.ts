import { Schema, MapSchema, type } from "@colyseus/schema";
import { PlayerState } from "./PlayerState.js";

export class GroundState extends Schema {
  @type({ map: PlayerState }) players = new MapSchema<PlayerState>();
}
