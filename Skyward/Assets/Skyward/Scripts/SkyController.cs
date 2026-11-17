using UnityEngine;

/// <summary>
/// Drives time of day, the sun light and the cloud parameters used by the Skyward/SkyAndClouds shader.
/// All values are pushed as global shader properties, so the full-screen material needs no per-frame setup.
/// </summary>
[ExecuteAlways]
public class SkyController : MonoBehaviour
{
    [Header("Time of Day")]
    public Light sun;
    [Range(0f, 24f)] public float timeOfDay = 10f;
    [Range(0f, 360f)] public float sunAzimuth = 30f;
    public bool animateTime = false;
    public float hoursPerSecond = 0.5f;

    [Header("Lighting")]
    [Tooltip("Sun illuminance used by the sky and cloud shader")]
    public float sunIntensity = 20f;
    [Tooltip("Intensity of the directional light at noon")]
    public float sunLightIntensity = 2f;

    [Header("Night")]
    [Tooltip("Moon illuminance in the same units as Sun Intensity. The moon sits opposite the sun (full moon).")]
    public float moonIntensity = 0.5f;
    [ColorUsage(false)] public Color moonTint = new Color(0.75f, 0.85f, 1f);
    [Range(0f, 5f)] public float starIntensity = 1f;

    [Header("Clouds")]
    [Range(0f, 1f)] public float coverage = 0.5f;
    public Vector2 windDirection = new Vector2(1f, 0.3f);
    public float windSpeed = 20f;
    public float cloudBottom = 1500f;
    public float cloudTop = 4000f;
    [Range(0f, 2f)] public float cloudDensity = 1f;
    [Tooltip("Meters per weather noise unit: larger values give larger cloud regions")]
    public float weatherScale = 20000f;
    [Tooltip("How strongly curl noise swirls the weather map: 0 = clouds only drift with the wind")]
    [Range(0f, 1f)] public float curlStrength = 0.4f;
    public bool debugWeatherMap = false;
    [Tooltip("Show the sky-view, transmittance and multi-scattering LUTs in the top-right corner")]
    public bool debugLuts = false;
    [Tooltip("Stop wind and weather evolution, so screenshots and GPU timings compare the same clouds")]
    public bool freezeClouds = false;

    float skyTime;

    // Atmosphere constants, must match SkyAndClouds.shader
    const double PlanetRadius = 6360e3;
    const double AtmosphereRadius = 6460e3;
    static readonly Vector3 RayleighScattering = new Vector3(5.802f, 13.558f, 33.1f) * 1e-6f;
    const double RayleighHeight = 8000.0;
    const double MieExtinction = 4.40e-6;
    const double MieHeight = 1200.0;
    static readonly Vector3 OzoneAbsorption = new Vector3(0.650f, 1.881f, 0.085f) * 1e-6f;

    static readonly int SunDirId = Shader.PropertyToID("_SkySunDir");
    static readonly int SunIntensityId = Shader.PropertyToID("_SkySunIntensity");
    static readonly int CoverageId = Shader.PropertyToID("_CloudCoverage");
    static readonly int WindId = Shader.PropertyToID("_CloudWind");
    static readonly int BottomId = Shader.PropertyToID("_CloudBottom");
    static readonly int TopId = Shader.PropertyToID("_CloudTop");
    static readonly int DensityId = Shader.PropertyToID("_CloudDensity");
    static readonly int DebugWeatherId = Shader.PropertyToID("_DebugWeather");
    static readonly int WeatherScaleId = Shader.PropertyToID("_WeatherScale");
    static readonly int SkyTimeId = Shader.PropertyToID("_SkyTime");
    static readonly int CurlId = Shader.PropertyToID("_CloudCurl");
    static readonly int DebugLutsId = Shader.PropertyToID("_DebugLUTs");
    static readonly int MoonDirId = Shader.PropertyToID("_SkyMoonDir");
    static readonly int MoonRadianceId = Shader.PropertyToID("_SkyMoonRadiance");
    static readonly int StarIntensityId = Shader.PropertyToID("_SkyStarIntensity");
    static readonly int StarMatrixId = Shader.PropertyToID("_SkyStarMatrix");
    static readonly int CloudLightDirId = Shader.PropertyToID("_SkyCloudLightDir");
    static readonly int CloudLightColorId = Shader.PropertyToID("_SkyCloudLightColor");
    static readonly int CloudAmbientId = Shader.PropertyToID("_SkyCloudAmbient");

    static readonly Vector3 CloudAmbientTint = new Vector3(0.4f, 0.55f, 0.85f);

    /// <summary>Moon color times intensity, in sky shader units</summary>
    public Vector3 MoonRadiance => new Vector3(moonTint.r, moonTint.g, moonTint.b) * moonIntensity;

    void Update()
    {
        if (animateTime && Application.isPlaying)
            timeOfDay = Mathf.Repeat(timeOfDay + Time.deltaTime * hoursPerSecond, 24f);
        Apply();
    }

    void OnValidate()
    {
        cloudTop = Mathf.Max(cloudTop, cloudBottom + 100f);
        Apply();
    }

    void Apply()
    {
        // 6:00 sunrise (elevation 0), 12:00 zenith, 18:00 sunset, night below the horizon
        float elevation = (timeOfDay - 6f) / 24f * 360f;
        Quaternion sunRotation = Quaternion.Euler(elevation, sunAzimuth, 0f);
        Quaternion moonRotation = Quaternion.Euler(elevation + 180f, sunAzimuth, 0f);
        Vector3 sunDir = -(sunRotation * Vector3.forward);
        Vector3 moonDir = -sunDir;
        Vector3 moonRadiance = MoonRadiance;

        // One directional light: it follows whichever of the sun and the moon lights the scene more.
        // The moon light uses the same sky-to-light unit ratio as the sun, so day and night stay consistent.
        Vector3 sunTransmittance = SunTransmittance(sunDir);
        Vector3 moonTransmittance = SunTransmittance(moonDir);
        float sunLight = sunLightIntensity * HorizonFade(sunDir.y);
        float moonLight = sunLightIntensity * (moonIntensity / Mathf.Max(sunIntensity, 1e-3f)) * HorizonFade(moonDir.y);
        bool moonIsMain = moonLight > sunLight;

        if (sun != null)
        {
            sun.transform.rotation = moonIsMain ? moonRotation : sunRotation;
            Vector3 lightColor = moonIsMain ? Vector3.Scale(moonTransmittance, (Vector3)(Vector4)moonTint) : sunTransmittance;
            sun.color = new Color(lightColor.x, lightColor.y, lightColor.z).gamma;
            sun.intensity = Mathf.Max(sunLight, moonLight);
        }

        // Clouds are lit by the same dominant light (the shader applies the atmospheric transmittance itself)
        Vector3 cloudLightDir = moonIsMain ? moonDir : sunDir;
        Vector3 cloudLightColor = moonIsMain ? moonRadiance : Vector3.one * sunIntensity;
        Vector3 cloudAmbient = CloudAmbientTint * 0.05f * sunIntensity * Mathf.Clamp01(sunDir.y * 3f + 0.15f)
                             + Vector3.Scale(CloudAmbientTint, moonRadiance) * 0.05f * Mathf.Clamp01(moonDir.y * 3f + 0.15f);

        // Stars turn with the sky: the same rotation that moves the sun along its path, around the same axis
        Vector3 rotationAxis = Quaternion.Euler(0f, sunAzimuth, 0f) * Vector3.right;
        Matrix4x4 starMatrix = Matrix4x4.Rotate(Quaternion.AngleAxis(-elevation, rotationAxis));
        float night = 1f - Mathf.SmoothStep(0f, 1f, Mathf.InverseLerp(-0.12f, 0.02f, sunDir.y));

        Shader.SetGlobalVector(SunDirId, sunDir);
        Shader.SetGlobalFloat(SunIntensityId, sunIntensity);
        Shader.SetGlobalVector(MoonDirId, moonDir);
        Shader.SetGlobalVector(MoonRadianceId, moonRadiance);
        Shader.SetGlobalFloat(StarIntensityId, starIntensity * night);
        Shader.SetGlobalMatrix(StarMatrixId, starMatrix);
        Shader.SetGlobalVector(CloudLightDirId, cloudLightDir);
        Shader.SetGlobalVector(CloudLightColorId, cloudLightColor);
        Shader.SetGlobalVector(CloudAmbientId, cloudAmbient);
        Shader.SetGlobalFloat(CoverageId, coverage);
        Shader.SetGlobalVector(WindId, windDirection.normalized * windSpeed);
        Shader.SetGlobalFloat(BottomId, cloudBottom);
        Shader.SetGlobalFloat(TopId, cloudTop);
        Shader.SetGlobalFloat(DensityId, cloudDensity);
        Shader.SetGlobalFloat(DebugWeatherId, debugWeatherMap ? 1f : 0f);
        Shader.SetGlobalFloat(WeatherScaleId, weatherScale);
        Shader.SetGlobalFloat(CurlId, curlStrength);
        Shader.SetGlobalFloat(DebugLutsId, debugLuts ? 1f : 0f);
        // One clock for the fragment shader and the weather-map compute, so the baked map and the cloud noise
        // scroll together. Outside Play mode Time.time does not advance, so use the real-time clock instead.
        if (!freezeClouds)
            skyTime = Application.isPlaying ? Time.time : (float)(Time.realtimeSinceStartupAsDouble % 3600.0);
        Shader.SetGlobalFloat(SkyTimeId, skyTime);
    }

    // 0 below the horizon, 1 a few degrees above it
    static float HorizonFade(float elevationSin)
    {
        return Mathf.SmoothStep(0f, 1f, Mathf.InverseLerp(-0.02f, 0.08f, elevationSin));
    }

    /// <summary>
    /// Atmospheric transmittance from the ground towards the sun, same model as the shader.
    /// Used to tint the directional light (warm at sunset). Doubles avoid precision loss at planet scale.
    /// </summary>
    static Vector3 SunTransmittance(Vector3 dir)
    {
        double px = 0.0, py = PlanetRadius + 1.0, pz = 0.0;
        double b = py * dir.y;

        // Sun below the horizon: the planet blocks it
        double cGround = (py - PlanetRadius) * (py + PlanetRadius);
        double hGround = b * b - cGround;
        if (hGround > 0.0 && -b - System.Math.Sqrt(hGround) > 0.0)
            return Vector3.zero;

        double cTop = (py - AtmosphereRadius) * (py + AtmosphereRadius);
        double tTop = -b + System.Math.Sqrt(b * b - cTop);

        const int steps = 32;
        double dt = tTop / steps;
        double odRayleigh = 0.0, odMie = 0.0, odOzone = 0.0;
        for (int i = 0; i < steps; i++)
        {
            double t = (i + 0.5) * dt;
            double x = px + dir.x * t, y = py + dir.y * t, z = pz + dir.z * t;
            double height = System.Math.Sqrt(x * x + y * y + z * z) - PlanetRadius;
            odRayleigh += System.Math.Exp(-height / RayleighHeight) * dt;
            odMie += System.Math.Exp(-height / MieHeight) * dt;
            odOzone += System.Math.Max(0.0, 1.0 - System.Math.Abs(height - 25000.0) / 15000.0) * dt;
        }

        Vector3 opticalDepth = RayleighScattering * (float)odRayleigh
                             + Vector3.one * (float)(MieExtinction * odMie)
                             + OzoneAbsorption * (float)odOzone;
        return new Vector3(Mathf.Exp(-opticalDepth.x), Mathf.Exp(-opticalDepth.y), Mathf.Exp(-opticalDepth.z));
    }
}
