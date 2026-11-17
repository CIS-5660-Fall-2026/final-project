// Skyward - volumetric cloud raymarching, shared by SkyAndClouds.shader (full-resolution path) and
// SkyLUT.compute (low-resolution path). Requires SkyCommon.hlsl.
//
// Optional keywords, same meaning as in SkyAndClouds.shader: _SKY_LUT, _BAKED_WEATHER, _BAKED_NOISE.
// The compute path always defines all three.
//
// Clouds: raymarched spherical shell, Perlin-Worley base + Worley detail (Schneider 2015), Beer-Lambert,
// dual-lobe HG phase, powder and energy-conserving multi-scattering octaves (Wrenninge 2013, Hillaire 2016).

#ifndef SKYWARD_SKY_CLOUDS_INCLUDED
#define SKYWARD_SKY_CLOUDS_INCLUDED

// Material properties (the compute path receives them from SkyLUTRenderer.cs)
float _CloudSteps;
float _LightSteps;
float _CloudExtinction;
float _BaseScale;
float _DetailScale;

// Baked noise (NoiseBaker.cs). The periods must match the baker: one texture repeat = N noise units.
TEXTURE3D(_BaseNoise);   SAMPLER(sampler_BaseNoise);
TEXTURE3D(_DetailNoise); SAMPLER(sampler_DetailNoise);
static const float kBaseNoisePeriod = 4.0;
static const float kDetailNoisePeriod = 2.0;

// 64x64 blue noise (NoiseBaker.cs), used to jitter the start of each ray
TEXTURE2D(_BlueNoise);
static const uint kBlueNoiseSize = 64;

// Baked weather map (SkyLUTRenderer.cs)
TEXTURE2D(_WeatherMapTex);
float4 _WeatherOrigin;      // xy = world xz of the map center, z = map size in meters

// Global properties set by SkyController.cs
float  _SkyTime;            // seconds, drives wind and weather evolution
float  _CloudCoverage;      // 0 = clear, 1 = overcast
float2 _CloudWind;          // m/s in world xz
float  _CloudBottom;        // m above ground
float  _CloudTop;           // m above ground
float  _CloudDensity;
float  _WeatherScale;       // m per weather noise unit
float  _CloudCurl;          // curl-noise warp strength of the weather map
float3 _SkyCloudLightDir;   // sun or moon, whichever lights the scene more
float3 _SkyCloudLightColor; // its color * intensity, before atmospheric transmittance
float3 _SkyCloudAmbient;

float BlueNoise(uint2 pixel)
{
    return LOAD_TEXTURE2D(_BlueNoise, pixel % kBlueNoiseSize).r;
}

// ---------------------------------------------------------------------------------
// Light transmittance through the atmosphere
// ---------------------------------------------------------------------------------
// Brute-force transmittance from point p (planet space) towards a light direction
float3 LightTransmittanceRaymarch(float3 p, float3 lightDir)
{
    if (RaySphere(p, lightDir, kPlanetRadius).x > 0.0)
        return 0.0;

    const int steps = 8;
    float tTop = RaySphere(p, lightDir, kAtmosphereRadius).y;
    float dt = tTop / steps;
    float3 opticalDepth = 0.0;
    for (int i = 0; i < steps; i++)
    {
        float3 pos = p + lightDir * ((i + 0.5) * dt);
        float3 rs; float ms; float3 ext;
        SampleAtmosphere(length(pos) - kPlanetRadius, rs, ms, ext);
        opticalDepth += ext * dt;
    }
    return exp(-opticalDepth);
}

float3 LightTransmittance(float3 p, float3 lightDir)
{
#if defined(_SKY_LUT)
    return TransmittanceToSun(p, lightDir);
#else
    return LightTransmittanceRaymarch(p, lightDir);
#endif
}

// ---------------------------------------------------------------------------------
// Weather map & cloud density
// ---------------------------------------------------------------------------------
// x = coverage, y = cloud type
float2 WeatherMap(float2 xz)
{
#if defined(_BAKED_WEATHER)
    float2 uv = (xz - _WeatherOrigin.xy) / _WeatherOrigin.z + 0.5;
    if (any(uv < 0.0) || any(uv > 1.0))
        return 0.0;
    return SAMPLE_TEXTURE2D_LOD(_WeatherMapTex, sampler_LinearClamp, uv, 0).rg;
#else
    return WeatherMapProcedural(xz, _SkyTime, _CloudWind, _CloudCoverage, _WeatherScale, _CloudCurl);
#endif
}

float HeightGradient(float h, float type)
{
    float top = lerp(0.35, 1.0, type);
    return smoothstep(0.0, 0.08, h) * (1.0 - smoothstep(top * 0.55, top, h));
}

// wp: world position, height: meters above ground
float CloudDensity(float3 wp, float height, bool detail)
{
    float h = saturate((height - _CloudBottom) / (_CloudTop - _CloudBottom));
    float2 weather = WeatherMap(wp.xz);
    float coverage = weather.x;
    if (coverage <= 0.001)
        return 0.0;

    float3 p = wp;
    p.xz -= _CloudWind * _SkyTime;
    p.y = height;

    float3 pb = p / _BaseScale;
#if defined(_BAKED_NOISE)
    // R = Perlin fBm, G = Worley at 4x frequency (see NoiseBake.compute)
    float2 baseNoise = SAMPLE_TEXTURE3D_LOD(_BaseNoise, sampler_BaseNoise, pb / kBaseNoisePeriod, 0).rg;
    float perlinWorley = SkyRemap(baseNoise.r, 0.0, 1.0, baseNoise.g, 1.0);
#else
    float perlinWorley = SkyRemap(PerlinFbm(pb, 3), 0.0, 1.0, Worley(pb * 4.0), 1.0);
#endif
    float base = saturate(SkyRemap(perlinWorley, 0.45, 1.0, 0.0, 1.0));

    // The threshold never drops below 0.1, so even full coverage keeps some gaps and billows
    float threshold = 1.0 - coverage * 0.9;
    float density = saturate(SkyRemap(base * HeightGradient(h, weather.y), threshold, 1.0, 0.0, 1.0));
    if (density <= 0.0)
        return 0.0;

    if (detail)
    {
        float3 pd = p / _DetailScale + _SkyTime * 0.02;
    #if defined(_BAKED_NOISE)
        // R/G/B = Worley at 1x/2x/4x, combined with the same weights as WorleyFbm
        float3 detailNoise = SAMPLE_TEXTURE3D_LOD(_DetailNoise, sampler_DetailNoise, pd / kDetailNoisePeriod, 0).rgb;
        float d = dot(detailNoise, float3(0.625, 0.25, 0.125));
    #else
        float d = WorleyFbm(pd);
    #endif
        // wispy at the bottom, billowy at the top
        float erosion = lerp(d, 1.0 - d, saturate(h * 4.0)) * 0.5;
        density = saturate(SkyRemap(density, erosion, 1.0, 0.0, 1.0));
    }
    return density * _CloudDensity;
}

// Optical depth towards the light from planet-space point p
float LightOpticalDepth(float3 p, float3 planetCenter)
{
    int steps = (int)_LightSteps;
    float od = 0.0;
    float t = 0.0;
    float stepSize = (_CloudTop - _CloudBottom) / (steps * 2.0);
    for (int i = 0; i < steps; i++)
    {
        float dt = stepSize * (i + 1);
        t += dt;
        float3 pos = p + _SkyCloudLightDir * (t - 0.5 * dt);
        od += CloudDensity(planetCenter + pos, length(pos) - kPlanetRadius, false) * dt;
    }
    return od * _CloudExtinction;
}

// ---------------------------------------------------------------------------------
// Raymarch
// ---------------------------------------------------------------------------------
// Distance from the camera to the bottom of the cloud layer along rd, 0 when the ray hits the ground
float CloudEntryDistance(float3 ro, float3 rd)
{
    if (RaySphere(ro, rd, kPlanetRadius).x > 0.0)
        return 0.0;
    return max(RaySphere(ro, rd, kPlanetRadius + _CloudBottom).y, 0.0);
}

// Returns scattered radiance (rgb) and transmittance (a). Assumes the camera is below the cloud layer.
// jitter in [0, 1) offsets the samples along the ray, turning banding into noise.
float4 MarchClouds(float3 ro, float3 rd, float3 planetCenter, float jitter)
{
    if (RaySphere(ro, rd, kPlanetRadius).x > 0.0)
        return float4(0, 0, 0, 1);

    float tStart = CloudEntryDistance(ro, rd);
    float tEnd = RaySphere(ro, rd, kPlanetRadius + _CloudTop).y;
    if (tEnd <= tStart)
        return float4(0, 0, 0, 1);
    tEnd = min(tEnd, tStart + 40000.0);

    int steps = (int)_CloudSteps;
    float dt = (tEnd - tStart) / steps;

    // Lit by the sun during the day and by the moon at night (chosen by SkyController)
    float3 sunRadiance = LightTransmittance(ro + rd * tStart, _SkyCloudLightDir) * _SkyCloudLightColor;
    float mu = dot(rd, _SkyCloudLightDir);

    float3 scattered = 0.0;
    float transmittance = 1.0;

    [loop] for (int i = 0; i < steps; i++)
    {
        float t = tStart + (i + jitter) * dt;
        float3 pos = ro + rd * t;
        float height = length(pos) - kPlanetRadius;
        float density = CloudDensity(planetCenter + pos, height, true);
        if (density <= 0.001)
            continue;

        float sigma = density * _CloudExtinction;
        float lightOD = LightOpticalDepth(pos, planetCenter);

        // Multi-scattering octaves (Wrenninge 2013): attenuation, extinction and eccentricity decay
        float sunScatter = 0.0;
        float a = 1.0, b = 1.0, c = 1.0;
        [unroll] for (int o = 0; o < 3; o++)
        {
            float phase = lerp(HenyeyGreenstein(mu, 0.75 * c), HenyeyGreenstein(mu, -0.2 * c), 0.35);
            sunScatter += a * exp(-lightOD * b) * phase;
            // a <= b keeps the octave sum energy conserving (Hillaire 2016)
            a *= 0.5; b *= 0.5; c *= 0.5;
        }
        float powder = 1.0 - exp(-density * 2.0);
        float hNorm = saturate((height - _CloudBottom) / (_CloudTop - _CloudBottom));
        float3 ambient = _SkyCloudAmbient * lerp(0.5, 1.0, hNorm);

        float3 source = (sunRadiance * sunScatter * lerp(0.5, 1.0, powder) + ambient) * sigma;
        float stepTransmittance = exp(-sigma * dt);
        scattered += transmittance * (source - source * stepTransmittance) / sigma;
        transmittance *= stepTransmittance;

        if (transmittance < 0.01)
            break;
    }
    return float4(scattered, transmittance);
}

#endif // SKYWARD_SKY_CLOUDS_INCLUDED
