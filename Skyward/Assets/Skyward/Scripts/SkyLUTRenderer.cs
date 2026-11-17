using UnityEngine;
using UnityEngine.Experimental.Rendering;
using UnityEngine.Rendering;

/// <summary>
/// Computes the atmosphere LUTs (Hillaire 2020) and the weather map with SkyLUT.compute, and binds them as
/// global textures for Skyward/SkyAndClouds.
///   Transmittance and multi-scattering LUTs: computed once (they only depend on the atmosphere constants).
///   Sky-view LUT and weather map: computed per camera, right before that camera renders, because they depend on
///   the camera position, the sun and the time.
/// Reads the sun / cloud globals that SkyController sets, so it must run alongside a SkyController.
/// </summary>
[ExecuteAlways]
public class SkyLUTRenderer : MonoBehaviour
{
    public ComputeShader lutCompute;

    [Header("Weather Map")]
    public int weatherResolution = 512;
    [Tooltip("Size of the baked weather map around the camera, in meters")]
    public float weatherExtent = 240000f;

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

    int transmittanceKernel, multiScatteringKernel, skyViewKernel, weatherKernel;

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

        context.ExecuteCommandBuffer(cmd);
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
