/// <reference types="vite/client" />

// These two packages don't ship TypeScript type declarations,
// so we declare loose (any-typed) modules for them here.
declare module '3d-view-controls' {
  const CameraControls: any;
  export default CameraControls;
}

declare module 'stats-js' {
  const Stats: any;
  export default Stats;
}
