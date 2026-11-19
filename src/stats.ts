const SAMPLE_WINDOW_FRAMES = 30;

/** Frame-time overlay averaged over a fixed window of frames. */
export class FrameStats {
  private readonly element: HTMLDivElement;
  private accumulatedMs = 0;
  private frameCount = 0;

  constructor(parent: HTMLElement) {
    this.element = document.createElement('div');
    this.element.className = 'frame-stats';
    parent.appendChild(this.element);
  }

  record(frameMs: number, renderSize: readonly [number, number]): void {
    if (frameMs <= 0) return;
    this.accumulatedMs += frameMs;
    this.frameCount++;
    if (this.frameCount < SAMPLE_WINDOW_FRAMES) return;

    const averageMs = this.accumulatedMs / this.frameCount;
    this.element.textContent =
      `${(1000 / averageMs).toFixed(1)} FPS | ${averageMs.toFixed(1)} ms | ` +
      `${renderSize[0]}x${renderSize[1]}`;
    this.accumulatedMs = 0;
    this.frameCount = 0;
  }
}
