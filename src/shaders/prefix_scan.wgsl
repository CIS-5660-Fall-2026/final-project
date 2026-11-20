struct ScanLevel {
    count: u32,
    dispatchX: u32,
    dispatchY: u32,
    dispatchZ: u32,
}

override SCAN_LEVEL: u32 = 0u;
const BLOCK_SIZE: u32 = 256u;

@group(0) @binding(0)
var<storage, read> inputValues: array<u32>;

@group(0) @binding(1)
var<storage, read_write> outputValues: array<u32>;

@group(0) @binding(2)
var<storage, read_write> blockSums: array<u32>;

@group(0) @binding(3)
var<storage, read> blockOffsets: array<u32>;

@group(0) @binding(4)
var<storage, read> levels: array<ScanLevel>;

var<workgroup> values: array<u32, BLOCK_SIZE>;

@compute @workgroup_size(128)
fn scanBlocks(
    @builtin(workgroup_id) groupId: vec3<u32>,
    @builtin(local_invocation_index) localIndex: u32,
) {
    let count = levels[SCAN_LEVEL].count;
    let first = groupId.x * BLOCK_SIZE + 2u * localIndex;

    values[2u * localIndex] = 0u;
    values[2u * localIndex + 1u] = 0u;
    if (first < count) {
        values[2u * localIndex] = inputValues[first];
    }
    if (first + 1u < count) {
        values[2u * localIndex + 1u] = inputValues[first + 1u];
    }

    // Up-sweep
    var stride = 1u;
    for (var nodes = BLOCK_SIZE / 2u; nodes > 0u; nodes /= 2u) {
        workgroupBarrier();
        if (localIndex < nodes) {
            let left = stride * (2u * localIndex + 1u) - 1u;
            let right = stride * (2u * localIndex + 2u) - 1u;
            values[right] += values[left];
        }
        stride *= 2u;
    }

    workgroupBarrier();
    if (localIndex == 0u) {
        blockSums[groupId.x] = values[BLOCK_SIZE - 1u];
        values[BLOCK_SIZE - 1u] = 0u;
    }

    // Down-sweep
    for (var nodes = 1u; nodes < BLOCK_SIZE; nodes *= 2u) {
        stride /= 2u;
        workgroupBarrier();
        if (localIndex < nodes) {
            let left = stride * (2u * localIndex + 1u) - 1u;
            let right = stride * (2u * localIndex + 2u) - 1u;
            let leftSum = values[left];
            values[left] = values[right];
            values[right] += leftSum;
        }
    }

    workgroupBarrier();
    if (first < count) {
        outputValues[first] = values[2u * localIndex];
    }
    if (first + 1u < count) {
        outputValues[first + 1u] = values[2u * localIndex + 1u];
    }
}

@compute @workgroup_size(128)
fn addBlockOffsets(
    @builtin(workgroup_id) groupId: vec3<u32>,
    @builtin(local_invocation_index) localIndex: u32,
) {
    let count = levels[SCAN_LEVEL].count;
    let first = groupId.x * BLOCK_SIZE + 2u * localIndex;
    let blockOffset = blockOffsets[groupId.x];
    if (first < count) {
        outputValues[first] += blockOffset;
    }
    if (first + 1u < count) {
        outputValues[first + 1u] += blockOffset;
    }
}