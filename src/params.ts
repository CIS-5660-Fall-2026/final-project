export interface Params {
    // Storm
    deltaPhPa: number;        // central pressure deficit
    latitudeDeg: number;      // negative = southern hemisphere (clockwise rotation)
    autoFromPhysics: boolean; // derive Rmax and B from deltaP and latitude (Huang et al. 2021, eqs. 7-8)
    rmaxKm: number;
    hollandB: number;
    outflowTurn: number;
    eyeRatio: number;
    // Structure
    bandCount: number;
    bandPitchDeg: number;
    bandStrength: number;
    cdoRadiusKm: number;
    // Detail
    detailScaleKm: number;
    detailStrength: number;
    flowPeriodMin: number;
    seed: number;
    // Lighting & view
    sunElevDeg: number;
    sunAzimDeg: number;
    exaggeration: number;
    reliefMix: number;
    shadows: boolean;
    viewHalfKm: number;
    // Simulation
    timeScale: number;        // storm seconds per real second
    paused: boolean;
    texSize: number;
}

export const DOMAIN_KM = 1600;

export function defaultParams(): Params {
    return {
        deltaPhPa: 60,
        latitudeDeg: 20,
        autoFromPhysics: true,
        rmaxKm: 32,
        hollandB: 1.42,
        outflowTurn: 0.7,
        eyeRatio: 0.5,
        bandCount: 3,
        bandPitchDeg: 18,
        bandStrength: 1.0,
        cdoRadiusKm: 220,
        detailScaleKm: 18,
        detailStrength: 1.4,
        flowPeriodMin: 30,
        seed: 0,
        sunElevDeg: 18,
        sunAzimDeg: 300,
        exaggeration: 6,
        reliefMix: 0.85,
        shadows: true,
        viewHalfKm: 450,
        // The reference GIF covers ~9.5 storm hours in 10 s of playback, so ~1 s = 1 h.
        timeScale: 3600,
        paused: false,
        texSize: 1024,
    };
}

// Coriolis parameter as written in Huang et al. (2021): f = 2 * 7.273e-5 * sin(latitude).
export function coriolis(latDeg: number): number {
    return 2 * 7.273e-5 * Math.sin((latDeg * Math.PI) / 180);
}

// Huang et al. (2021) eqs. 7-8 (after Vickery & Wadhera 2008), without the random error terms.
export function hollandFromPhysics(deltaPhPa: number, latDeg: number): { rmaxKm: number; hollandB: number } {
    const lat = Math.abs(latDeg);
    const rmaxKm = Math.exp(3.015 - 6.291e-5 * deltaPhPa * deltaPhPa + 0.0337 * lat);
    const f = Math.abs(coriolis(lat));
    const hollandB = 1.833 - 0.326 * Math.sqrt(1000 * f * rmaxKm);
    return { rmaxKm, hollandB: Math.min(Math.max(hollandB, 0.5), 2.5) };
}

// Holland (1980) gradient wind (m/s), same formula as hollandV() in common.wgsl.
export function hollandV(p: Params, rKm: number): number {
    const r = Math.max(rKm, 0.05) * 1000;
    const rm = p.rmaxKm * 1000;
    const x = Math.min(Math.pow(rm / r, p.hollandB), 80);
    const fh = 0.5 * Math.abs(coriolis(p.latitudeDeg)) * r;
    return Math.sqrt((p.hollandB * p.deltaPhPa * 100) / 1.15 * x * Math.exp(-x) + fh * fh) - fh;
}

export const UNIFORM_FLOATS = 24;

// Packing order must match `struct Params` in common.wgsl.
export function packUniforms(out: Float32Array, p: Params, stormTime: number, aspect: number): void {
    const v = [
        stormTime,
        DOMAIN_KM,
        p.rmaxKm,
        p.hollandB,
        p.deltaPhPa * 100,
        coriolis(p.latitudeDeg),
        p.outflowTurn,
        p.eyeRatio,
        p.bandCount,
        p.bandPitchDeg,
        p.bandStrength,
        p.cdoRadiusKm,
        p.detailScaleKm,
        p.detailStrength,
        p.flowPeriodMin * 60,
        p.seed,
        p.sunElevDeg,
        p.sunAzimDeg,
        p.exaggeration,
        p.reliefMix,
        p.shadows ? 1 : 0,
        p.viewHalfKm,
        aspect,
        p.texSize,
    ];
    out.set(v);
}
