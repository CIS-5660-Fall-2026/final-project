using UnityEditor;
using UnityEngine;
using UnityEngine.Experimental.Rendering;

/// <summary>
/// Bakes the tileable 3D cloud noise with NoiseBake.compute and saves it as Texture3D assets.
/// Menu: Skyward > Bake Noise Textures. Re-baking keeps the asset GUIDs, so material references stay valid.
/// Sizes and periods must match the constants in SkyAndClouds.shader (kBaseNoisePeriod, kDetailNoisePeriod).
/// </summary>
public static class NoiseBaker
{
    const string ComputePath = "Assets/Skyward/Shaders/NoiseBake.compute";
    const string OutputFolder = "Assets/Skyward/Textures";
    const string MaterialPath = "Assets/Skyward/Material/SkyAndClouds_Mat.mat";

    const int BaseSize = 128;
    const int BasePeriod = 4;
    const int DetailSize = 64;
    const int DetailPeriod = 2;

    [MenuItem("Skyward/Bake Noise Textures")]
    static void Bake()
    {
        var compute = AssetDatabase.LoadAssetAtPath<ComputeShader>(ComputePath);
        if (compute == null)
        {
            Debug.LogError($"Skyward: compute shader not found at {ComputePath}");
            return;
        }

        if (!AssetDatabase.IsValidFolder(OutputFolder))
            AssetDatabase.CreateFolder("Assets/Skyward", "Textures");

        var stopwatch = System.Diagnostics.Stopwatch.StartNew();
        Texture3D baseNoise = BakeTexture(compute, "BakeBase", BaseSize, BasePeriod, $"{OutputFolder}/BaseNoise.asset");
        Texture3D detailNoise = BakeTexture(compute, "BakeDetail", DetailSize, DetailPeriod, $"{OutputFolder}/DetailNoise.asset");

        var material = AssetDatabase.LoadAssetAtPath<Material>(MaterialPath);
        if (material != null)
        {
            material.SetTexture("_BaseNoise", baseNoise);
            material.SetTexture("_DetailNoise", detailNoise);
            material.SetFloat("_BakedNoise", 1f);
            material.EnableKeyword("_BAKED_NOISE");
            EditorUtility.SetDirty(material);
        }
        else
        {
            Debug.LogWarning($"Skyward: material not found at {MaterialPath}, assign the noise textures manually.");
        }

        AssetDatabase.SaveAssets();
        Debug.Log($"Skyward: baked {BaseSize}^3 base and {DetailSize}^3 detail noise in {stopwatch.ElapsedMilliseconds} ms.");
    }

    static Texture3D BakeTexture(ComputeShader compute, string kernelName, int size, int period, string path)
    {
        int kernel = compute.FindKernel(kernelName);
        int count = size * size * size;
        var buffer = new ComputeBuffer(count, sizeof(float) * 4);
        try
        {
            compute.SetBuffer(kernel, "_Result", buffer);
            compute.SetInt("_Size", size);
            compute.SetFloat("_Period", period);
            int groups = Mathf.CeilToInt(size / 8f);
            compute.Dispatch(kernel, groups, groups, groups);

            var data = new Vector4[count];
            buffer.GetData(data);

            var pixels = new Color32[count];
            for (int i = 0; i < count; i++)
            {
                Vector4 v = data[i];
                pixels[i] = new Color32(ToByte(v.x), ToByte(v.y), ToByte(v.z), ToByte(v.w));
            }

            var texture = new Texture3D(size, size, size, GraphicsFormat.R8G8B8A8_UNorm, TextureCreationFlags.None)
            {
                name = System.IO.Path.GetFileNameWithoutExtension(path),
                wrapMode = TextureWrapMode.Repeat,
                filterMode = FilterMode.Bilinear,
            };
            texture.SetPixels32(pixels);
            texture.Apply(false);

            var existing = AssetDatabase.LoadAssetAtPath<Texture3D>(path);
            if (existing != null)
            {
                EditorUtility.CopySerialized(texture, existing);
                Object.DestroyImmediate(texture);
                return existing;
            }
            AssetDatabase.CreateAsset(texture, path);
            return texture;
        }
        finally
        {
            buffer.Release();
        }
    }

    static byte ToByte(float v)
    {
        return (byte)Mathf.RoundToInt(Mathf.Clamp01(v) * 255f);
    }
}
