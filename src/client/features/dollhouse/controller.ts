import * as THREE from 'three';
import type { Side } from '../../../shared/layout';

// The dollhouse's camera and where it stands: the room seen from above and outside, like a model of
// it with the roof off. An orthographic one, so the room reads flat and true the way a floor plan
// does, turned, panned and zoomed by hand (see index.ts for what it plugs into, and what it takes
// away and puts back).

/**
 * How far the camera stands off what it's over. An orthographic lens doesn't care — nothing far looks
 * small — but the near and far planes do, and so does the fog, which is set to a distance it can't
 * reach from out here (see index.ts).
 */
const DIST = 60;
/** How much of the room it fits by default, and the range the wheel has. */
export const START_HALF = 15;
export const MIN_HALF = 2.5;
export const MAX_HALF = 48;
/** How far down it looks by default, and how far it may: level isn't a dollhouse, straight down loses the walls. */
export const START_PITCH = 0.8;
const MIN_PITCH = 0.18;
const MAX_PITCH = 1.45;
/** Turning per pixel of drag, and how fast the keys carry it over the floor (m/s). */
const TURN = 0.008;
const CARRY = 14;
/** The four outside walls, which is what its `userData.wall` tag names on a map that has them. */
export const SIDES: readonly Side[] = ['north', 'south', 'east', 'west'];

/** Two of these are the same wall, whatever order they were found in. */
export function sameSides(a: readonly Side[], b: readonly Side[]): boolean {
  return a.length === b.length && a.every((s) => b.includes(s));
}

/**
 * The outside walls between the camera and the room, seen from `yaw`: the ones to take away to see
 * in. Square on to a wall, that whole side goes; near enough to a corner, both of them do.
 */
export function nearSides(yaw: number): Side[] {
  const sides: Side[] = [];
  const sin = Math.sin(yaw);
  const cos = Math.cos(yaw);
  if (sin > 0.3) sides.push('east');
  else if (sin < -0.3) sides.push('west');
  if (cos > 0.3) sides.push('south');
  else if (cos < -0.3) sides.push('north');
  return sides;
}

/** Where the dollhouse stands and what it's over: how far round and how far down, and how much it fits. */
export class Dollhouse {
  yaw = 1.15;
  pitch = START_PITCH;
  /** Half the height of the view, in meters: what the wheel changes. */
  half = START_HALF;
  /** The point on the floor it's over, which dragging and the keys carry about. */
  readonly target = new THREE.Vector3();
  private readonly look = new THREE.Vector3();

  /** Turns it: `dx`/`dy` pixels of drag. */
  turn(dx: number, dy: number) {
    this.yaw -= dx * TURN;
    this.pitch = THREE.MathUtils.clamp(this.pitch + dy * TURN, MIN_PITCH, MAX_PITCH);
  }

  /** How much of the room fits: `k` is the wheel's notches, positive zooming out. */
  zoom(k: number) {
    this.half = THREE.MathUtils.clamp(this.half * Math.exp(k * 0.0015), MIN_HALF, MAX_HALF);
  }

  /**
   * Carries it over the floor, `dx`/`dy` pixels of drag (or `dt` seconds of a held key, times `dx`/
   * `dy` of -1, 0 or 1): along the view's own right and the way it looks, across the ground.
   */
  carry(dx: number, dy: number, camera: THREE.Camera, height: number, dt = 1) {
    const f = this.look.set(0, 0, -1).applyQuaternion(camera.quaternion);
    const flat = Math.max(0.3, Math.hypot(f.x, f.z));
    // Right across the view on the ground, and the way the view looks with its tilt taken out.
    const rx = -f.z / flat;
    const rz = f.x / flat;
    const gx = f.x / flat;
    const gz = f.z / flat;
    const m = dt < 1 ? CARRY * dt : (this.half * 2) / height;
    this.target.x += (-rx * dx + gx * dy) * m;
    this.target.z += (-rz * dx + gz * dy) * m;
  }

  /** Puts the camera where it stands, sized for a `width` x `height` viewport. */
  place(camera: THREE.OrthographicCamera, width: number, height: number) {
    const cp = Math.cos(this.pitch);
    const step = Math.sin(this.pitch);
    camera.position.copy(this.target).addScaledVector(this.look.set(Math.sin(this.yaw) * cp, step, Math.cos(this.yaw) * cp), DIST);
    camera.lookAt(this.target);
    const w = (this.half * width) / height;
    if (camera.left !== -w || camera.right !== w || camera.top !== this.half || camera.bottom !== -this.half) {
      camera.left = -w;
      camera.right = w;
      camera.top = this.half;
      camera.bottom = -this.half;
      camera.updateProjectionMatrix();
    }
    // Straight away, since what's under the mouse is worked out before the frame is drawn.
    camera.updateMatrixWorld();
  }
}
