/**
 * Calls `onResize` with the canvas size in device pixels whenever it changes.
 * Returns a function that stops observing.
 */
export function observeCanvasSize(
  canvas: HTMLCanvasElement,
  maxDimension: number,
  onResize: (width: number, height: number) => void,
): () => void {
  const clamp = (value: number) =>
    Math.max(1, Math.min(maxDimension, Math.round(value)));
  const observer = new ResizeObserver(entries => {
    for (const entry of entries) {
      // devicePixelContentBoxSize gives exact pixels; it is missing in Safari.
      // devicePixelContentBoxSize 给出精确的像素尺寸；Safari 不支持，需要回退。
      const devicePixels = entry.devicePixelContentBoxSize?.[0];
      const width =
        devicePixels?.inlineSize ?? entry.contentRect.width * devicePixelRatio;
      const height =
        devicePixels?.blockSize ?? entry.contentRect.height * devicePixelRatio;
      onResize(clamp(width), clamp(height));
    }
  });
  try {
    observer.observe(canvas, {box: 'device-pixel-content-box'});
  } catch {
    observer.observe(canvas);
  }
  return () => observer.disconnect();
}
