struct ScanLevel {
    count: u32,
    dispatchX: u32,
    dispatchY: u32,
    dispatchZ: u32,
}

@group(0) @binding(0)
var<storage, read> inputCount: u32;

@group(0) @binding(1)
var<storage, read_write> levels: array<ScanLevel>;

@compute @workgroup_size(1)
fn prepareScan() {
    var count = inputCount;
    for (var level = 0u; level < arrayLength(&levels); level++) {
        let blockCount = (count + 255u) / 256u;
        levels[level] = ScanLevel(count, blockCount, 1u, 1u);
        count = blockCount;
    }
}