// Skyward - code shared by SkyAndClouds.shader and SkyLUT.compute:
// atmosphere model, ray/sphere math, phase functions, procedural noise, weather map and LUT parameterizations.
// Functions take their inputs as arguments instead of reading globals, so both the fragment shader and the
// compute shader can call them.

#ifndef SKYWARD_SKY_COMMON_INCLUDED
#define SKYWARD_SKY_COMMON_INCLUDED

#include "Packages/com.unity.render-pipelines.core/ShaderLibrary/GlobalSamplers.hlsl"

// -------------------------------------------------------------------------------------
// Atmosphere constants (meters), values from Hillaire 2020
// -------------------------------------------------------------------------------------
static const float  kPlanetRadius       = 6360e3;
static const float  kAtmosphereRadius   = 6460e3;
static const float3 kRayleighScattering = float3(5.802, 13.558, 33.1) * 1e-6;
static const float  kRayleighHeight     = 8000.0;
static const float  kMieScattering      = 3.996e-6;
static const float  kMieExtinction      = 4.40e-6;
static const float  kMieHeight          = 1200.0;
static const float  kMieG               = 0.8;
static const float3 kOzoneAbsorption    = float3(0.650, 1.881, 0.085) * 1e-6;
static const float  kGroundAlbedo       = 0.3;

// LUT sizes, must match SkyLUTRenderer.cs
static const float2 kTransmittanceSize  = float2(256.0, 64.0);
static const float  kMultiScatSize      = 32.0;
static const float2 kSkyViewSize        = float2(192.0, 108.0);

// Atmosphere LUTs, written by SkyLUT.compute and bound as global textures by SkyLUTRenderer.cs
TEXTURE2D(_TransmittanceLUT);
TEXTURE2D(_MultiScatteringLUT);
TEXTURE2D(_SkyViewLUT);
TEXTURE2D(_SkyViewMoonLUT);   // same as _SkyViewLUT, computed for the moon's direction

// -------------------------------------------------------------------------------------
// Utilities
// -------------------------------------------------------------------------------------
float SkyRemap(float v, float l0, float h0, float l1, float h1)
{
    return l1 + (v - l0) * (h1 - l1) / (h0 - l0);
}

// Ray / sphere centered at the planet origin. Returns (tNear, tFar), negative if missed.
// c is computed as (|ro| - r)(|ro| + r) to keep float precision at planet scale.
float2 RaySphere(float3 ro, float3 rd, float r)
{
    float len = length(ro);
    float b = dot(ro, rd);
    float c = (len - r) * (len + r);
    float h = b * b - c;
    if (h < 0.0)
        return float2(-1.0, -1.0);
    h = sqrt(h);
    return float2(-b - h, -b + h);
}

// Maps [0, 1] to texel centers and back, so LUT edges are sampled exactly (Bruneton 2017)
float UnitToTexCoord(float x, float size)
{
    return 0.5 / size + x * (1.0 - 1.0 / size);
}

float HenyeyGreenstein(float mu, float g)
{
    float g2 = g * g;
    return (1.0 - g2) / (4.0 * PI * pow(max(1.0 + g2 - 2.0 * g * mu, 1e-4), 1.5));
}

float RayleighPhase(float mu)
{
    return 3.0 / (16.0 * PI) * (1.0 + mu * mu);
}

float CornetteShanksPhase(float mu, float g)
{
    float g2 = g * g;
    float k = 3.0 / (8.0 * PI) * (1.0 - g2) / (2.0 + g2);
    return k * (1.0 + mu * mu) / pow(max(1.0 + g2 - 2.0 * g * mu, 1e-4), 1.5);
}

// -------------------------------------------------------------------------------------
// Noise
// -------------------------------------------------------------------------------------
float3 SkyHash33(float3 p)
{
    p = frac(p * float3(0.1031, 0.1030, 0.0973));
    p += dot(p, p.yxz + 33.33);
    return frac((p.xxy + p.yxx) * p.zyx);
}

float GradientCorner(float3 i, float3 f, float3 o)
{
    return dot(SkyHash33(i + o) * 2.0 - 1.0, f - o);
}

// Perlin-style gradient noise, roughly in [-1, 1]
float GradientNoise(float3 p)
{
    float3 i = floor(p);
    float3 f = frac(p);
    float3 u = f * f * f * (f * (f * 6.0 - 15.0) + 10.0);

    float n000 = GradientCorner(i, f, float3(0, 0, 0));
    float n100 = GradientCorner(i, f, float3(1, 0, 0));
    float n010 = GradientCorner(i, f, float3(0, 1, 0));
    float n110 = GradientCorner(i, f, float3(1, 1, 0));
    float n001 = GradientCorner(i, f, float3(0, 0, 1));
    float n101 = GradientCorner(i, f, float3(1, 0, 1));
    float n011 = GradientCorner(i, f, float3(0, 1, 1));
    float n111 = GradientCorner(i, f, float3(1, 1, 1));

    float nx00 = lerp(n000, n100, u.x);
    float nx10 = lerp(n010, n110, u.x);
    float nx01 = lerp(n001, n101, u.x);
    float nx11 = lerp(n011, n111, u.x);
    return lerp(lerp(nx00, nx10, u.y), lerp(nx01, nx11, u.y), u.z);
}

// fBm of gradient noise remapped to roughly [0, 1]
float PerlinFbm(float3 p, int octaves)
{
    float sum = 0.0;
    float amp = 0.5;
    float norm = 0.0;
    for (int o = 0; o < octaves; o++)
    {
        sum += GradientNoise(p) * amp;
        norm += amp;
        p *= 2.02;
        amp *= 0.5;
    }
    return saturate(sum / norm * 0.5 + 0.5);
}

// Inverted Worley (F1) noise in [0, 1]: 1 at feature points
float Worley(float3 p)
{
    float3 id = floor(p);
    float3 f = frac(p);
    float minDist = 1.0;
    [unroll] for (int z = -1; z <= 1; z++)
    [unroll] for (int y = -1; y <= 1; y++)
    [unroll] for (int x = -1; x <= 1; x++)
    {
        float3 o = float3(x, y, z);
        float3 r = o + SkyHash33(id + o) - f;
        minDist = min(minDist, dot(r, r));
    }
    return 1.0 - saturate(sqrt(minDist));
}

float WorleyFbm(float3 p)
{
    return Worley(p) * 0.625 + Worley(p * 2.0) * 0.25 + Worley(p * 4.0) * 0.125;
}

// -------------------------------------------------------------------------------------
// Weather map: x = coverage, y = cloud type (0 stratus -> 1 cumulonimbus)
// -------------------------------------------------------------------------------------
float2 WeatherMapProcedural(float2 xz, float time, float2 wind, float coverageSlider, float scale)
{
    float2 uv = (xz - wind * time) / scale;
    float evolve = time * 0.01;

    // Stretch the fBm to [0, 1]. The global coverage picks how much of the sky is cloudy, and the steep
    // ramp makes cloudy regions reach full coverage quickly, so low coverage gives fewer but full-sized
    // cloud clusters instead of tiny round puffs.
    float w = saturate((PerlinFbm(float3(uv, evolve), 4) - 0.3) / 0.4);
    float coverage = saturate((w - (1.0 - coverageSlider)) * 4.0);
    float type = saturate(GradientNoise(float3(uv * 0.35 + 7.3, evolve * 0.5)) + 0.5);
    return float2(coverage, type);
}

// -------------------------------------------------------------------------------------
// Atmosphere medium
// -------------------------------------------------------------------------------------
void SampleAtmosphere(float height, out float3 rayleighScat, out float mieScat, out float3 extinction)
{
    float rayleighDensity = exp(-height / kRayleighHeight);
    float mieDensity = exp(-height / kMieHeight);
    float ozoneDensity = max(0.0, 1.0 - abs(height - 25000.0) / 15000.0);

    rayleighScat = kRayleighScattering * rayleighDensity;
    mieScat = kMieScattering * mieDensity;
    extinction = rayleighScat + kMieExtinction * mieDensity + kOzoneAbsorption * ozoneDensity;
}

// -------------------------------------------------------------------------------------
// Transmittance LUT parameterization (Bruneton 2017): x = view zenith (via distance to the top),
// y = altitude. Distances are used instead of angles to spend resolution near the horizon.
// -------------------------------------------------------------------------------------
float TransmittanceH()
{
    return sqrt((kAtmosphereRadius - kPlanetRadius) * (kAtmosphereRadius + kPlanetRadius));
}

float2 TransmittanceRMuToUnit(float r, float mu)
{
    float H = TransmittanceH();
    float rho = sqrt(max(0.0, (r - kPlanetRadius) * (r + kPlanetRadius)));
    float discriminant = (kAtmosphereRadius - r) * (kAtmosphereRadius + r) + r * r * mu * mu;
    float d = max(0.0, -r * mu + sqrt(max(discriminant, 0.0)));
    float dMin = kAtmosphereRadius - r;
    float dMax = rho + H;
    return float2((d - dMin) / max(dMax - dMin, 1e-3), rho / H);
}

void TransmittanceUnitToRMu(float2 unit, out float r, out float mu)
{
    float H = TransmittanceH();
    float rho = H * unit.y;
    r = sqrt(rho * rho + kPlanetRadius * kPlanetRadius);
    float dMin = kAtmosphereRadius - r;
    float dMax = rho + H;
    float d = dMin + unit.x * (dMax - dMin);
    mu = d == 0.0 ? 1.0 : (H * H - rho * rho - d * d) / (2.0 * r * d);
    mu = clamp(mu, -1.0, 1.0);
}

// Transmittance from radius r along a direction with cosine mu (to the zenith) to the top of the atmosphere
float3 SampleTransmittanceLUT(float r, float mu)
{
    float2 unit = TransmittanceRMuToUnit(r, mu);
    float2 uv = float2(UnitToTexCoord(unit.x, kTransmittanceSize.x), UnitToTexCoord(unit.y, kTransmittanceSize.y));
    return SAMPLE_TEXTURE2D_LOD(_TransmittanceLUT, sampler_LinearClamp, uv, 0).rgb;
}

// Transmittance from planet-space point p towards the sun, zero when the planet is in the way
float3 TransmittanceToSun(float3 p, float3 sunDir)
{
    if (RaySphere(p, sunDir, kPlanetRadius).x > 0.0)
        return 0.0;
    float r = length(p);
    return SampleTransmittanceLUT(r, dot(p, sunDir) / r);
}

// -------------------------------------------------------------------------------------
// Multi-scattering LUT (Hillaire 2020): x = sun zenith cosine, y = altitude
// -------------------------------------------------------------------------------------
float3 SampleMultiScatteringLUT(float r, float muSun)
{
    float2 uv = float2(
        UnitToTexCoord(saturate(muSun * 0.5 + 0.5), kMultiScatSize),
        UnitToTexCoord(saturate((r - kPlanetRadius) / (kAtmosphereRadius - kPlanetRadius)), kMultiScatSize));
    return SAMPLE_TEXTURE2D_LOD(_MultiScatteringLUT, sampler_LinearClamp, uv, 0).rgb;
}

// -------------------------------------------------------------------------------------
// Sky-view LUT: x = azimuth relative to the sun in [0, pi] (the sky is symmetric around the sun plane),
// y = latitude with a square-root mapping that concentrates texels around the horizon.
// -------------------------------------------------------------------------------------
float3 SkyViewUnitToDir(float2 unit)
{
    float phi = unit.x * PI;
    float s = (unit.y - 0.5) * 2.0;
    float latitude = sign(s) * s * s * (0.5 * PI);
    // Sun-aligned frame: the sun's horizontal direction is +x
    return float3(cos(latitude) * cos(phi), sin(latitude), cos(latitude) * sin(phi));
}

float2 SkyViewDirToUv(float3 dir, float3 sunDir)
{
    float latitude = asin(clamp(dir.y, -1.0, 1.0));
    float v = 0.5 + 0.5 * sign(latitude) * sqrt(abs(latitude) / (0.5 * PI));

    float2 sunH = sunDir.xz;
    float2 viewH = dir.xz;
    float lengths = length(sunH) * length(viewH);
    float cosPhi = lengths > 1e-6 ? dot(viewH, sunH) / lengths : 1.0;
    float u = acos(clamp(cosPhi, -1.0, 1.0)) / PI;

    return float2(UnitToTexCoord(u, kSkyViewSize.x), UnitToTexCoord(v, kSkyViewSize.y));
}

#endif // SKYWARD_SKY_COMMON_INCLUDED
