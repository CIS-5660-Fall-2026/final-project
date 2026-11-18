function generateBayerMatrix(size: number): Uint32Array {
    let matrix = new Uint32Array([0]);
    const offsets = [0, 2, 3, 1];

    for (let n = 1; n < size; n *= 2) {
        const n2 = n * 2;
        const next = new Uint32Array(n2 * n2);

        for (let y = 0; y < n; ++y) {
        for (let x = 0; x < n; ++x) {
            // M(2n) = [[4M, 4M+2], [4M+3, 4M+1]]

            const value = matrix[y * n + x] * 4;
            next[y * n2 + x] = value + offsets[0];
            next[y * n2 + x + n] = value + offsets[1];
            next[(y + n) * n2 + x] = value + offsets[2];
            next[(y + n) * n2 + x + n] = value + offsets[3];
        }
        }
        matrix = next;
    }

    return matrix;
}

export function generateDitherTextureData(texelsPerDot: number = 32, sublayers: number = 8) {
    // parameters
    const n = 2;
    const dot_count = n * n; // 4
    const layers = (dot_count - 1) * sublayers + 1; // 25
    const size = n * texelsPerDot; // 64
    const bayer = generateBayerMatrix(n);

    // dot positions based on bayer matrix
    const dots: Array<[number, number]> = new Array(dot_count);
    for (let j = 0; j < n; ++j)
        for (let i = 0; i < n; ++i)
        dots[bayer[j * n + i]] = [i / n, j / n];

    const data = new Uint8Array(size * size * layers);
    for (let q = 0; q < layers; ++q) {
        const whole = 1 + Math.floor(q / sublayers); // number of whole dots
        const frac = (q % sublayers) / sublayers; // fraction of the next dot
        const c = whole + frac; // total number of dots

        // create the 2D texture
        for (let y = 0; y < size; ++y) {
        for (let x = 0; x < size; ++x) {
            // texel to uv coords
            const px = (x + 0.5) / size;
            const py = (y + 0.5) / size;
            let best = 1.0;

            for (let d = 0; d < whole + (frac > 0 ? 1 : 0); ++d) {
            // radial distance to dot
            const weight = d < whole ? 1.0 : frac;
            let dx = Math.abs(px - dots[d][0]);
            let dy = Math.abs(py - dots[d][1]);
            dx = Math.min(dx, 1.0 - dx);
            dy = Math.min(dy, 1.0 - dy);
            best = Math.min(best, Math.PI * (dx * dx + dy * dy) * c / weight);
            }

            data[(q * size + y) * size + x] = Math.round(Math.min(best, 1.0) * 255);
        }
        }
    }
    return { data, size, layers };
}
