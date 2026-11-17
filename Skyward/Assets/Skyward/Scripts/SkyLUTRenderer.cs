using System.Collections.Generic;
using UnityEngine;
using UnityEngine.Experimental.Rendering;
using UnityEngine.Rendering;

/// <summary>
/// Computes the atmosphere LUTs (Hillaire 2020), the weather map and the low-resolution clouds with
/// SkyLUT.compute, and binds them as global textures for Skyward/SkyAndClouds.
///   Transmittance and multi-scattering LUTs: computed once (they only depend on the atmosphere constants).
///   Sky-view LUTs, weather map and low-resolution clouds: computed per camera, right before that camera renders,
///   because they depend on the camera, the sun and the time.
/// Reads the sun / cloud globals that SkyController sets, so it must run alongside a SkyController.
/// </summary>
[ExecuteAlways]
public class SkyLUTRenderer : MonoBehaviour
{
    public enum CloudResolution
    {
        Half = 2,       // half width and height: 1/4 of the pixels
        Quarter = 4,    // quarter width and height: 1/16 of the pixels
    }

    public ComputeShader lutCompute;

    [Header("Weather Map")]
    public int weatherResolution = 512;
    [Tooltip("Size of the baked weather map around the camera, in meters")]
    public float weatherExtent = 240000f;

    [Header("Low-Resolution Clouds")]
    [Tooltip("Sky material: its 'Low-Resolution Clouds' toggle enables this path, and its cloud settings are copied to the compute shader")]
    public Material skyMaterial;
    public CloudResolution cloudResolution = CloudResolution.Half;

    const string LowResKeyword = "_CLOUDS_LOWRES";
    // Material properties the compute shader needs (declared in SkyClouds.hlsl)
    static readonly string[] MaterialFloats = { "_CloudSteps", "_LightSteps", "_CloudExtinction", "_BaseScale", "_DetailScale" };
    static readonly string[] MaterialTextures = { "_BaseNoise", "_DetailNoise", "_BlueNoise" };
    // Globals set by SkyController that the compute shader needs (besides the ones already copied below)
    static readonly string[] GlobalFloats = { "_CloudBottom", "_CloudTop", "_CloudDensity" };
    static readonly string[] GlobalVectors = { "_SkyCloudLightDir", "_SkyCloudLightColor", "_SkyCloudAmbient" };

    // Must match the sizes in SkyCommon.hlsl
    const int TransmittanceWidth = 256;
    const int TransmittanceHeight = 64;
    const int MultiScatSize = 32;
    const int SkyViewWidth = 192;
    const int SkyViewHeight = 108;

    static readonly int TransmittanceLutId = Shader.PropertyToID("_TransmittanceLUT");
    static readonly int MultiScatteringLutId = Shader.PropertyToID("_MultiScatteringLUT");
    static readonly int SkyViewLutId = Shader.PropertyToID("_SkyViewLUT");
    static readonly int SkyViewMoonLutId = Shader.PropertyToID("_SkyViewMoonLUT");
    static readonly int MoonDirId = Shader.PropertyToID("_SkyMoonDir");
    static readonly int WeatherMapId = Shader.PropertyToID("_WeatherMapTex");
    static readonly int TransmittanceOutId = Shader.PropertyToID("_TransmittanceLUTOut");
    static readonly int MultiScatteringOutId = Shader.PropertyToID("_MultiScatteringLUTOut");
    static readonly int SkyViewOutId = Shader.PropertyToID("_SkyViewLUTOut");
    static readonly int WeatherOutId = Shader.PropertyToID("_WeatherMapOut");
    static readonly int WeatherOriginId = Shader.PropertyToID("_WeatherOrigin");
    static readonly int CameraHeightId = Shader.PropertyToID("_CameraHeight");
    static readonly int SunDirId = Shader.PropertyToID("_SkySunDir");
    static readonly int SkyTimeId = Shader.PropertyToID("_SkyTime");
    static readonly int WindId = Shader.PropertyToID("_CloudWind");
    static readonly int CoverageId = Shader.PropertyToID("_CloudCoverage");
    static readonly int WeatherScaleId = Shader.PropertyToID("_WeatherScale");
    static readonly int CurlId = Shader.PropertyToID("_CloudCurl");
    static readonly int CloudLowResOutId = Shader.PropertyToID("_CloudLowResOut");
    static readonly int CloudLowResTexId = Shader.PropertyToID("_CloudLowResTex");
    static readonly int CloudTexSizeId = Shader.PropertyToID("_CloudTexSize");
    static readonly int CloudCameraPosId = Shader.PropertyToID("_CloudCameraPos");
    static readonly int CloudInvViewProjId = Shader.PropertyToID("_CloudInvViewProj");

    // One low-resolution cloud target per camera (Game and Scene views have different sizes)
    readonly Dictionary<Camera, RenderTexture> cloudTargets = new Dictionary<Camera, RenderTexture>();
    readonly List<Camera> staleCameras = new List<Camera>();

    RenderTexture transmittanceLut;
    RenderTexture multiScatteringLut;
    RenderTexture skyViewLut;
    RenderTexture skyViewMoonLut;
    RenderTexture weatherMap;

    /// <summary>Sky radiance around the camera for a sun of intensity 1 (null until the first camera renders)</summary>
    public RenderTexture SkyViewLut => skyViewLut;
    /// <summary>Same as SkyViewLut, lit by the moon instead of the sun</summary>
    public RenderTexture SkyViewMoonLut => skyViewMoonLut;
    CommandBuffer cmd;
    bool staticLutsDirty = true;

    int transmittanceKernel, multiScatteringKernel, skyViewKernel, weatherKernel, cloudKernel;

    void OnEnable()
    {
        cmd = new CommandBuffer { name = "Skyward LUTs" };
        staticLutsDirty = true;
        RenderPipelineManager.beginCameraRendering += OnBeginCameraRendering;
    }

    void OnDisable()
    {
        RenderPipelineManager.beginCameraRendering -= OnBeginCameraRendering;
        cmd?.Release();
        cmd = null;
        Release(ref transmittanceLut);
        Release(ref multiScatteringLut);
        Release(ref skyViewLut);
        Release(ref skyViewMoonLut);
        Release(ref weatherMap);
        foreach (var target in cloudTargets.Values)
        {
            var texture = target;
            Release(ref texture);
        }
        cloudTargets.Clear();
    }

    void OnValidate()
    {
        weatherResolution = Mathf.Clamp(weatherResolution, 64, 2048);
        weatherExtent = Mathf.Max(weatherExtent, 10000f);
    }

    void OnBeginCameraRendering(ScriptableRenderContext context, Camera camera)
    {
        if (lutCompute == null || cmd == null)
            return;
        if (camera.cameraType != CameraType.Game && camera.cameraType != CameraType.SceneView)
            return;

        EnsureResources();
        cmd.Clear();

        // Same values the fragment shader reads from the globals set by SkyController
        cmd.SetComputeVectorParam(lutCompute, SunDirId, Shader.GetGlobalVector(SunDirId));
        cmd.SetComputeFloatParam(lutCompute, SkyTimeId, Shader.GetGlobalFloat(SkyTimeId));
        cmd.SetComputeVectorParam(lutCompute, WindId, Shader.GetGlobalVector(WindId));
        cmd.SetComputeFloatParam(lutCompute, CoverageId, Shader.GetGlobalFloat(CoverageId));
        cmd.SetComputeFloatParam(lutCompute, WeatherScaleId, Shader.GetGlobalFloat(WeatherScaleId));
        cmd.SetComputeFloatParam(lutCompute, CurlId, Shader.GetGlobalFloat(CurlId));

        if (staticLutsDirty)
        {
            cmd.SetComputeTextureParam(lutCompute, transmittanceKernel, TransmittanceOutId, transmittanceLut);
            Dispatch(transmittanceKernel, TransmittanceWidth, TransmittanceHeight);

            cmd.SetComputeTextureParam(lutCompute, multiScatteringKernel, TransmittanceLutId, transmittanceLut);
            cmd.SetComputeTextureParam(lutCompute, multiScatteringKernel, MultiScatteringOutId, multiScatteringLut);
            Dispatch(multiScatteringKernel, MultiScatSize, MultiScatSize);
            staticLutsDirty = false;
        }

        Vector3 cameraPos = camera.transform.position;
        cmd.SetComputeFloatParam(lutCompute, CameraHeightId, cameraPos.y);
        cmd.SetComputeTextureParam(lutCompute, skyViewKernel, TransmittanceLutId, transmittanceLut);
        cmd.SetComputeTextureParam(lutCompute, skyViewKernel, MultiScatteringLutId, multiScatteringLut);
        cmd.SetComputeTextureParam(lutCompute, skyViewKernel, SkyViewOutId, skyViewLut);
        Dispatch(skyViewKernel, SkyViewWidth, SkyViewHeight);

        // The sky is linear in the light intensity, so the moonlit sky is the same LUT computed for the moon's
        // direction; the shader scales it by the moon radiance
        cmd.SetComputeVectorParam(lutCompute, SunDirId, Shader.GetGlobalVector(MoonDirId));
        cmd.SetComputeTextureParam(lutCompute, skyViewKernel, SkyViewOutId, skyViewMoonLut);
        Dispatch(skyViewKernel, SkyViewWidth, SkyViewHeight);

        var weatherOrigin = new Vector4(cameraPos.x, cameraPos.z, weatherExtent, weatherResolution);
        cmd.SetComputeVectorParam(lutCompute, WeatherOriginId, weatherOrigin);
        cmd.SetComputeTextureParam(lutCompute, weatherKernel, WeatherOutId, weatherMap);
        Dispatch(weatherKernel, weatherResolution, weatherResolution);
        cmd.SetGlobalVector(WeatherOriginId, weatherOrigin);

        if (skyMaterial != null && skyMaterial.IsKeywordEnabled(LowResKeyword))
            DispatchLowResClouds(camera);

        context.ExecuteCommandBuffer(cmd);
    }

    void DispatchLowResClouds(Camera camera)
    {
        int factor = (int)cloudResolution;
        int width = Mathf.Max(1, Mathf.CeilToInt(camera.pixelWidth / (float)factor));
        int height = Mathf.Max(1, Mathf.CeilToInt(camera.pixelHeight / (float)factor));
        RenderTexture target = GetCloudTarget(camera, width, height);

        // Same ray reconstruction as the fragment shader: URP renders into an intermediate texture, so its
        // UNITY_MATRIX_I_VP is built from the render-into-texture GPU projection
        Matrix4x4 viewProj = GL.GetGPUProjectionMatrix(camera.projectionMatrix, true) * camera.worldToCameraMatrix;
        cmd.SetComputeMatrixParam(lutCompute, CloudInvViewProjId, viewProj.inverse);
        cmd.SetComputeVectorParam(lutCompute, CloudCameraPosId, camera.transform.position);
        cmd.SetComputeVectorParam(lutCompute, CloudTexSizeId, new Vector4(width, height, 0f, 0f));

        foreach (string name in MaterialFloats)
            cmd.SetComputeFloatParam(lutCompute, name, skyMaterial.GetFloat(name));
        foreach (string name in MaterialTextures)
        {
            Texture texture = skyMaterial.GetTexture(name);
            if (texture == null)
                return;     // not baked yet (Skyward > Bake Noise Textures / Bake Blue Noise)
            cmd.SetComputeTextureParam(lutCompute, cloudKernel, name, texture);
        }
        foreach (string name in GlobalFloats)
            cmd.SetComputeFloatParam(lutCompute, name, Shader.GetGlobalFloat(name));
        foreach (string name in GlobalVectors)
            cmd.SetComputeVectorParam(lutCompute, name, Shader.GetGlobalVector(name));

        cmd.SetComputeTextureParam(lutCompute, cloudKernel, TransmittanceLutId, transmittanceLut);
        cmd.SetComputeTextureParam(lutCompute, cloudKernel, WeatherMapId, weatherMap);
        cmd.SetComputeTextureParam(lutCompute, cloudKernel, CloudLowResOutId, target);
        Dispatch(cloudKernel, width, height);
        cmd.SetGlobalTexture(CloudLowResTexId, target);
    }

    RenderTexture GetCloudTarget(Camera camera, int width, int height)
    {
        // Drop targets of cameras that no longer exist
        staleCameras.Clear();
        foreach (var pair in cloudTargets)
        {
            if (pair.Key == null)
                staleCameras.Add(pair.Key);
        }
        foreach (Camera stale in staleCameras)
        {
            RenderTexture texture = cloudTargets[stale];
            Release(ref texture);
            cloudTargets.Remove(stale);
        }

        cloudTargets.TryGetValue(camera, out RenderTexture target);
        EnsureTexture(ref target, width, height, GraphicsFormat.R16G16B16A16_SFloat, $"Skyward Clouds ({camera.name})");
        cloudTargets[camera] = target;
        return target;
    }

    void Dispatch(int kernel, int width, int height)
    {
        cmd.DispatchCompute(lutCompute, kernel, Mathf.CeilToInt(width / 8f), Mathf.CeilToInt(height / 8f), 1);
    }

    void EnsureResources()
    {
        transmittanceKernel = lutCompute.FindKernel("TransmittanceLUT");
        multiScatteringKernel = lutCompute.FindKernel("MultiScatteringLUT");
        skyViewKernel = lutCompute.FindKernel("SkyViewLUT");
        weatherKernel = lutCompute.FindKernel("WeatherMapBake");
        cloudKernel = lutCompute.FindKernel("CloudsLowRes");

        bool created = false;
        created |= EnsureTexture(ref transmittanceLut, TransmittanceWidth, TransmittanceHeight, GraphicsFormat.R16G16B16A16_SFloat, "Skyward Transmittance LUT");
        created |= EnsureTexture(ref multiScatteringLut, MultiScatSize, MultiScatSize, GraphicsFormat.R16G16B16A16_SFloat, "Skyward MultiScattering LUT");
        EnsureTexture(ref skyViewLut, SkyViewWidth, SkyViewHeight, GraphicsFormat.R16G16B16A16_SFloat, "Skyward SkyView LUT");
        EnsureTexture(ref skyViewMoonLut, SkyViewWidth, SkyViewHeight, GraphicsFormat.R16G16B16A16_SFloat, "Skyward SkyView Moon LUT");
        EnsureTexture(ref weatherMap, weatherResolution, weatherResolution, GraphicsFormat.R16G16_SFloat, "Skyward Weather Map");
        if (created)
            staticLutsDirty = true;

        Shader.SetGlobalTexture(TransmittanceLutId, transmittanceLut);
        Shader.SetGlobalTexture(MultiScatteringLutId, multiScatteringLut);
        Shader.SetGlobalTexture(SkyViewLutId, skyViewLut);
        Shader.SetGlobalTexture(SkyViewMoonLutId, skyViewMoonLut);
        Shader.SetGlobalTexture(WeatherMapId, weatherMap);
    }

    // Returns true when the texture had to be (re)created
    static bool EnsureTexture(ref RenderTexture texture, int width, int height, GraphicsFormat format, string name)
    {
        if (texture != null && texture.IsCreated() && texture.width == width && texture.height == height)
            return false;

        Release(ref texture);
        texture = new RenderTexture(width, height, 0, format)
        {
            name = name,
            enableRandomWrite = true,
            wrapMode = TextureWrapMode.Clamp,
            filterMode = FilterMode.Bilinear,
            hideFlags = HideFlags.HideAndDontSave,
        };
        texture.Create();
        return true;
    }

    static void Release(ref RenderTexture texture)
    {
        if (texture == null)
            return;
        texture.Release();
        if (Application.isPlaying)
            Destroy(texture);
        else
            DestroyImmediate(texture);
        texture = null;
    }
}
