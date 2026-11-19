import {addScaled, cross, type Vec3} from './math';

const MOVE_SPEED = 12;
const BOOST_MULTIPLIER = 5;
const LOOK_SENSITIVITY = 0.003;
const MAX_PITCH = 1.5;
const WORLD_UP: Vec3 = [0, 1, 0];

export interface CameraPose {
  readonly position: Readonly<Vec3>;
  readonly yaw: number;
  readonly pitch: number;
}

export interface CameraState {
  readonly position: Readonly<Vec3>;
  readonly forward: Readonly<Vec3>;
  readonly right: Readonly<Vec3>;
  readonly up: Readonly<Vec3>;
}

/**
 * Free-fly camera: WASD to move, Q/E to descend/ascend, Shift to boost,
 * drag with any pointer (mouse, pen, touch) to look around.
 */
export class FlyCamera {
  private position: Vec3;
  private yaw: number;
  private pitch: number;
  private readonly pressedKeys = new Set<string>();
  private readonly listeners = new AbortController();

  constructor(element: HTMLElement, pose: CameraPose) {
    this.position = [...pose.position];
    this.yaw = pose.yaw;
    this.pitch = pose.pitch;

    const options = {signal: this.listeners.signal};
    // KeyboardEvent.code is the physical key, so WASD works on any keyboard layout.
    // KeyboardEvent.code 是物理按键位置，所以任何键盘布局下 WASD 都能用。
    window.addEventListener(
      'keydown',
      e => {
        if (!isEditableTarget(e.target)) this.pressedKeys.add(e.code);
      },
      options,
    );
    window.addEventListener(
      'keyup',
      e => this.pressedKeys.delete(e.code),
      options,
    );
    window.addEventListener('blur', () => this.pressedKeys.clear(), options);
    element.addEventListener(
      'pointerdown',
      e => element.setPointerCapture(e.pointerId),
      options,
    );
    element.addEventListener(
      'pointermove',
      e => {
        if (element.hasPointerCapture(e.pointerId))
          this.look(e.movementX, e.movementY);
      },
      options,
    );
  }

  setPose(pose: CameraPose): void {
    this.position = [...pose.position];
    this.yaw = pose.yaw;
    this.pitch = pose.pitch;
  }

  /** Applies keyboard movement for a frame of `deltaSeconds` and returns the new state. */
  update(deltaSeconds: number): CameraState {
    const state = this.state();
    const boosted = this.isPressed('ShiftLeft') || this.isPressed('ShiftRight');
    const step = MOVE_SPEED * (boosted ? BOOST_MULTIPLIER : 1) * deltaSeconds;
    const moves: Array<[string, Readonly<Vec3>, number]> = [
      ['KeyW', state.forward, step],
      ['KeyS', state.forward, -step],
      ['KeyD', state.right, step],
      ['KeyA', state.right, -step],
      ['KeyE', WORLD_UP, step],
      ['KeyQ', WORLD_UP, -step],
    ];
    for (const [code, axis, amount] of moves) {
      if (this.isPressed(code))
        this.position = addScaled(this.position, axis, amount);
    }
    return {...state, position: this.position};
  }

  state(): CameraState {
    const cosPitch = Math.cos(this.pitch);
    const forward: Vec3 = [
      cosPitch * Math.sin(this.yaw),
      Math.sin(this.pitch),
      cosPitch * Math.cos(this.yaw),
    ];
    const right: Vec3 = [Math.cos(this.yaw), 0, -Math.sin(this.yaw)];
    return {position: this.position, forward, right, up: cross(forward, right)};
  }

  dispose(): void {
    this.listeners.abort();
  }

  private look(deltaX: number, deltaY: number): void {
    this.yaw += deltaX * LOOK_SENSITIVITY;
    this.pitch = Math.max(
      -MAX_PITCH,
      Math.min(MAX_PITCH, this.pitch - deltaY * LOOK_SENSITIVITY),
    );
  }

  private isPressed(code: string): boolean {
    return this.pressedKeys.has(code);
  }
}

function isEditableTarget(target: EventTarget | null): boolean {
  return (
    target instanceof HTMLInputElement ||
    target instanceof HTMLTextAreaElement ||
    (target instanceof HTMLElement && target.isContentEditable)
  );
}
