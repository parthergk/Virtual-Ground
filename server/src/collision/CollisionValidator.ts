import * as fs from "fs";
import * as path from "path";
import { fileURLToPath } from "url";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

export type Polygon = [number, number][];

export interface WorldBounds {
  min_x: number;
  min_y: number;
  max_x: number;
  max_y: number;
}

export class CollisionValidator {
  private walkable: Polygon[] = [];
  private blocked: Polygon[] = [];
  private worldBounds: WorldBounds | null = null;
  private playerRadius = 4;
  private ready = false;

  constructor() {
    this.init();
  }

  private init(): void {
    try {
      const candidates = [
        path.join(__dirname, "collision-map.json"),
        path.join(__dirname, "../../src/collision/collision-map.json"),
        path.join(process.cwd(), "src/collision/collision-map.json"),
        path.join(process.cwd(), "dist/collision/collision-map.json"),
      ];

      for (const p of candidates) {
        if (fs.existsSync(p)) {
          const raw = fs.readFileSync(p, "utf-8");
          const data = JSON.parse(raw);
          this.setData(data);
          return;
        }
      }
      console.warn("[CollisionValidator] collision-map.json not found in candidate paths.");
    } catch (err) {
      console.error("[CollisionValidator] Failed to load collision-map.json:", err);
    }
  }

  public setData(data: any): void {
    const rawBlocked = data.blocked || data.shapes || [];
    this.blocked = rawBlocked
      .map((s: any) => this.normalizePolygon(s))
      .filter((poly: Polygon) => poly.length >= 3);

    if (data.walkable && data.walkable.length > 0) {
      this.walkable = data.walkable
        .map((s: any) => this.normalizePolygon(s))
        .filter((poly: Polygon) => poly.length >= 3);
    }

    const wb =
      data.collision_settings?.world_bounds ||
      data.world_bounds ||
      (data.map
        ? { min_x: 0, min_y: 0, max_x: data.map.width, max_y: data.map.height }
        : null);
    this.worldBounds = wb;

    if (data.collision_settings?.player_radius) {
      this.playerRadius = data.collision_settings.player_radius;
    }

    this.ready = true;
  }

  private normalizePolygon(raw: any): Polygon {
    if (!raw) return [];
    const pts = Array.isArray(raw)
      ? raw
      : (raw.polygon || raw.points || []);
    if (!Array.isArray(pts)) return [];

    return pts.map((p: any) => {
      if (Array.isArray(p)) {
        return [Number(p[0]), Number(p[1])] as [number, number];
      }
      if (p && typeof p === "object") {
        return [Number(p.x), Number(p.y)] as [number, number];
      }
      return [0, 0] as [number, number];
    });
  }

  public isWalkable(x: number, y: number, radius = this.playerRadius): boolean {
    if (!this.ready) return true;

    // 1. World bounds
    if (this.worldBounds) {
      if (
        x - radius < this.worldBounds.min_x ||
        x + radius > this.worldBounds.max_x ||
        y - radius < this.worldBounds.min_y ||
        y + radius > this.worldBounds.max_y
      ) {
        return false;
      }
    }

    // 2. Explicit walkable polygons check (if defined)
    if (this.walkable.length > 0) {
      let insideWalkable = false;
      for (const poly of this.walkable) {
        if (this.pointInPolygon(x, y, poly)) {
          insideWalkable = true;
          break;
        }
      }
      if (!insideWalkable) return false;
    }

    // 3. Blocked polygons check
    for (const poly of this.blocked) {
      if (this.pointNearPolygon(x, y, radius, poly)) {
        return false;
      }
    }

    return true;
  }

  public resolveMovement(
    fromX: number,
    fromY: number,
    toX: number,
    toY: number,
    radius = this.playerRadius,
    obstacles?: { x: number; y: number; radius?: number }[]
  ): { x: number; y: number } {
    const totalDx = toX - fromX;
    const totalDy = toY - fromY;
    const dist = Math.hypot(totalDx, totalDy);

    if (dist === 0) return { x: fromX, y: fromY };

    const maxStep = Math.max(2, radius * 0.5);
    const steps = Math.ceil(dist / maxStep);
    const stepDx = totalDx / steps;
    const stepDy = totalDy / steps;

    let curX = fromX;
    let curY = fromY;

    const isClearOfObstacles = (x: number, y: number): boolean => {
      if (!obstacles || obstacles.length === 0) return true;
      for (const obs of obstacles) {
        const minDistance = radius + (obs.radius ?? radius);
        if (Math.hypot(x - obs.x, y - obs.y) < minDistance) {
          return false;
        }
      }
      return true;
    };

    const isStepValid = (x: number, y: number): boolean => {
      return this.isWalkable(x, y, radius) && isClearOfObstacles(x, y);
    };

    for (let i = 0; i < steps; i++) {
      const nextX = curX + stepDx;
      const nextY = curY + stepDy;

      if (isStepValid(nextX, nextY)) {
        curX = nextX;
        curY = nextY;
      } else if (stepDx !== 0 && isStepValid(nextX, curY)) {
        curX = nextX;
      } else if (stepDy !== 0 && isStepValid(curX, nextY)) {
        curY = nextY;
      } else {
        break;
      }
    }

    return { x: curX, y: curY };
  }

  private pointInPolygon(px: number, py: number, polygon: Polygon): boolean {
    let inside = false;
    const n = polygon.length;
    for (let i = 0, j = n - 1; i < n; j = i++) {
      const xi = polygon[i][0];
      const yi = polygon[i][1];
      const xj = polygon[j][0];
      const yj = polygon[j][1];

      const intersect =
        yi > py !== yj > py &&
        px < ((xj - xi) * (py - yi)) / (yj - yi) + xi;

      if (intersect) inside = !inside;
    }
    return inside;
  }

  private pointNearPolygon(
    px: number,
    py: number,
    radius: number,
    polygon: Polygon
  ): boolean {
    if (this.pointInPolygon(px, py, polygon)) return true;

    const n = polygon.length;
    for (let i = 0, j = n - 1; i < n; j = i++) {
      const dist = this.pointToSegmentDistance(
        px,
        py,
        polygon[j][0],
        polygon[j][1],
        polygon[i][0],
        polygon[i][1]
      );
      if (dist < radius) return true;
    }
    return false;
  }

  private pointToSegmentDistance(
    px: number,
    py: number,
    ax: number,
    ay: number,
    bx: number,
    by: number
  ): number {
    const dx = bx - ax;
    const dy = by - ay;
    const lengthSq = dx * dx + dy * dy;

    if (lengthSq === 0) return Math.hypot(px - ax, py - ay);

    const t = Math.max(
      0,
      Math.min(1, ((px - ax) * dx + (py - ay) * dy) / lengthSq)
    );
    const closestX = ax + t * dx;
    const closestY = ay + t * dy;

    return Math.hypot(px - closestX, py - closestY);
  }
}
