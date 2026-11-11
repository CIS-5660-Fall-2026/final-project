// Skyward - procedural sky + volumetric clouds, drawn by a URP Full Screen Pass Renderer Feature.
//
// Milestone 1 version: everything is evaluated directly per pixel (no LUTs, no baked noise).
//   * Atmosphere: single-scattering raymarch with Rayleigh, Mie and ozone (Hillaire 2020 coefficients).
//   * Weather map: procedural 2D coverage / cloud-type field, scrolled by wind and evolving over time.
//   * Clouds: raymarched spherical shell, Perlin-Worley base + Worley detail (Schneider 2015),
//     Beer-Lambert, dual-lobe HG phase, powder and multi-scattering octaves (Wrenninge 2013).
//
// Per-scene parameters (sun, coverage, wind...) are global shader properties set by SkyController.cs.

Shader "Skyward/SkyAndClouds"
{
    Properties
    {
        _SkySteps ("Sky Steps", Range(8, 32)) = 16
        _CloudSteps ("Cloud Steps", Range(16, 128)) = 48
        _LightSteps ("Cloud Light Steps", Range(2, 8)) = 4
        _CloudExtinction ("Cloud Extinction (1/m)", Range(0.001, 0.1)) = 0.02
        _BaseScale ("Cloud Base Noise Scale (m)", Float) = 9000
        _DetailScale ("Cloud Detail Noise Scale (m)", Float) = 1500
        _WeatherScale ("Weather Map Scale (m)", Float) = 20000
    }

    SubShader
    {
        Tags { "RenderType" = "Opaque" "RenderPipeline" = "UniversalPipeline" }
        ZWrite Off ZTest Always Cull Off Blend Off

        Pass
        {
            Name "SkyAndClouds"

            HLSLPROGRAM
            #pragma vertex Vert
            #pragma fragment Frag
            #pragma target 4.5

            #include "Packages/com.unity.render-pipelines.universal/ShaderLibrary/Core.hlsl"
            #include "Packages/com.unity.render-pipelines.core/Runtime/Utilities/Blit.hlsl"
            #include "Packages/com.unity.render-pipelines.universal/ShaderLibrary/DeclareDepthTexture.hlsl"

            // Material properties
            float _SkySteps;
            float _CloudSteps;
            float _LightSteps;
            float _CloudExtinction;
            float _BaseScale;
            float _DetailScale;
            float _WeatherScale;

            // Global properties set by SkyController.cs
            float3 _SkySunDir;          // unit vector pointing towards the sun
            float  _SkySunIntensity;
            float  _CloudCoverage;      // 0 = clear, 1 = overcast
            float2 _CloudWind;          // m/s in world xz
            float  _CloudBottom;        // m above ground
            float  _CloudTop;           // m above ground
            float  _CloudDensity;
            float  _DebugWeather;

            // ---------------------------------------------------------------------------------
            // Atmosphere constants (meters), values from Hillaire 2020
            // ---------------------------------------------------------------------------------
            static const float  kPlanetRadius       = 6360e3;
            static const float  kAtmosphereRadius   = 6460e3;
            static const float3 kRayleighScattering = float3(5.802, 13.558, 33.1) * 1e-6;
            static const float  kRayleighHeight     = 8000.0;
            static const float  kMieScattering      = 3.996e-6;
            static const float  kMieExtinction      = 4.40e-6;
            static const float  kMieHeight          = 1200.0;
            static const float  kMieG               = 0.8;
            static const float3 kOzoneAbsorption    = float3(0.650, 1.881, 0.085) * 1e-6;

            // ---------------------------------------------------------------------------------
            // Utilities
            // ---------------------------------------------------------------------------------
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

            float InterleavedGradient(float2 pixel)
            {
                return frac(52.9829189 * frac(dot(pixel, float2(0.06711056, 0.00583715))));
            }

            // ---------------------------------------------------------------------------------
            // Noise
            // ---------------------------------------------------------------------------------
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

            // ---------------------------------------------------------------------------------
            // Atmosphere
            // ---------------------------------------------------------------------------------
            void SampleAtmosphere(float height, out float3 rayleighScat, out float mieScat, out float3 extinction)
            {
                float rayleighDensity = exp(-height / kRayleighHeight);
                float mieDensity = exp(-height / kMieHeight);
                float ozoneDensity = max(0.0, 1.0 - abs(height - 25000.0) / 15000.0);

                rayleighScat = kRayleighScattering * rayleighDensity;
                mieScat = kMieScattering * mieDensity;
                extinction = rayleighScat + kMieExtinction * mieDensity + kOzoneAbsorption * ozoneDensity;
            }

            // Transmittance from point p (planet space) to the sun
            float3 SunTransmittance(float3 p)
            {
                if (RaySphere(p, _SkySunDir, kPlanetRadius).x > 0.0)
                    return 0.0;

                const int steps = 8;
                float tTop = RaySphere(p, _SkySunDir, kAtmosphereRadius).y;
                float dt = tTop / steps;
                float3 opticalDepth = 0.0;
                for (int i = 0; i < steps; i++)
                {
                    float3 pos = p + _SkySunDir * ((i + 0.5) * dt);
                    float3 rs; float ms; float3 ext;
                    SampleAtmosphere(length(pos) - kPlanetRadius, rs, ms, ext);
                    opticalDepth += ext * dt;
                }
                return exp(-opticalDepth);
            }

            // Single-scattering sky radiance along a view ray. Multi-scattering LUT is planned for Milestone 2.
            float3 SkyRadiance(float3 ro, float3 rd, out float3 transmittance)
            {
                float tMax = RaySphere(ro, rd, kAtmosphereRadius).y;
                float tGround = RaySphere(ro, rd, kPlanetRadius).x;
                if (tGround > 0.0)
                    tMax = tGround;

                float mu = dot(rd, _SkySunDir);
                float phaseR = RayleighPhase(mu);
                float phaseM = CornetteShanksPhase(mu, kMieG);

                int steps = (int)_SkySteps;
                float dt = tMax / steps;
                float3 radiance = 0.0;
                float3 throughput = 1.0;

                [loop] for (int i = 0; i < steps; i++)
                {
                    float3 pos = ro + rd * ((i + 0.5) * dt);
                    float3 rayleighScat; float mieScat; float3 extinction;
                    SampleAtmosphere(length(pos) - kPlanetRadius, rayleighScat, mieScat, extinction);

                    float3 scattering = (rayleighScat * phaseR + mieScat * phaseM) * SunTransmittance(pos);
                    float3 stepTransmittance = exp(-extinction * dt);
                    // Energy-conserving integration over the step (Hillaire 2016)
                    radiance += throughput * (scattering - scattering * stepTransmittance) / max(extinction, 1e-10);
                    throughput *= stepTransmittance;
                }

                transmittance = throughput;
                return radiance * _SkySunIntensity;
            }

            // ---------------------------------------------------------------------------------
            // Weather map & cloud density
            // ---------------------------------------------------------------------------------
            // x = coverage, y = cloud type (0 stratus -> 1 cumulonimbus)
            float2 WeatherMap(float2 xz)
            {
                float time = _Time.y;
                float2 uv = (xz - _CloudWind * time) / _WeatherScale;
                float evolve = time * 0.01;

                // Stretch the fBm to [0, 1]. The global coverage picks how much of the sky is cloudy, and the steep
                // ramp makes cloudy regions reach full coverage quickly, so low coverage gives fewer but full-sized
                // cloud clusters instead of tiny round puffs.
                float w = saturate((PerlinFbm(float3(uv, evolve), 4) - 0.3) / 0.4);
                float coverage = saturate((w - (1.0 - _CloudCoverage)) * 4.0);
                float type = saturate(GradientNoise(float3(uv * 0.35 + 7.3, evolve * 0.5)) + 0.5);
                return float2(coverage, type);
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
                p.xz -= _CloudWind * _Time.y;
                p.y = height;

                float3 pb = p / _BaseScale;
                float perlinWorley = SkyRemap(PerlinFbm(pb, 3), 0.0, 1.0, Worley(pb * 4.0), 1.0);
                float base = saturate(SkyRemap(perlinWorley, 0.45, 1.0, 0.0, 1.0));

                // The threshold never drops below 0.1, so even full coverage keeps some gaps and billows
                float threshold = 1.0 - coverage * 0.9;
                float density = saturate(SkyRemap(base * HeightGradient(h, weather.y), threshold, 1.0, 0.0, 1.0));
                if (density <= 0.0)
                    return 0.0;

                if (detail)
                {
                    float d = WorleyFbm(p / _DetailScale + _Time.y * 0.02);
                    // wispy at the bottom, billowy at the top
                    float erosion = lerp(d, 1.0 - d, saturate(h * 4.0)) * 0.5;
                    density = saturate(SkyRemap(density, erosion, 1.0, 0.0, 1.0));
                }
                return density * _CloudDensity;
            }

            // Optical depth towards the sun from planet-space point p
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
                    float3 pos = p + _SkySunDir * (t - 0.5 * dt);
                    od += CloudDensity(planetCenter + pos, length(pos) - kPlanetRadius, false) * dt;
                }
                return od * _CloudExtinction;
            }

            // Returns scattered radiance (rgb) and transmittance (a). Assumes the camera is below the cloud layer.
            float4 MarchClouds(float3 ro, float3 rd, float3 planetCenter, float2 pixel, out float entryDistance)
            {
                entryDistance = 0.0;
                if (RaySphere(ro, rd, kPlanetRadius).x > 0.0)
                    return float4(0, 0, 0, 1);

                float tStart = max(RaySphere(ro, rd, kPlanetRadius + _CloudBottom).y, 0.0);
                float tEnd = RaySphere(ro, rd, kPlanetRadius + _CloudTop).y;
                if (tEnd <= tStart)
                    return float4(0, 0, 0, 1);
                tEnd = min(tEnd, tStart + 40000.0);
                entryDistance = tStart;

                int steps = (int)_CloudSteps;
                float dt = (tEnd - tStart) / steps;
                float jitter = InterleavedGradient(pixel);

                float3 sunRadiance = SunTransmittance(ro + rd * tStart) * _SkySunIntensity;
                float daylight = saturate(_SkySunDir.y * 3.0 + 0.15);
                float mu = dot(rd, _SkySunDir);

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
                        a *= 0.5; b *= 0.25; c *= 0.5;
                    }
                    float powder = 1.0 - exp(-density * 2.0);
                    float hNorm = saturate((height - _CloudBottom) / (_CloudTop - _CloudBottom));
                    float3 ambient = float3(0.4, 0.55, 0.85) * _SkySunIntensity * 0.05 * daylight * lerp(0.5, 1.0, hNorm);

                    float3 source = (sunRadiance * sunScatter * lerp(0.5, 1.0, powder) + ambient) * sigma;
                    float stepTransmittance = exp(-sigma * dt);
                    scattered += transmittance * (source - source * stepTransmittance) / sigma;
                    transmittance *= stepTransmittance;

                    if (transmittance < 0.01)
                        break;
                }
                return float4(scattered, transmittance);
            }

            // ---------------------------------------------------------------------------------
            // Fragment
            // ---------------------------------------------------------------------------------
            half4 Frag(Varyings input) : SV_Target
            {
                UNITY_SETUP_STEREO_EYE_INDEX_POST_VERTEX(input);
                float2 uv = input.texcoord;
                float3 color = SAMPLE_TEXTURE2D_X_LOD(_BlitTexture, sampler_PointClamp, uv, _BlitMipLevel).rgb;

                float depth = SampleSceneDepth(uv);
            #if UNITY_REVERSED_Z
                bool isSky = depth <= 1e-6;
            #else
                bool isSky = depth >= 1.0 - 1e-6;
            #endif

                // Planet centered below the camera, so the camera always sits at the "north pole"
                float3 planetCenter = float3(_WorldSpaceCameraPos.x, -kPlanetRadius, _WorldSpaceCameraPos.z);
                float3 ro = float3(0.0, kPlanetRadius + max(_WorldSpaceCameraPos.y, 1.0), 0.0);

                if (isSky)
                {
                    float3 worldPos = ComputeWorldSpacePosition(uv, 0.5, UNITY_MATRIX_I_VP);
                    float3 rd = normalize(worldPos - _WorldSpaceCameraPos);

                    // Rays slightly below the horizon (past the ground plane's edge) reuse the horizon color
                    float3 skyDir = normalize(float3(rd.x, max(rd.y, 0.0), rd.z));
                    float3 skyTransmittance;
                    float3 sky = SkyRadiance(ro, skyDir, skyTransmittance);

                    // Sun disk (~0.5 degree radius)
                    float sunDisk = smoothstep(0.99994, 0.99997, dot(rd, _SkySunDir));
                    sky += sunDisk * skyTransmittance * _SkySunIntensity * 20.0;

                    float entryDistance;
                    float4 clouds = MarchClouds(ro, rd, planetCenter, input.positionCS.xy, entryDistance);
                    // Fade distant clouds into the sky as a cheap stand-in for aerial perspective
                    float fade = exp(-entryDistance * 3e-5);
                    color = sky * lerp(1.0, clouds.a, fade) + clouds.rgb * fade;
                }

                // Debug: weather map around the camera (+-30 km) in a screen corner
                if (_DebugWeather > 0.5 && uv.x < 0.3 && uv.y < 0.3)
                {
                    float2 xz = _WorldSpaceCameraPos.xz + (uv / 0.3 - 0.5) * 60000.0;
                    float2 weather = WeatherMap(xz);
                    color = float3(weather.x, weather.y * 0.6, 0.0);
                }

                return half4(color, 1.0);
            }
            ENDHLSL
        }
    }
}
