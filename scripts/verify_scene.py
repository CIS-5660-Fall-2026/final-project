"""Check the saved scene and its interactive controls with Houdini's hython."""
import argparse
import hashlib
import json
import math
from pathlib import Path

import hou


def digest(values):
    return hashlib.sha256(repr(values).encode()).hexdigest()


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--scene", type=Path, default=Path(__file__).resolve().parents[1] / "B612.hipnc")
    args = parser.parse_args()
    hou.hipFile.load(str(args.scene.resolve()), suppress_save_prompt=True)
    planet = hou.node("/obj/B612_PLANET")
    terrain = planet.node("plantable_slopes")
    sites = [planet.node(name + "_positions") for name in ("grass", "flower")]
    report = {}

    def signature():
        return digest([node.geometry().pointFloatAttribValues("P") for node in [terrain] + sites])

    base_relief = planet.evalParm("relief")
    base_density = planet.evalParm("density")
    base = signature()
    counts = [len(node.geometry().points()) for node in sites]
    assert min(counts) > 0, "Default scene must contain both grass and flowers"
    report["default_instance_counts"] = dict(zip(["grass", "flowers"], counts))

    for seed in (0, 47, 255):
        planet.parm("seed").set(seed)
        assert signature() != base, "Seed must change terrain or planting"
        for node in sites:
            geo = node.geometry()
            assert not node.errors(), node.errors()
            assert all(math.isfinite(x) for x in geo.pointFloatAttribValues("P"))
            for point in geo.points():
                radial = point.position().normalized()
                assert radial.distanceTo(hou.Vector3((-.30, .80, .52)).normalized()) > .295
                assert radial.distanceTo(hou.Vector3((.49, .85, .20)).normalized()) > .515
                assert radial.distanceTo(hou.Vector3((.10,.82,.57)).normalized()) > .125
    planet.parm("seed").set(12)
    assert signature() == base, "Returning to a seed must reproduce the exact geometry"

    planet.parm("density").set(0)
    assert all(len(node.geometry().points()) == 0 for node in sites)
    planet.parm("density").set(1.35)
    assert all(len(node.geometry().points()) >= count for node, count in zip(sites, counts))
    planet.parm("density").set(base_density)

    planet.parm("relief").set(0)
    assert max(abs(point.position().length() - 2) for point in terrain.geometry().points()) < 1e-5
    planet.parm("relief").set(.48)
    assert max(abs(point.position().length() - 2) for point in terrain.geometry().points()) > .1
    for node in sites:
        assert not node.errors()
        assert all(math.isfinite(x) for x in node.geometry().pointFloatAttribValues("orient"))
    planet.parm("relief").set(base_relief)
    assert signature() == base

    dome = planet.node("clear_bell_jar").geometry()
    axis = hou.Vector3((-.30, .80, .52)).normalized()
    side_normals = []
    for primitive in dome.prims():
        center = sum((v.point().position() for v in primitive.vertices()), hou.Vector3()) / len(primitive.vertices())
        relative = center-axis*2
        height = relative.dot(axis)
        side = relative-axis*height
        if .1 < height < .65:
            sign = 1 if side.length() > .427 else -1
            side_normals.append(sign*primitive.normal().dot(side.normalized()))
    assert side_normals and min(side_normals) > .99, "Glass walls must face outward from the solid shell"

    assert planet.node("little_prince").geometry().intrinsicValue("primitivecount") > 1000
    assert hou.node("/obj/rose_detail_camera") is not None

    volcano=planet.node("volcano").geometry()
    vent=hou.Vector3((.49,.85,.20)).normalized()
    heights=[(point.position()-vent*2).dot(vent) for point in volcano.points()]
    assert max(heights)>1.05, "The enlarged crater rim must reach its intended height"
    assert min(heights)<0, "The volcano foot must meet the ground"
    assert volcano.intrinsicValue("primitivecount")>9000, "The crater and scree must be present"

    glass = hou.node("/mat/glass")
    render = hou.node("/out/STORYBOOK_RENDER")
    assert glass.evalParm("transparency") == 1
    assert glass.evalParm("fakecausticsenabled") == 1
    assert glass.evalParm("opacpointalpha") == 0
    assert render.evalParm("vm_refractlimit") >= 4
    assert planet.node("clear_bell_jar").geometry().findPrimAttrib("shop_materialpath").strings() == ("/mat/glass",)
    for node in ("shape_and_paint_terrain", "red_rose_and_brass_base", "grass_model", "flower_model"):
        assert min(planet.node(node).geometry().pointFloatAttribValues("Alpha")) == 1
    for frame, angle in ((1, 0), (97, 180), (193, 360)):
        hou.setFrame(frame)
        assert abs(planet.evalParm("ry") - angle) < 1e-6
    assert hou.fps() == 24
    assert tuple(hou.playbar.frameRange()) == (1, 192)
    assert not planet.node("OUT_PLANET").errors()
    report["checked"] = ["standalone load", "seed reproducibility", "multiple layouts", "landmark clearings",
                         "density limits", "relief limits", "finite geometry", "glass transmission", "glass wall orientation", "prince geometry and clearing", "volcano scale and detail",
                         "opaque ground and plants", "eight-second loop"]
    print(json.dumps(report, indent=2), flush=True)


if __name__ == "__main__":
    main()
