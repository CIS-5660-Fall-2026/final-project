using Unity.Collections;
using UnityEngine;
using UnityEngine.Rendering;
using UnityEngine.Rendering.Universal;

/// <summary>
/// Auto exposure (eye adaptation) driven by the sky. URP has no built-in auto exposure, so this measures the
/// average luminance of the upper hemisphere from the sky-view LUTs (async GPU readback, no stall), turns it into
/// an exposure value and applies it through a hidden global Volume with Color Adjustments > Post Exposure.
/// It also sets the scene's ambient light from the same measurement, so objects darken at night with the sky.
/// Both LUTs are computed for an intensity of 1, so the measurement is per unit of sun / moon intensity and the
/// current intensities from SkyController are applied on the CPU.
/// </summary>
[ExecuteAlways]
[RequireComponent(typeof(SkyController), typeof(SkyLUTRenderer))]
public class SkyExposure : MonoBehaviour
{
    public bool autoExposure = true;
    [Tooltip("Average sky luminance that maps to EV 0. Around the daytime sky luminance keeps the day look unchanged.")]
    public float targetLuminance = 1.2f;
    [Tooltip("Added to the measured exposure, in EV")]
    public float exposureBias = 0f;
    [Tooltip("Lowest and highest exposure. A max below full compensation keeps nights darker than days.")]
    public float minEV = -1f;
    public float maxEV = 2.5f;
    [Tooltip("How fast the exposure adapts, in 1/s (Play mode only)")]
    public float adaptationSpeed = 1.5f;
    [Range(1, 30)] public int readbackInterval = 5;

    [Header("Ambient Light")]
    public bool driveAmbientLight = true;
    [Tooltip("Scales the measured sky radiance into the scene's ambient light")]
    public float ambientStrength = 1f;

    /// <summary>Exposure currently applied, in EV</summary>
    public float CurrentEV { get; private set; }
    /// <summary>Measured average sky luminance, before exposure</summary>
    public float SkyLuminance { get; private set; }

    SkyController controller;
    SkyLUTRenderer lutRenderer;

    GameObject volumeObject;
    VolumeProfile profile;
    ColorAdjustments colorAdjustments;

    // Average upper-hemisphere radiance per unit of sun / moon intensity
    Vector3 sunSkyPerUnit, moonSkyPerUnit;
    bool hasSunMeasurement, hasMoonMeasurement, sunPending, moonPending;
    int frameCounter;
    double lastTime;

    void OnEnable()
    {
        controller = GetComponent<SkyController>();
        lutRenderer = GetComponent<SkyLUTRenderer>();

        volumeObject = new GameObject("Skyward Exposure Volume") { hideFlags = HideFlags.HideAndDontSave };
        var volume = volumeObject.AddComponent<Volume>();
        volume.isGlobal = true;
        volume.priority = 100f;
        profile = ScriptableObject.CreateInstance<VolumeProfile>();
        profile.hideFlags = HideFlags.HideAndDontSave;
        colorAdjustments = profile.Add<ColorAdjustments>(false);
        colorAdjustments.postExposure.overrideState = true;
        volume.sharedProfile = profile;

        lastTime = Time.realtimeSinceStartupAsDouble;
    }

    void OnDisable()
    {
        DestroyObject(volumeObject);
        DestroyObject(profile);
        volumeObject = null;
        profile = null;
        colorAdjustments = null;
    }

    void Update()
    {
        double now = Time.realtimeSinceStartupAsDouble;
        float dt = Mathf.Min((float)(now - lastTime), 0.25f);
        lastTime = now;

        if (++frameCounter % readbackInterval == 0)
            RequestReadbacks();

        Apply(dt);
    }

    void Apply(float dt)
    {
        if (colorAdjustments == null || controller == null)
            return;

        float targetEV = exposureBias;
        bool measured = hasSunMeasurement && hasMoonMeasurement;
        if (measured)
        {
            Vector3 skyRadiance = sunSkyPerUnit * controller.sunIntensity + Vector3.Scale(moonSkyPerUnit, controller.MoonRadiance);
            SkyLuminance = Luminance(skyRadiance);
            if (autoExposure)
                targetEV = Mathf.Clamp(Mathf.Log(targetLuminance / Mathf.Max(SkyLuminance, 1e-6f), 2f), minEV, maxEV) + exposureBias;

            if (driveAmbientLight)
                ApplyAmbient(skyRadiance);
        }

        // Exponential adaptation in Play mode; jump straight to the target while editing
        if (Application.isPlaying && measured)
            CurrentEV = Mathf.Lerp(CurrentEV, targetEV, 1f - Mathf.Exp(-dt * adaptationSpeed));
        else
            CurrentEV = targetEV;
        colorAdjustments.postExposure.value = CurrentEV;
    }

    // The sky shader and the directional light use different units (Sun Intensity vs Sun Light Intensity),
    // so convert the sky radiance with the same ratio before using it as ambient light.
    void ApplyAmbient(Vector3 skyRadiance)
    {
        float unitScale = controller.sunLightIntensity / Mathf.Max(controller.sunIntensity, 1e-3f);
        Vector3 ambient = skyRadiance * (unitScale * Mathf.PI * ambientStrength);
        var color = new Color(ambient.x, ambient.y, ambient.z);

        RenderSettings.ambientMode = AmbientMode.Flat;
        RenderSettings.ambientLight = color.gamma;
        var probe = new SphericalHarmonicsL2();
        probe.AddAmbientLight(color);
        RenderSettings.ambientProbe = probe;
    }

    void RequestReadbacks()
    {
        if (lutRenderer == null)
            return;

        RenderTexture sunLut = lutRenderer.SkyViewLut;
        if (sunLut != null && sunLut.IsCreated() && !sunPending)
        {
            sunPending = true;
            AsyncGPUReadback.Request(sunLut, 0, request =>
            {
                if (this == null)
                    return;
                sunPending = false;
                if (request.hasError)
                    return;
                sunSkyPerUnit = AverageUpperHemisphere(request);
                hasSunMeasurement = true;
                OnMeasurement();
            });
        }

        RenderTexture moonLut = lutRenderer.SkyViewMoonLut;
        if (moonLut != null && moonLut.IsCreated() && !moonPending)
        {
            moonPending = true;
            AsyncGPUReadback.Request(moonLut, 0, request =>
            {
                if (this == null)
                    return;
                moonPending = false;
                if (request.hasError)
                    return;
                moonSkyPerUnit = AverageUpperHemisphere(request);
                hasMoonMeasurement = true;
                OnMeasurement();
            });
        }
    }

    // Outside Play mode Update only runs when something changes, so apply new measurements right away
    void OnMeasurement()
    {
        if (!Application.isPlaying)
            Apply(0f);
    }

    /// <summary>
    /// Solid-angle weighted average radiance of the sky above the horizon. Rows follow the sky-view LUT
    /// latitude mapping (SkyCommon.hlsl): latitude = s^2 * pi/2 with s = 2v - 1, so a row covers
    /// d(latitude) proportional to s, and the solid angle is that times cos(latitude). Columns are uniform in azimuth.
    /// </summary>
    static Vector3 AverageUpperHemisphere(AsyncGPUReadbackRequest request)
    {
        NativeArray<ushort> data = request.GetData<ushort>();
        int width = request.width;
        int height = request.height;

        double r = 0.0, g = 0.0, b = 0.0, weightSum = 0.0;
        for (int y = 0; y < height; y++)
        {
            float s = 2f * y / (height - 1f) - 1f;
            if (s <= 0f)
                continue;
            float latitude = s * s * 0.5f * Mathf.PI;
            double weight = Mathf.Cos(latitude) * s;

            for (int x = 0; x < width; x++)
            {
                int i = (y * width + x) * 4;
                r += weight * Mathf.HalfToFloat(data[i]);
                g += weight * Mathf.HalfToFloat(data[i + 1]);
                b += weight * Mathf.HalfToFloat(data[i + 2]);
                weightSum += weight;
            }
        }
        if (weightSum <= 0.0)
            return Vector3.zero;
        return new Vector3((float)(r / weightSum), (float)(g / weightSum), (float)(b / weightSum));
    }

    static float Luminance(Vector3 c)
    {
        return 0.2126f * c.x + 0.7152f * c.y + 0.0722f * c.z;
    }

    static void DestroyObject(Object obj)
    {
        if (obj == null)
            return;
        if (Application.isPlaying)
            Destroy(obj);
        else
            DestroyImmediate(obj);
    }
}
