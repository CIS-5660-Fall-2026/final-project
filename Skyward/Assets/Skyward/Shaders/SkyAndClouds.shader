// Skyward - procedural sky + volumetric clouds, drawn by a URP Full Screen Pass Renderer Feature.
//
// Every optimization has a material toggle, so it can be compared against the Milestone 1 brute-force path:
//   _SKY_LUT        sky from the sky-view LUT (single + multiple scattering, Hillaire 2020) and sun transmittance
//                   from the transmittance LUT, instead of a per-pixel single-scattering raymarch
//   _BAKED_WEATHER  weather map sampled from the per-frame baked texture instead of 5 noise octaves per sample
//   _BAKED_NOISE    cloud shape / detail noise sampled from baked tileable 3D textures
// LUTs and the weather map are produced by SkyLUTRenderer.cs + SkyLUT.compute, the 3D noise by NoiseBaker.cs.
//
// Clouds: raymarched spherical shell, Perlin-Worley base + Worley detail (Schneider 2015), Beer-Lambert,
// dual-lobe HG phase, powder and energy-conserving multi-scattering octaves (Wrenninge 2013, Hillaire 2016).
// Per-scene parameters (sun, coverage, wind, time...) are global shader properties set by SkyController.cs.

Shader "Skyward/SkyAndClouds"
{
    Properties
    {
        _SkySteps ("Sky Steps (no LUT)", Range(8, 32)) = 16
        _CloudSteps ("Cloud Steps", Range(16, 128)) = 48
        _LightSteps ("Cloud Light Steps", Range(2, 8)) = 4
        _CloudExtinction ("Cloud Extinction (1/m)", Range(0.001, 0.1)) = 0.02
        _BaseScale ("Cloud Base Noise Scale (m)", Float) = 9000
        _DetailScale ("Cloud Detail Noise Scale (m)", Float) = 1500

        [Header(Optimizations)]
        [Toggle(_SKY_LUT)] _SkyLut ("Use Atmosphere LUTs", Float) = 0
        [Toggle(_BAKED_WEATHER)] _BakedWeather ("Use Baked Weather Map", Float) = 0
        [Toggle(_BAKED_NOISE)] _BakedNoise ("Use Baked Noise", Float) = 0
        [NoScaleOffset] _BaseNoise ("Base Noise (3D)", 3D) = "white" {}
        [NoScaleOffset] _DetailNoise ("Detail Noise (3D)", 3D) = "white" {}
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
            #pragma shader_feature_local _BAKED_NOISE
            #pragma shader_feature_local _SKY_LUT
            #pragma shader_feature_local _BAKED_WEATHER

            #include "Packages/com.unity.render-pipelines.universal/ShaderLibrary/Core.hlsl"
            #include "Packages/com.unity.render-pipelines.core/Runtime/Utilities/Blit.hlsl"
            #include "Packages/com.unity.render-pipelines.universal/ShaderLibrary/DeclareDepthTexture.hlsl"
            #include "SkyCommon.hlsl"

            // Material properties
            float _SkySteps;
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

            // Baked weather map (SkyLUTRenderer.cs)
            TEXTURE2D(_WeatherMapTex);
            float4 _WeatherOrigin;      // xy = world xz of the map center, z = map size in meters

            // Global properties set by SkyController.cs
            float3 _SkySunDir;          // unit vector pointing towards the sun
            float  _SkySunIntensity;
            float  _SkyTime;            // seconds, drives wind and weather evolution
            float  _CloudCoverage;      // 0 = clear, 1 = overcast
            float2 _CloudWind;          // m/s in world xz
            float  _CloudBottom;        // m above ground
            float  _CloudTop;           // m above ground
            float  _CloudDensity;
            float  _WeatherScale;       // m per weather noise unit
            float  _DebugWeather;
            float3 _SkyMoonDir;         // unit vector pointing towards the moon
            float3 _SkyMoonRadiance;    // moon tint * intensity
            float  _SkyStarIntensity;   // already faded out during the day
            float4x4 _SkyStarMatrix;    // world -> rotating star frame
            float3 _SkyCloudLightDir;   // sun or moon, whichever lights the scene more
            float3 _SkyCloudLightColor; // its color * intensity, before atmospheric transmittance
            float3 _SkyCloudAmbient;

            float InterleavedGradient(float2 pixel)
            {
                return frac(52.9829189 * frac(dot(pixel, float2(0.06711056, 0.00583715))));
            }

            // ---------------------------------------------------------------------------------
            // Atmosphere
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

            float3 SunTransmittanceRaymarch(float3 p)
            {
                return LightTransmittanceRaymarch(p, _SkySunDir);
            }

            // Brute-force single-scattering sky radiance along a view ray (Milestone 1 path)
            float3 SkyRadianceRaymarch(float3 ro, float3 rd, out float3 transmittance)
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

                    float3 scattering = (rayleighScat * phaseR + mieScat * phaseM) * SunTransmittanceRaymarch(pos);
                    float3 stepTransmittance = exp(-extinction * dt);
                    // Energy-conserving integration over the step (Hillaire 2016)
                    radiance += throughput * (scattering - scattering * stepTransmittance) / max(extinction, 1e-10);
                    throughput *= stepTransmittance;
                }

                transmittance = throughput;
                return radiance * _SkySunIntensity;
            }

            // ro: camera in planet space (at the north pole), rd: view direction above the horizon
            float3 SkyRadiance(float3 ro, float3 rd, out float3 transmittance)
            {
            #if defined(_SKY_LUT)
                transmittance = SampleTransmittanceLUT(ro.y, rd.y);
                float3 sunSky = SAMPLE_TEXTURE2D_LOD(_SkyViewLUT, sampler_LinearClamp, SkyViewDirToUv(rd, _SkySunDir), 0).rgb;
                float3 moonSky = SAMPLE_TEXTURE2D_LOD(_SkyViewMoonLUT, sampler_LinearClamp, SkyViewDirToUv(rd, _SkyMoonDir), 0).rgb;
                return sunSky * _SkySunIntensity + moonSky * _SkyMoonRadiance;
            #else
                return SkyRadianceRaymarch(ro, rd, transmittance);
            #endif
            }

            // Procedural stars: one candidate star per cell of a 3D grid around the unit sphere. The grid lives in a
            // star frame that SkyController rotates with the time of day, so the stars turn with the sky.
            float3 StarField(float3 dir)
            {
                if (_SkyStarIntensity <= 0.0)
                    return 0.0;

                float3 p = mul((float3x3)_SkyStarMatrix, dir) * 250.0;
                float3 cell = floor(p);
                float3 h = SkyHash33(cell + 71.0);
                if (h.x < 0.97)
                    return 0.0;

                // Star position inside the cell, a small soft dot around it
                float3 offset = frac(p) - (0.25 + 0.5 * SkyHash33(cell + 13.0));
                float dot2 = dot(offset, offset);
                float brightness = pow(h.y, 6.0) * 0.6 + 0.02;
                float3 color = lerp(float3(1.0, 0.8, 0.6), float3(0.7, 0.8, 1.0), h.z);
                // ~1-2 pixels wide at 1080p, so stars do not flicker as sub-pixel points
                return color * brightness * exp(-dot2 * 25.0) * _SkyStarIntensity;
            }

            // Full moon: a disk with procedural maria (dark patches) and limb darkening. Unlike the sun disk it is not
            // pushed far into HDR, so it reads as a lit surface instead of a glowing light source.
            float3 MoonDisk(float3 rd)
            {
                const float radius = 0.0085;     // ~0.5 degree, larger than the real moon for readability
                float cosAngle = dot(rd, _SkyMoonDir);
                if (cosAngle < cos(radius * 1.2))
                    return 0.0;

                // 2D coordinates on the disk, in units of the disk radius
                float3 right = normalize(cross(abs(_SkyMoonDir.y) < 0.999 ? float3(0, 1, 0) : float3(1, 0, 0), _SkyMoonDir));
                float3 up = cross(_SkyMoonDir, right);
                float2 uv = float2(dot(rd, right), dot(rd, up)) / radius;
                float r2 = dot(uv, uv);

                float edge = 1.0 - smoothstep(0.9, 1.0, r2);   // antialiased rim
                float limb = 0.6 + 0.4 * sqrt(saturate(1.0 - r2));
                float maria = PerlinFbm(float3(uv * 2.5, 3.7), 4);
                float albedo = lerp(0.55, 1.0, smoothstep(0.4, 0.62, maria));
                return _SkyMoonRadiance * 3.0 * albedo * limb * edge;
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
                return WeatherMapProcedural(xz, _SkyTime, _CloudWind, _CloudCoverage, _WeatherScale);
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
                    float3 pos = p + _SkyCloudLightDir * (t - 0.5 * dt);
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

                    // Objects beyond the atmosphere: sun and moon disks (~0.5 degree radius) and stars,
                    // dimmed near the horizon by the atmosphere
                    float sunDisk = smoothstep(0.99994, 0.99997, dot(rd, _SkySunDir));
                    float3 space = sunDisk * _SkySunIntensity * 20.0 + MoonDisk(rd) + StarField(skyDir);
                    space *= skyTransmittance;

                    float entryDistance;
                    float4 clouds = MarchClouds(ro, rd, planetCenter, input.positionCS.xy, entryDistance);
                    // Fade distant clouds into the sky as a cheap stand-in for aerial perspective.
                    // The fade only applies to the atmosphere in front of the clouds: anything beyond the atmosphere
                    // is always behind the clouds, so it is blocked by their full transmittance (no stars through
                    // distant clouds).
                    float fade = exp(-entryDistance * 3e-5);
                    color = sky * lerp(1.0, clouds.a, fade) + clouds.rgb * fade + space * clouds.a;
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
