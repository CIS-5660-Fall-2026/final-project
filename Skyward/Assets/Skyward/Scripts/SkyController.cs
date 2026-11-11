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

    [Header("Clouds")]
    [Range(0f, 1f)] public float coverage = 0.5f;
    public Vector2 windDirection = new Vector2(1f, 0.3f);
    public float windSpeed = 20f;
    public float cloudBottom = 1500f;
    public float cloudTop = 4000f;
    [Range(0f, 2f)] public float cloudDensity = 1f;
    public bool debugWeatherMap = false;

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
        Quaternion rotation = Quaternion.Euler(elevation, sunAzimuth, 0f);
        Vector3 sunDir = -(rotation * Vector3.forward);

        if (sun != null)
        {
            sun.transform.rotation = rotation;
            Vector3 t = SunTransmittance(sunDir);
            float fade = Mathf.SmoothStep(0f, 1f, Mathf.InverseLerp(-0.02f, 0.08f, sunDir.y));
            sun.color = new Color(t.x, t.y, t.z).gamma;
            sun.intensity = sunLightIntensity * fade;
        }

        Shader.SetGlobalVector(SunDirId, sunDir);
        Shader.SetGlobalFloat(SunIntensityId, sunIntensity);
        Shader.SetGlobalFloat(CoverageId, coverage);
        Shader.SetGlobalVector(WindId, windDirection.normalized * windSpeed);
        Shader.SetGlobalFloat(BottomId, cloudBottom);
        Shader.SetGlobalFloat(TopId, cloudTop);
        Shader.SetGlobalFloat(DensityId, cloudDensity);
        Shader.SetGlobalFloat(DebugWeatherId, debugWeatherMap ? 1f : 0f);
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
