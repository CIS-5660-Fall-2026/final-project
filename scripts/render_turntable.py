"""Render the eight-second turntable, or one still, using Houdini's hython."""
from pathlib import Path
import argparse
import sys
import hou


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("frames", type=Path)
    parser.add_argument("--scene", type=Path, default=Path(__file__).resolve().parents[1] / "B612.hipnc")
    parser.add_argument("--single", action="store_true")
    parser.add_argument("--preview", action="store_true", help="Use the fast viewport renderer")
    parser.add_argument("--seed", type=int, default=12)
    parser.add_argument("--camera", default="storybook_camera")
    args = parser.parse_args()
    args.frames.mkdir(parents=True, exist_ok=True)
    hou.hipFile.load(str(args.scene.resolve()), suppress_save_prompt=True)
    hou.node("/obj/B612_PLANET").parm("seed").set(args.seed)
    camera = hou.node("/obj/" + args.camera)
    if camera is None or camera.type().name() != "cam":
        raise ValueError("Unknown scene camera: " + args.camera)
    render = hou.node("/out/STORYBOOK_RENDER")
    render.parm("camera").set(camera.path())
    if args.preview:
        if sys.platform == "darwin":
            # H22's offscreen renderer on the project Mac reads a Retina quadrant.
            preview = camera.parent().copyItems((camera,))[0]
            preview.parm("orthowidth").set(2 * camera.evalParm("orthowidth"))
            preview.parm("aperture").set(2 * camera.evalParm("aperture"))
            preview.parm("winx").set(.25)
            preview.parm("winy").set(.25)
            camera = preview
        camera.parmTuple("res").set((800, 600))
        # The viewport uses alpha blending for the shell instead of ray refraction.
        glass = hou.node("/mat/glass")
        glass.parm("transparency").set(0)
        glass.parm("opac").set(.065)
        glass.parm("reflect").set(.12)
        glass.parm("displayOpacity").set(.065)
        render = hou.node("/out").createNode("opengl", "turntable_preview")
        render.parm("camera").set(camera.path())
        render.parm("tres").set(0)
        render.parm("aamode").set("aa4")
        render.parm("hqlighting").set(1)
        render.parm("ambocclusion").set(1)
        render.parm("ambquality").set(1)
        render.parm("shadowquality").set("point")
        hou.node("/mat/starlight").parm("emitint").set(0)
        hou.node("/mat/starlight").parm("albedomult").set(1)
        hou.node("/obj/warm_key").parm("light_type").set(7)
        hou.node("/obj/warm_key").parm("light_intensity").set(.62)
        hou.node("/obj/golden_rim").parm("light_intensity").set(.27)
        hou.node("/obj/soft_sky").parm("light_intensity").set(.45)
        render.parm("picture").set(str(args.frames.resolve() / "turn.$F4.png"))
    else:
        render.parm("vm_picture").set(str(args.frames.resolve() / "turn.$F4.png"))
    render.render(frame_range=(1, 1) if args.single else (1, 192))


if __name__ == "__main__":
    main()
