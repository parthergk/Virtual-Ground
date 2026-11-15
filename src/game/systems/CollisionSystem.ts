import { ASSETS, MOVEMENT } from "../config";

/**
 * A polygon is an array of [x, y] pairs describing a closed shape.
 * Points are in source-image pixel coordinates (origin top-left).
 */
export type Polygon = [number, number][];

/** Point representation: either [x, y] tuple or { x, y } object */
export type RawPoint = [number, number] | { x: number; y: number };

/** Raw shape from the collision JSON (supports .polygon, .points, or array of points) */
export interface CollisionShape {
  id?: string;
  type?: string;
  points?: RawPoint[];
  polygon?: RawPoint[];
}

/** Raw spawn-point entry */
export interface SpawnPoint {
  id?: string;
  x: number;
  y: number;
  facing?: string;
  direction?: string;
}

/** World bounds bounding box */
export interface WorldBounds {
  min_x: number;
  min_y: number;
  max_x: number;
  max_y: number;
}

/** Parsed collision map schema matching collision-map.json and collision-map-new.json */
export interface CollisionMapData {
  version?: number;
  type?: string;
  map?: {
    width: number;
    height: number;
    coordinate_system?: string;
    origin?: string;
    background?: string;
    gate?: string;
  };
  collision_settings?: {
    player_collision_shape?: string;
    player_radius?: number;
    check_position?: string;
    blocked_polygon_behavior?: string;
    world_bounds?: WorldBounds;
  };
  world_bounds?: WorldBounds;
  spawn?: SpawnPoint;
  spawn_points?: SpawnPoint[];
  walkable?: CollisionShape[];
  blocked?: CollisionShape[];
  shapes?: CollisionShape[];
  walkable_notes?: string[];
}

/** Helper to convert any raw shape format into a normalized Polygon ([number, number][]) */
function normalizePolygon(raw: CollisionShape | RawPoint[]): Polygon {
  if (!raw) return [];
  const pts = Array.isArray(raw)
    ? raw
    : (raw.polygon || raw.points || []) as RawPoint[];
  if (!Array.isArray(pts)) return [];

  return pts.map((p) => {
    if (Array.isArray(p)) {
      return [Number(p[0]), Number(p[1])] as [number, number];
    }
    if (p && typeof p === "object") {
      return [Number(p.x), Number(p.y)] as [number, number];
    }
    return [0, 0] as [number, number];
  });
}

/**
 * CollisionSystem — loads polygon data from collision-map-new.json and exposes
 * point-in-polygon / segment-distance helpers that keep the player inside
 * the walkable area and outside blocked obstacles.
 *
 * Design notes:
 * - Supports world_bounds (bounded courtyard) and explicit walkable polygons.
 * - Supports both .polygon and .points properties in shape definitions.
 * - Supports both {x, y} objects and [x, y] tuples.
 * - Collision checks test the player's ground contact point (feet).
 * - Blocked polygons are inflated by radius so the player's circular
 *   footprint cannot overlap obstacles.
 * - Movement resolution uses sub-stepping to prevent tunnelling through
 *   thin walls or benches at higher speeds.
 */
export class CollisionSystem {
  private walkable: Polygon[] = [];
  private blocked: Polygon[] = [];
  private spawnPoint: { x: number; y: number; facing: string } = {
    x: 432,
    y: 350,
    facing: "up",
  };
  private worldBounds: WorldBounds | null = null;
  private playerRadius: number = MOVEMENT.collisionRadius;
  private ready = false;

  /** Populate collision geometry from already-loaded JSON data (e.g. Phaser cache). */
  setData(data: CollisionMapData): void {
    // 1. Blocked polygons (supports both data.blocked and compound data.shapes)
    const rawBlocked = data.blocked || data.shapes || [];
    this.blocked = rawBlocked
      .map(normalizePolygon)
      .filter((poly) => poly.length >= 3);

    // 2. Walkable polygons (if defined)
    if (data.walkable && data.walkable.length > 0) {
      this.walkable = data.walkable
        .map(normalizePolygon)
        .filter((poly) => poly.length >= 3);
    } else {
      this.walkable = [];
    }

    // 3. World bounds
    const wb =
      data.collision_settings?.world_bounds ||
      data.world_bounds ||
      (data.map
        ? { min_x: 0, min_y: 0, max_x: data.map.width, max_y: data.map.height }
        : null);
    this.worldBounds = wb;

    // 4. Player radius
    if (data.collision_settings?.player_radius) {
      this.playerRadius = data.collision_settings.player_radius;
    }

    // 5. Spawn point (supports both data.spawn and data.spawn_points)
    if (data.spawn) {
      this.spawnPoint = {
        x: data.spawn.x,
        y: data.spawn.y,
        facing: data.spawn.direction || data.spawn.facing || "up",
      };
    } else if (data.spawn_points && data.spawn_points.length > 0) {
      const sp = data.spawn_points[0];
      this.spawnPoint = {
        x: sp.x,
        y: sp.y,
        facing: sp.facing || sp.direction || "up",
      };
    }

    this.ready = true;
  }

  /** Fetch and load collision JSON directly (fallback if not preloaded). */
  async load(): Promise<void> {
    const response = await fetch(ASSETS.maps.collision);
    const data: CollisionMapData = await response.json();
    this.setData(data);
  }

  /** Return the primary spawn point. */
  getSpawnPoint(): { x: number; y: number; facing: string } {
    return this.spawnPoint;
  }

  /** Return configured player radius if available. */
  getPlayerRadius(): number {
    return this.playerRadius;
  }

  /**
   * Is (x, y) a valid position for the player's foot contact point?
   *
   * Valid means:
   *   1. Within world_bounds (padded by radius),
   *   2. Inside at least one walkable polygon (if explicit walkable polygons exist), AND
   *   3. Not inside or within radius pixels of any blocked polygon.
   */
  isWalkable(x: number, y: number, radius: number): boolean {
    if (!this.ready) return false;

    // 1. World bounds check
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

    // 3. Blocked polygons check (inflated by radius)
    for (const poly of this.blocked) {
      if (this.pointNearPolygon(x, y, radius, poly)) {
        return false;
      }
    }

    return true;
  }

  /**
   * Resolve a desired movement from (fromX, fromY) to (toX, toY).
   *
   * Sub-steps displacements (max step = radius * 0.5) to prevent tunnelling,
   * and applies axis-aligned edge sliding when colliding diagonally.
   */
  resolveMovement(
    fromX: number,
    fromY: number,
    toX: number,
    toY: number,
    radius: number
  ): { x: number; y: number } {
    const totalDx = toX - fromX;
    const totalDy = toY - fromY;
    const dist = Math.hypot(totalDx, totalDy);

    if (dist === 0) {
      return { x: fromX, y: fromY };
    }

    const maxStep = Math.max(2, radius * 0.5);
    const steps = Math.ceil(dist / maxStep);
    const stepDx = totalDx / steps;
    const stepDy = totalDy / steps;

    let curX = fromX;
    let curY = fromY;

    for (let i = 0; i < steps; i++) {
      const nextX = curX + stepDx;
      const nextY = curY + stepDy;

      if (this.isWalkable(nextX, nextY, radius)) {
        curX = nextX;
        curY = nextY;
      } else if (stepDx !== 0 && this.isWalkable(nextX, curY, radius)) {
        curX = nextX;
      } else if (stepDy !== 0 && this.isWalkable(curX, nextY, radius)) {
        curY = nextY;
      } else {
        break;
      }
    }

    return { x: curX, y: curY };
  }

  // ─── Geometry Helpers ──────────────────────────────────────────────

  /**
   * Ray-casting point-in-polygon test.
   * Casts a horizontal ray from (px, py) in the +X direction and counts crossings.
   */
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

  /**
   * Check whether (px, py) is inside the polygon OR within radius pixels
   * of any of its boundary edges (circular footprint check).
   */
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

  /** Shortest Euclidean distance from point (px, py) to segment (ax, ay)-(bx, by). */
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

    if (lengthSq === 0) {
      return Math.hypot(px - ax, py - ay);
    }

    const t = Math.max(
      0,
      Math.min(1, ((px - ax) * dx + (py - ay) * dy) / lengthSq)
    );
    const closestX = ax + t * dx;
    const closestY = ay + t * dy;

    return Math.hypot(px - closestX, py - closestY);
  }
}
