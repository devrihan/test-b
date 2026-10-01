import type { Container } from "pixi.js";

// ── Camera: pan + zoom as a single world transform ─────────────────────────
// PAN and ZOOM are different axes (the resolution of Fahad's "must not conflict"
// constraint). The whole scene is drawn ONCE in world coordinates; the camera
// only sets the world container's position + scale. Zones live side-by-side
// along world-x, so panning between them is just moving the camera's center.
//
//   world-x:  [ -W .. 0 ]   [ 0 .. W ]   [ W .. 2W ]
//   zone:        Config        River       Downstream

export type Zone = "config" | "river" | "downstream";
export const ZONES: Zone[] = ["config", "river", "downstream"];

export const ZONE_LABEL: Record<Zone, string> = {
  config: "Configuration",
  river: "River",
  downstream: "Downstream",
};

export interface Camera {
  x: number; // world-space point at viewport center
  y: number;
  zoom: number;
}

export const MIN_ZOOM = 0.6;
export const MAX_ZOOM = 4;

export interface WorldMetrics {
  zoneW: number; // width of one zone = the river/viewport width
  height: number;
}

/** World-x of a zone's center. Config = -W/2, River = W/2, Downstream = 3W/2. */
export function zoneCenter(zone: Zone, m: WorldMetrics): number {
  const i = ZONES.indexOf(zone); // 0 | 1 | 2
  return (i - 1 + 0.5) * m.zoneW;
}

export function makeCamera(m: WorldMetrics): Camera {
  return { x: zoneCenter("river", m), y: m.height / 2, zoom: 1 };
}

export function clampZoom(z: number): number {
  return Math.max(MIN_ZOOM, Math.min(MAX_ZOOM, z));
}

/** Push the camera onto the world container (cheap; safe to call every frame). */
export function applyCamera(world: Container, cam: Camera, screenW: number, screenH: number): void {
  world.scale.set(cam.zoom);
  world.x = screenW / 2 - cam.x * cam.zoom;
  world.y = screenH / 2 - cam.y * cam.zoom;
}

/** Lerp a camera toward a target in place; returns true while still moving. */
export function stepCamera(cam: Camera, target: Camera, k = 0.22): boolean {
  cam.x += (target.x - cam.x) * k;
  cam.y += (target.y - cam.y) * k;
  cam.zoom += (target.zoom - cam.zoom) * k;
  const moving =
    Math.abs(target.x - cam.x) > 0.5 || Math.abs(target.y - cam.y) > 0.5 || Math.abs(target.zoom - cam.zoom) > 0.002;
  if (!moving) {
    cam.x = target.x;
    cam.y = target.y;
    cam.zoom = target.zoom;
  }
  return moving;
}
