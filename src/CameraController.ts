import { vec3 } from "wgpu-matrix";
import type Camera from "./Camera";

export default class CameraController {
  public moveSpeed = 10;
  public mouseSensitivity = 0.1;

  private readonly canvas: HTMLCanvasElement;
  private readonly camera: Camera;
  private readonly keys = new Set<string>();

  constructor(canvas: HTMLCanvasElement, camera: Camera) {
    this.canvas = canvas;
    this.camera = camera;

    canvas.addEventListener("click", async () => {
      if (this.locked) {
        return;
      }

      try {
        await canvas.requestPointerLock();
      } catch (error) {
        console.warn("Unable to lock pointer:", error);
      }
    });

    window.addEventListener("keydown", (event) => {
      if (
        !this.locked ||
        !["KeyW", "KeyA", "KeyS", "KeyD"].includes(event.code)
      ) {
        return;
      }

      event.preventDefault();
      this.keys.add(event.code);
    });

    window.addEventListener("keyup", (event) => {
      this.keys.delete(event.code);
    });

    document.addEventListener("mousemove", (event) => {
      if (!this.locked) return;

      this.camera.rotate(
        event.movementX * this.mouseSensitivity,
        -event.movementY * this.mouseSensitivity,
      );
    });

    document.addEventListener("pointerlockchange", () => {
      this.keys.clear();
    });

    window.addEventListener("blur", () => {
      this.keys.clear();
    });
  }

  private get locked(): boolean {
    return document.pointerLockElement === this.canvas;
  }

  public update(dt: number): void {
    if (!this.locked) return;

    const forwardInput =
      Number(this.keys.has("KeyW")) - Number(this.keys.has("KeyS"));
    const rightInput =
      Number(this.keys.has("KeyD")) - Number(this.keys.has("KeyA"));

    if (forwardInput === 0 && rightInput === 0) {
      return;
    }

    const direction = vec3.mulScalar(this.camera.forward, forwardInput);
    vec3.addScaled(direction, this.camera.right, rightInput, direction);
    vec3.normalize(direction, direction);

    vec3.addScaled(
      this.camera.position,
      direction,
      this.moveSpeed * dt,
      this.camera.position
    );
  }
}