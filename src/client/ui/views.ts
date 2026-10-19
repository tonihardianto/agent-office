/**
 * The ways to see the office, in the order they're offered, one list for everywhere they're picked:
 * ⚙️ Settings → Camera view, the ☰ menu and the top bar all read this, so the three can't come apart.
 *
 * `View` is `state`'s ViewMode spelled out here rather than imported: this module is reached from the
 * UI that state itself pulls in, and importing it back would be a cycle at run time (a blank office).
 * `tests/dollhouse.test.ts` holds the two to the same three.
 */
export type View = 'first' | 'third' | 'dollhouse';

/** `[view, icon, name, what it shows]` — `what` is how it reads wherever there's room for a line about it. */
export const VIEWS: readonly (readonly [View, string, string, string])[] = [
  ['first', '👀', 'First person', 'through your own eyes, looking around with the mouse'],
  ['third', '🎥', 'Third person', 'following yourself from behind, orbiting the camera round you'],
  ['dollhouse', '🪆', 'Dollhouse', 'into the room from above and outside, roof off and the near walls down'],
];
