"""Rebuild a self-contained B-612 scene using Houdini's hython."""
import math
from pathlib import Path
import sys
import hou

SOURCE = Path(__file__).resolve().parent
ROOT = Path(sys.argv[1]).resolve() if len(sys.argv)>1 else SOURCE.parent
PARTS = (SOURCE/'parts.py').read_text()
hou.hipFile.clear(suppress_save_prompt=True)
obj=hou.node('/obj')
mat=hou.node('/mat')
out=hou.node('/out')

def shader(name,roughness,reflect):
    n=mat.createNode('principledshader::2.0',name)
    n.parmTuple('basecolor').set((1,1,1))
    n.parm('basecolor_usePointColor').set(1)
    n.parm('rough').set(roughness)
    n.parm('reflect').set(reflect)
    return n

shader('paint',.82,.15)
glass=shader('glass',.12,.55)
glass.parm('opac').set(1)
glass.parm('displayOpacity').set(.11)
skyshader=shader('starlight',1,0)
skyshader.parm('albedomult').set(1)
skyshader.parm('emitint').set(0)
skyshader.parmTuple('emitcolor').set((1,1,1))
skyshader.parm('emitcolor_usePointColor').set(1)

def model(parent,name,part):
    n=parent.createNode('python',name)
    n.parm('python').set(PARTS+'\nbuild_part('+repr(part)+')\n')
    return n

def look(n,pos,target):
    dx,dy,dz=[a-b for a,b in zip(pos,target)]
    n.parmTuple('t').set(pos)
    n.parmTuple('r').set((-math.degrees(math.atan2(dy,math.hypot(dx,dz))), math.degrees(math.atan2(dx,dz)),0))

planet=obj.createNode('geo','B612_PLANET')
group=planet.parmTemplateGroup()
controls=hou.FolderParmTemplate('planet_controls','Planet Controls',(
    hou.IntParmTemplate('seed','Seed',1,default_value=(12,),min=0,max=255),
    hou.FloatParmTemplate('relief','Terrain Relief',1,default_value=(.21,),min=0,max=.48,min_is_strict=True,max_is_strict=True),
    hou.FloatParmTemplate('density','Plant Density',1,default_value=(.56,),min=0,max=1.35,min_is_strict=True,max_is_strict=True)))
group.insertBefore(group.entries()[0],controls)
planet.setParmTemplateGroup(group)
planet.parm('shop_materialpath').set('/mat/paint')
sphere=planet.createNode('sphere','planet_mesh')
sphere.parm('type').set('poly')
sphere.parm('freq').set(38)
terrain=planet.createNode('attribwrangle','shape_and_paint_terrain')
terrain.setInput(0,sphere)
terrain.parm('snippet').set((SOURCE/'terrain.vfl').read_text())

def planting(kind):
    proto=model(planet,kind+'_model',kind)
    pts=planet.createNode('attribwrangle',kind+'_positions')
    pts.setInput(1,terrain)
    pts.parm('class').set('detail')
    pts.addSpareParmTuple(hou.ToggleParmTemplate('flower','Flower sites',default_value=kind=='flower'))
    pts.parm('snippet').set((SOURCE/'planting.vfl').read_text())
    copies=planet.createNode('copytopoints',kind+'_patches')
    copies.setInput(0,proto)
    copies.setInput(1,pts)
    copies.parm('pack').set(0)
    return copies

pieces=[terrain,model(planet,'red_rose_and_brass_base','rose'),model(planet,'clear_bell_jar','dome'),
        model(planet,'volcano','volcano'),planting('grass'),planting('flower')]
assembled=planet.createNode('merge','assemble_planet')
for i,node in enumerate(pieces): assembled.setInput(i,node)
final=planet.createNode('null','OUT_PLANET')
final.setInput(0,assembled)
final.setDisplayFlag(True)
final.setRenderFlag(True)
planet.parm('ry').setExpression('($F-1)*360/192',hou.exprLanguage.Hscript)
sky=obj.createNode('geo','NIGHT_SKY')
skymesh=model(sky,'stars_and_night_sky','sky')
skymesh.setDisplayFlag(True)
skymesh.setRenderFlag(True)
camera=obj.createNode('cam','storybook_camera')
look(camera,(0,2.4,11),(0,.27,0))
camera.parm('projection').set('ortho')
camera.parm('orthowidth').set(7.55)
camera.parmTuple('res').set((960,720))
key=obj.createNode('hlight','warm_key')
key.parm('light_type').set(7)
look(key,(-4,6,5),(0,0,0))
key.parm('light_intensity').set(1.35)
key.parmTuple('light_color').set((1,.86,.68))
fill=obj.createNode('envlight','soft_sky')
fill.parm('light_intensity').set(.48)
fill.parmTuple('light_color').set((.81,.88,1))
rim=obj.createNode('hlight','golden_rim')
rim.parm('light_type').set(7)
look(rim,(4,4,-4),(0,0,0))
rim.parm('light_intensity').set(.72)
rim.parmTuple('light_color').set((1,.77,.54))
beauty=out.createNode('ifd','STORYBOOK_RENDER')
beauty.parm('camera').set(camera.path())
beauty.parm('vm_picture').set('$HIP/render/planet.$F4.png')
beauty.parm('vm_renderengine').set('pbrraytrace')
beauty.parmTuple('vm_samples').set((3,3))
for k,v in {'vm_maxraysamples':2,'vm_minraysamples':1,'vm_diffuselimit':0,'vm_reflectlimit':1,'vm_refractlimit':0}.items():
    beauty.parm(k).set(v)
for n in (planet,sky,mat,obj,out): n.layoutChildren()
planet.setColor(hou.Color((.36,.52,.29)))
planet.setSelected(True,clear_all_selected=True)
hou.setFps(24)
hou.playbar.setFrameRange(1,192)
hou.playbar.setPlaybackRange(1,192)
hou.setFrame(1)
for n in pieces+[final,skymesh]:
    geo=n.geometry()
    if n.errors() or n.warnings():
        print(n.path(),n.errors(),n.warnings(),flush=True)
    if n.errors() or geo is None or (n!=pieces[-1] and not geo.intrinsicValue('primitivecount')):
        raise RuntimeError('Could not cook '+n.path())
    print(n.name(), geo.intrinsicValue('primitivecount'),flush=True)
ROOT.mkdir(parents=True,exist_ok=True)
hou.hipFile.save(str(ROOT/'B612.hipnc'))
print('SAVED',hou.hipFile.path(),flush=True)
