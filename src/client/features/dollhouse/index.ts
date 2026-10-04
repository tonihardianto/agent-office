import * as THREE from 'three';
import type { Side } from '../../../shared/layout';
import type { Ctx } from '../../core/context';
import { modalOpen } from '../../ui/dom';
import './ui.css';
import { Dollhouse, nearSides, sameSides } from './controller';

// The dollhouse: the room seen from above and outside, roof off and the walls between it and you down,
// like a model of the office. It draws through an orthographic camera of its own (see ViewEffect.camera
// in core/registry.ts) rather than the player's, so nothing far off looks small and the room reads flat
// and true the way a floor plan does. The mouse is aimed through that camera too, so what you click is
// what you pointed at.
//
// It's `player.view`, like the first and third person views: this follows that each frame, and puts the
// room back exactly as it found it the moment the view changes.

/** How long a press moves before it counts as a drag rather than a click on what's under it. */
const DRAG_SLOP = 5;
/** How fast the arrow keys / WASD carry it over the floor (m/s). */
const CARRY = 16;
/**
 * How far the haze's near edge is pushed out while the room is drawn. An orthographic lens has no
 * distance for the haze to work by: from a camera this far off, everything in the room would sit past
 * it and be faded out as one flat sheet. Held off only for the drawing itself, because the sky writes
 * the haze afresh each frame (world/sky.ts) and this must not fight it.
 */
const NO_HAZE = 1e5;

/** Registers the dollhouse view. `ctx.player.view === 'dollhouse'` is what turns it on. */
export function installDollhouse(ctx: Ctx) {
  const { player, canvas, scene } = ctx;
  const doll = new Dollhouse();
  const ortho = new THREE.OrthographicCamera(-1, 1, 1, -1, 0.2, 400);
  /** Whether it's the view you're in. */
  let on = false;

  /** The outside walls taken down while it's up, and which ones they were. */
  let hidden: { mesh: THREE.Mesh; side: Side }[] = [];
  let hiddenFor: Side[] = [];

  /** What the room looks like from here: the walls between the camera and it taken away. */
  function dress() {
    if (!ctx.inOffice()) return;
    const sides = nearSides(doll.yaw);
    if (sameSides(sides, hiddenFor)) return;
    hiddenFor = sides;
    // Back up first: a wall that's come round into view has to be there again to be found.
    for (const { mesh } of hidden) mesh.visible = true;
    hidden = [];
    ctx.office.group.traverse((o) => {
      const m = o as THREE.Mesh;
      const side = m.userData.side as Side | undefined;
      if (!m.isMesh || !side || !sides.includes(side)) return;
      hidden.push({ mesh: m, side });
      m.visible = false;
    });
  }

  /** Puts the room back exactly as the other views have it. */
  function undress() {
    for (const { mesh } of hidden) mesh.visible = true;
    hidden = [];
    hiddenFor = [];
  }

  function enter() {
    on = true;
    // Over the middle of the room, at the height you're on, so it opens on the floor you're in.
    const b = ctx.plan().bounds;
    doll.target.set((b.minX + b.maxX) / 2, 0, (b.minZ + b.maxZ) / 2);
    doll.target.y = player.pos.y;
    // The mouse has the room to carry about now, not your eyes to look with: let go of it.
    player.unlock();
    player.clearKeys();
    document.body.classList.add('dollhouse');
    dress();
    ctx.hint.invalidate();
  }

  function leave() {
    on = false;
    undress();
    document.body.classList.remove('dollhouse');
    ctx.hint.invalidate();
  }

  /** Follows `player.view`: the dollhouse is on while it is, and everything goes back when it isn't. */
  let frameDt = 1 / 60;
  ctx.ticks.add('pre', (f) => {
    frameDt = f.dt;
    const want = player.view === 'dollhouse';
    if (want !== on) (want ? enter : leave)();
    if (!on) return;
    // You can't walk about from out here (nor would you want to: you're in the view, not the room), so
    // the keys that would carry you over the floor carry the view instead.
    player.enabled = false;
    dress();
  });

  // ---- Keys -----------------------------------------------------------------------------------------
  // Esc leaves it. It goes back to the first person view, and the setting follows (see ui/settings.ts).
  ctx.keys.add('guard', (e) => {
    if (!on || e.code !== 'Escape') return false;
    player.setView('first');
    return true;
  });

  // ---- Mouse: drag to turn, right-drag (or Shift-drag) to carry, wheel to zoom, click to use -------
  let drag: { x: number; y: number; moved: number; carry: boolean; pointer: number } | null = null;
  canvas.addEventListener('pointerdown', (e) => {
    if (!on || ctx.activities.busy()) return;
    const carry = e.button === 2 || e.shiftKey;
    if (e.button !== 0 && !carry) return;
    drag = { x: e.clientX, y: e.clientY, moved: 0, carry, pointer: e.pointerId };
    canvas.setPointerCapture(e.pointerId);
    if (carry) canvas.classList.add('carrying');
  });
  canvas.addEventListener('pointermove', (e) => {
    if (!drag) return;
    const dx = e.clientX - drag.x;
    const dy = e.clientY - drag.y;
    drag.x = e.clientX;
    drag.y = e.clientY;
    drag.moved += Math.abs(dx) + Math.abs(dy);
    if (drag.moved <= DRAG_SLOP) return;
    if (drag.carry) doll.carry(dx, dy, ortho, window.innerHeight);
    else doll.turn(dx, dy);
  });
  const endDrag = (e: PointerEvent) => {
    const d = drag;
    drag = null;
    if (!d) return;
    canvas.classList.remove('carrying');
    canvas.releasePointerCapture?.(d.pointer);
    // A press that stayed put is a click on the room: use what's under it, as first person does.
    if (d.moved > DRAG_SLOP || d.carry || e.button !== 0 || ctx.activities.busy()) return;
    const r = canvas.getBoundingClientRect();
    player.onClick?.(new THREE.Vector2(((e.clientX - r.left) / r.width) * 2 - 1, -((e.clientY - r.top) / r.height) * 2 + 1));
  };
  canvas.addEventListener('pointerup', endDrag);
  canvas.addEventListener('pointercancel', () => (drag = null));
  canvas.addEventListener(
    'wheel',
    (e) => {
      if (!on) return;
      e.preventDefault();
      doll.zoom(e.deltaY);
    },
    { passive: false },
  );
  // The browser's own menu on a right-click would cover the room.
  canvas.addEventListener('contextmenu', (e) => {
    if (on) e.preventDefault();
  });

  // ---- Each frame, and the drawing itself -----------------------------------------------------------
  ctx.view.add({
    // The frame is drawn through this, and the mouse aimed through it, while it's up.
    camera: () => (on ? ortho : null),
    update: () => {
      if (!on) return;
      // The arrow keys or WASD carry it over the floor, at a speed of its own rather than of your feet.
      const dx = (player.holding('KeyD', 'ArrowRight') ? 1 : 0) - (player.holding('KeyA', 'ArrowLeft') ? 1 : 0);
      const dz = (player.holding('KeyW', 'ArrowUp') ? 1 : 0) - (player.holding('KeyS', 'ArrowDown') ? 1 : 0);
      if (dx || dz) doll.carry(dx * CARRY * frameDt, dz * CARRY * frameDt, ortho, window.innerHeight, 1);
      doll.place(ortho, window.innerWidth, window.innerHeight);
    },
    // Your hands are your own eyes': nothing of them in a view from outside the building.
    covers: () => on,
    // The haze is held off for the drawing alone, and handed back exactly as the sky had it.
    filter: {
      begin: () => {
        if (!on) return false;
        const haze = scene.fog as THREE.Fog | null;
        if (haze) {
          haze.near += NO_HAZE;
          haze.far += NO_HAZE;
        }
        return true;
      },
      end: () => {
        const haze = scene.fog as THREE.Fog | null;
        if (!haze) return;
        haze.near -= NO_HAZE;
        haze.far -= NO_HAZE;
      },
    },
  });

  return { active: () => on };
}
