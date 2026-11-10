"""Render the 192-frame viewport turntable using hython."""
from pathlib import Path
import argparse
import sys
import hou


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("frames", type=Path)
    parser.add_argument("--scene", type=Path, default=Path(__file__).resolve().parents[1] / "B612.hipnc")
    parser.add_argument("--single", action="store_true")
    args = parser.parse_args()
    args.frames.mkdir(parents=True, exist_ok=True)
    hou.hipFile.load(str(args.scene.resolve()), suppress_save_prompt=True)
    camera = hou.node("/obj/storybook_camera")
    if sys.platform == "darwin":
        # H22's offscreen renderer on the project Mac reads a Retina quadrant.
        preview = camera.parent().copyItems((camera,))[0]
        preview.parm("orthowidth").set(2 * camera.evalParm("orthowidth"))
        preview.parm("aperture").set(2 * camera.evalParm("aperture"))
        preview.parm("winx").set(.25)
        preview.parm("winy").set(.25)
        camera = preview
    camera.parmTuple("res").set((800, 600))
    hou.node("/obj/warm_key").parm("light_intensity").set(.62)
    hou.node("/obj/golden_rim").parm("light_intensity").set(.27)
    hou.node("/obj/soft_sky").parm("light_intensity").set(.45)
    render = hou.node("/out").createNode("opengl", "turntable_preview")
    render.parm("camera").set(camera.path())
    render.parm("tres").set(0)
    render.parm("picture").set(str(args.frames.resolve() / "turn.$F4.png"))
    render.parm("aamode").set("aa4")
    render.parm("hqlighting").set(1)
    render.parm("ambocclusion").set(1)
    render.parm("ambquality").set(1)
    render.parm("shadowquality").set("point")
    render.render(frame_range=(1, 1) if args.single else (1, 192))


if __name__ == "__main__":
    main()
