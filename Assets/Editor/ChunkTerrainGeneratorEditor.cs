using UnityEditor;
using UnityEngine;

[CustomEditor(typeof(ChunkTerrainGenerator))]
public class ChunkTerrainGeneratorEditor : Editor
{
    public override void OnInspectorGUI()
    {
        DrawDefaultInspector();
        EditorGUILayout.Space();

        ChunkTerrainGenerator generator = (ChunkTerrainGenerator)target;
        bool previousGuiEnabled = GUI.enabled;
        GUI.enabled = !generator.IsGenerating;

        if (GUILayout.Button(generator.IsGenerating ? "Generating..." : "Generate Chunk"))
        {
            generator.GenerateChunk();
        }

        GUI.enabled = previousGuiEnabled;
    }
}
