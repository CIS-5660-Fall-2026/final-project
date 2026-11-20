export interface SimulationBuffers {
  readonly bodiesA: GPUBuffer;
  readonly bodiesB: GPUBuffer;
  readonly params: GPUBuffer;
  readonly dispatchArgs: GPUBuffer;
  readonly collisionCandidates: GPUBuffer;
}

export interface SimulationAlgorithms {
  gravity: "naive" | "tiled";
  collision: "all-pairs";
  absorption: "full-scan";
  compaction: "serial" | "scan";
  explosion: "serial" | "parallel";
}

export const BASELINE_ALGORITHMS: Readonly<SimulationAlgorithms> = {
  gravity: "naive",
  collision: "all-pairs",
  absorption: "full-scan",
  compaction: "serial",
  explosion: "serial",
};