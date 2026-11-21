import { Schema, type } from "@colyseus/schema";

export class PlayerState extends Schema {
  @type("string") playerId: string = "";
  @type("string") characterId: string = "";
  @type("number") x: number = 416;
  @type("number") y: number = 350;
  @type("string") direction: string = "up";
  @type("boolean") isMoving: boolean = false;
  @type("boolean") isOnline: boolean = true;
  @type("string") currentEmote: string = "";
  @type("number") lastSeen: number = 0;
}
