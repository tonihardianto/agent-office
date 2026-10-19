import test from 'node:test';
import assert from 'node:assert/strict';
import * as THREE from 'three';
import { Dollhouse, MAX_HALF, MIN_HALF, START_HALF, START_PITCH, nearSides, sameSides } from '../src/client/features/dollhouse/controller.js';
import { VIEWS } from '../src/client/ui/views.js';

// The dollhouse's camera: what walls it takes away to see in, and where it stands. The view itself
// (features/dollhouse/index.ts) needs a whole client to run, so this is the arithmetic it works by.

test('the views offered are the ones the player can be in, in the same order', () => {
  // ui/views.ts spells ViewMode out to stay out of a cycle (it's reached from state's own UI), so
  // the two could drift: this is what holds them together.
  assert.deepEqual(
    VIEWS.map(([v]) => v),
    ['first', 'third', 'dollhouse'],
  );
  // Every one says what it's called and what it shows, or it reads as a blank row.
  for (const [view, icon, label, what] of VIEWS) {
    assert.ok(view && icon && label && what, `${view} is missing something`);
  }
  // Ids the menu builds from these have to stay distinct.
  assert.equal(new Set(VIEWS.map(([v]) => `view-${v}`)).size, VIEWS.length);
});

// The dollhouse's camera: what walls it takes away to see in, and where it stands. The view itself
// (features/dollhouse/index.ts) needs a whole client to run, so this is the arithmetic it works by.

test('the walls between the camera and the room are the ones facing it', () => {
  // Looking from +z (yaw 0), the south wall is the near one; from -z, the north one.
  assert.deepEqual(nearSides(0), ['south']);
  assert.deepEqual(nearSides(Math.PI), ['north']);
  // From +x, the east wall; from -x, the west one.
  assert.deepEqual(nearSides(Math.PI / 2), ['east']);
  assert.deepEqual(nearSides(-Math.PI / 2), ['west']);
  // From a corner, both of the walls that meet there.
  assert.deepEqual(nearSides(Math.PI / 4), ['east', 'south']);
  assert.deepEqual(nearSides((-3 * Math.PI) / 4), ['west', 'north']);
  // Turned right round, the far wall again: the set is periodic, not cumulative.
  assert.deepEqual(nearSides(Math.PI * 2), ['south']);
});

test('two walls are the same two whatever order they were found in', () => {
  assert.ok(sameSides(['east', 'south'], ['south', 'east']));
  assert.ok(sameSides([], []));
  assert.ok(!sameSides(['east'], ['east', 'south']));
  assert.ok(!sameSides(['east', 'south'], ['west', 'south']));
});

test('it turns and looks down, within its limits, and the wheel fits more or less of the room in', () => {
  const d = new Dollhouse();
  assert.equal(d.half, START_HALF);
  assert.equal(d.pitch, START_PITCH);
  const yaw = d.yaw;
  d.turn(100, 0);
  assert.ok(d.yaw < yaw, 'dragging right turns it the other way');
  // Looking down stops short of straight down (the walls would be edge-on) and of level.
  d.turn(0, 1e6);
  assert.ok(d.pitch < Math.PI / 2, `pitch ${d.pitch}`);
  d.turn(0, -1e6);
  assert.ok(d.pitch > 0, `pitch ${d.pitch}`);
  // The wheel: out to the limit, and in to the other, never past either.
  d.zoom(1e6);
  assert.equal(d.half, MAX_HALF);
  d.zoom(-1e6);
  assert.equal(d.half, MIN_HALF);
});

test('it stands off what it is over, framed for the window, and squares up to it', () => {
  const d = new Dollhouse();
  const camera = new THREE.OrthographicCamera(-1, 1, 1, -1, 0.5, 200);
  d.target.set(3, 0, -4);
  d.place(camera, 1280, 800);
  assert.ok(camera.position.distanceTo(d.target) > 10, 'stands off the room rather than in it');
  assert.equal(camera.position.y > d.target.y, true, 'looks down on it');
  // A wider window sees more across, and the same down: that is what keeps the room un-squashed.
  assert.ok(Math.abs(camera.right / camera.top - 1280 / 800) < 1e-9, `${camera.right} / ${camera.top}`);
  assert.equal(camera.top, START_HALF);
  // It looks at what it is over.
  camera.updateMatrixWorld();
  const forward = new THREE.Vector3(0, 0, -1).applyQuaternion(camera.quaternion);
  const to = d.target.clone().sub(camera.position).normalize();
  assert.ok(forward.dot(to) > 0.999, `looking off by ${forward.dot(to)}`);
  // Squaring up means the room is the same width whatever it is turned to.
  d.half = 10;
  d.place(camera, 800, 800);
  assert.equal(camera.right - camera.left, 20);
  assert.equal(camera.top - camera.bottom, 20);
});

test('carrying it about moves it across the floor, along the way the view looks', () => {
  const d = new Dollhouse();
  const camera = new THREE.OrthographicCamera(-1, 1, 1, -1, 0.5, 200);
  // Square on to the south wall: the way in is -z, and far across the view is -x.
  d.yaw = 0;
  d.pitch = 0.8;
  d.target.set(0, 0, 0);
  d.place(camera, 1000, 1000);
  d.carry(0, 120, camera, 1000);
  assert.ok(d.target.z < 0, `z ${d.target.z}`);
  assert.ok(Math.abs(d.target.x) < 1e-6, `x ${d.target.x}`);
  d.target.set(0, 0, 0);
  d.place(camera, 1000, 1000);
  d.carry(120, 0, camera, 1000);
  assert.ok(d.target.x < 0, `x ${d.target.x}`);
  assert.ok(Math.abs(d.target.z) < 1e-6, `z ${d.target.z}`);
  // Never straight down: even at the lowest tilt there is a way on across the floor.
  d.pitch = 0.18;
  d.target.set(0, 0, 0);
  d.place(camera, 1000, 1000);
  d.carry(0, 120, camera, 1000);
  assert.ok(Math.hypot(d.target.x, d.target.z) > 0.01, 'carried it nowhere looking nearly straight down');
  // Far out, a drag of the same pixels carries it further, so it reads the same on screen.
  d.pitch = 0.8;
  d.half = 10;
  d.target.set(0, 0, 0);
  d.place(camera, 1000, 1000);
  d.carry(0, 100, camera, 1000);
  const near = d.target.z;
  d.half = 40;
  d.target.set(0, 0, 0);
  d.place(camera, 1000, 1000);
  d.carry(0, 100, camera, 1000);
  assert.ok(d.target.z < near * 3, `${d.target.z} against ${near}`);
});
