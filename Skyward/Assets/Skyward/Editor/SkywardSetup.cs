using System.Linq;
using UnityEditor;
using UnityEditor.SceneManagement;
using UnityEngine;
using UnityEngine.Rendering.Universal;

/// <summary>
/// One-click setup: adds the sky Full Screen Pass to the PC renderer and a SkyController to the open scene.
/// Menu: Skyward > Setup Scene. Safe to run more than once.
/// </summary>
public static class SkywardSetup
{
    const string RendererPath = "Assets/Settings/PC_Renderer.asset";
    const string MaterialPath = "Assets/Skyward/Material/SkyAndClouds_Mat.mat";
    const string FeatureName = "SkyAndClouds";

    [MenuItem("Skyward/Setup Scene")]
    static void Setup()
    {
        Material material = LoadOrCreateMaterial();
        if (material == null)
            return;

        var rendererData = AssetDatabase.LoadAssetAtPath<UniversalRendererData>(RendererPath);
        if (rendererData == null)
        {
            Debug.LogError($"Skyward: renderer not found at {RendererPath}");
            return;
        }

        SetupFeature(rendererData, material);
        SetupScene();
        Debug.Log("Skyward: setup done. Look at the Game view and drag SkyController > Time Of Day.");
    }

    static Material LoadOrCreateMaterial()
    {
        var material = AssetDatabase.LoadAssetAtPath<Material>(MaterialPath);
        if (material != null)
            return material;

        Shader shader = Shader.Find("Skyward/SkyAndClouds");
        if (shader == null)
        {
            Debug.LogError("Skyward: shader Skyward/SkyAndClouds not found or failed to compile.");
            return null;
        }
        material = new Material(shader);
        AssetDatabase.CreateAsset(material, MaterialPath);
        return material;
    }

    static void SetupFeature(UniversalRendererData rendererData, Material material)
    {
        var feature = rendererData.rendererFeatures
            .OfType<FullScreenPassRendererFeature>()
            .FirstOrDefault(f => f != null && f.name == FeatureName);

        if (feature == null)
        {
            feature = ScriptableObject.CreateInstance<FullScreenPassRendererFeature>();
            feature.name = FeatureName;
            AssetDatabase.AddObjectToAsset(feature, rendererData);
            rendererData.rendererFeatures.Add(feature);
            AssetDatabase.SaveAssets();

            // Keep the renderer's feature map in sync, as the renderer inspector does when adding a feature
            AssetDatabase.TryGetGUIDAndLocalFileIdentifier(feature, out _, out long localId);
            var serialized = new SerializedObject(rendererData);
            SerializedProperty map = serialized.FindProperty("m_RendererFeatureMap");
            map.arraySize++;
            map.GetArrayElementAtIndex(map.arraySize - 1).longValue = localId;
            serialized.ApplyModifiedPropertiesWithoutUndo();
        }

        feature.passMaterial = material;
        feature.injectionPoint = FullScreenPassRendererFeature.InjectionPoint.BeforeRenderingPostProcessing;
        feature.requirements = ScriptableRenderPassInput.Depth | ScriptableRenderPassInput.Color;
        feature.fetchColorBuffer = true;
        feature.SetActive(true);

        EditorUtility.SetDirty(feature);
        EditorUtility.SetDirty(rendererData);
        rendererData.SetDirty();
        AssetDatabase.SaveAssets();
    }

    static void SetupScene()
    {
        var controller = Object.FindFirstObjectByType<SkyController>();
        if (controller == null)
        {
            var go = new GameObject("SkyController");
            Undo.RegisterCreatedObjectUndo(go, "Create SkyController");
            controller = go.AddComponent<SkyController>();
        }

        if (controller.sun == null)
        {
            controller.sun = RenderSettings.sun != null
                ? RenderSettings.sun
                : Object.FindObjectsByType<Light>(FindObjectsSortMode.None).FirstOrDefault(l => l.type == LightType.Directional);
        }

        Camera camera = Camera.main;
        if (camera != null && camera.farClipPlane < 5000f)
        {
            Undo.RecordObject(camera, "Camera far plane");
            camera.farClipPlane = 5000f;
        }

        EditorUtility.SetDirty(controller);
        EditorSceneManager.MarkSceneDirty(controller.gameObject.scene);
    }
}
