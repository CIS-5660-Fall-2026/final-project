@group(0) @binding(0)
var<storage, read_write> params: SimulationUniforms;

@group(0) @binding(1)
var<storage, read_write> dispatchArgs: array<u32, 3>;

@compute @workgroup_size(1)
fn finishStep() {
    dispatchArgs[0] = (params.bodyCount + 63u) / 64u;
    dispatchArgs[1] = 1u;
    dispatchArgs[2] = 1u;
    params.simulationStep += 1u;
}