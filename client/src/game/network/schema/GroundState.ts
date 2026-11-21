import { Schema, MapSchema, type } from "@colyseus/schema";
import { PlayerState } from "./PlayerState";

export class GroundState extends Schema {
  @type({ map: PlayerState }) players = new MapSchema<PlayerState>();
}
