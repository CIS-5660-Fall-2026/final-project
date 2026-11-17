using System.Linq;
using UnityEngine;
using UnityEngine.Profiling;
using UnityEngine.Rendering.Universal;

/// <summary>
/// On-screen GPU timing for the sky pass. Unity's GPU Usage profiler module does not show URP passes,
/// so this reads the whole-frame GPU time from FrameTimingManager and lets you switch the sky pass and
/// the baked noise on and off: the difference in GPU frame time is the cost of that pass or feature.
/// It also tries the pass's own GPU profiling marker, which is shown as n/a when the platform does not report it.
/// </summary>
public class SkyProfilerHUD : MonoBehaviour
{
    public FullScreenPassRendererFeature skyFeature;
    public string passMarkerName = "SkyAndClouds";
    [Range(10, 240)] public int averageFrames = 60;

    readonly FrameTiming[] timings = new FrameTiming[1];
    Recorder passRecorder;

    double gpuSum, cpuSum, passSum;
    int frameCount;
    float gpuFrameMs, cpuFrameMs, passGpuMs;

    void OnEnable()
    {
        passRecorder = Recorder.Get(passMarkerName);
        passRecorder.enabled = true;
    }

    void OnDisable()
    {
        if (passRecorder != null)
            passRecorder.enabled = false;
        // Never leave the sky switched off in the renderer asset
        if (skyFeature != null)
            skyFeature.SetActive(true);
    }

    void Update()
    {
        FrameTimingManager.CaptureFrameTimings();
        if (FrameTimingManager.GetLatestTimings(1, timings) > 0)
        {
            gpuSum += timings[0].gpuFrameTime;
            cpuSum += timings[0].cpuFrameTime;
        }
        if (passRecorder != null && passRecorder.isValid)
            passSum += passRecorder.gpuElapsedNanoseconds / 1e6;

        frameCount++;
        if (frameCount >= averageFrames)
        {
            gpuFrameMs = (float)(gpuSum / frameCount);
            cpuFrameMs = (float)(cpuSum / frameCount);
            passGpuMs = (float)(passSum / frameCount);
            gpuSum = cpuSum = passSum = 0.0;
            frameCount = 0;
        }
    }

    void OnGUI()
    {
        GUILayout.BeginArea(new Rect(10, 10, 320, 215), GUI.skin.box);
        GUILayout.Label($"GPU frame: {gpuFrameMs:F2} ms   (avg of {averageFrames})");
        GUILayout.Label($"CPU frame: {cpuFrameMs:F2} ms");
        GUILayout.Label(passGpuMs > 0f ? $"Sky pass marker: {passGpuMs:F2} ms" : "Sky pass marker: n/a");
        var exposure = GetComponent<SkyExposure>();
        if (exposure != null && exposure.enabled)
            GUILayout.Label($"Exposure: {exposure.CurrentEV:+0.00;-0.00} EV   sky lum {exposure.SkyLuminance:F3}");

        if (skyFeature != null)
        {
            bool active = GUILayout.Toggle(skyFeature.isActive, " Sky pass enabled");
            if (active != skyFeature.isActive)
                skyFeature.SetActive(active);

            Material material = skyFeature.passMaterial;
            if (material != null)
            {
                KeywordToggle(material, "_SKY_LUT", "_SkyLut", " Atmosphere LUTs");
                KeywordToggle(material, "_BAKED_WEATHER", "_BakedWeather", " Baked weather map");
                KeywordToggle(material, "_BAKED_NOISE", "_BakedNoise", " Baked noise");
            }
        }
        else
        {
            GUILayout.Label("Sky feature not assigned");
        }
        GUILayout.EndArea();
    }

    // Shows a material keyword as a checkbox. The float property keeps the material inspector's [Toggle] in sync.
    static void KeywordToggle(Material material, string keyword, string floatProperty, string label)
    {
        bool enabled = material.IsKeywordEnabled(keyword);
        bool newEnabled = GUILayout.Toggle(enabled, label);
        if (newEnabled == enabled)
            return;

        if (newEnabled)
            material.EnableKeyword(keyword);
        else
            material.DisableKeyword(keyword);
        material.SetFloat(floatProperty, newEnabled ? 1f : 0f);
    }

#if UNITY_EDITOR
    void Reset() => FindSkyFeature();

    void OnValidate()
    {
        if (skyFeature == null)
            FindSkyFeature();
    }

    void FindSkyFeature()
    {
        var rendererData = UnityEditor.AssetDatabase.LoadAssetAtPath<UniversalRendererData>("Assets/Settings/PC_Renderer.asset");
        if (rendererData != null)
        {
            skyFeature = rendererData.rendererFeatures
                .OfType<FullScreenPassRendererFeature>()
                .FirstOrDefault(f => f != null && f.name == "SkyAndClouds");
        }
    }
#endif
}
