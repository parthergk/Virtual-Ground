/**
 * MobileInput — shared mutable singleton for D-pad state.
 *
 * The React MobileControls component writes to this object on pointer events.
 * The Phaser MovementSystem reads from it every game loop frame.
 *
 * Using a plain mutable object avoids React re-renders on every frame and
 * removes the need for any cross-thread / cross-context synchronisation.
 */
export interface MobileInputState {
  up: boolean;
  down: boolean;
  left: boolean;
  right: boolean;
}

export const mobileInput: MobileInputState = {
  up: false,
  down: false,
  left: false,
  right: false,
};

/** Reset all directions to false (call on visibility-change or unmount). */
export function resetMobileInput(): void {
  mobileInput.up = false;
  mobileInput.down = false;
  mobileInput.left = false;
  mobileInput.right = false;
}
