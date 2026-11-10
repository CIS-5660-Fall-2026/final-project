"""Small, self-contained meshes for the B-612 Houdini Python SOPs."""
from math import cos, pi, sin
import random
import hou

TAU = 2*pi
V = hou.Vector3
ROSE = V((-.30, .80, .52)).normalized()
VENT = V((.43, .86, .29)).normalized()

class Mesh:
    def __init__(self):
        self.points, self.colors, self.faces = [], [], []

    def point(self, pos, color):
        self.points.append(tuple(pos))
        self.colors.append(tuple(color))
        return len(self.points)-1

    def bands(self, rings, wrap=True):
        for a,b in zip(rings,rings[1:]):
            for j in range(len(a) if wrap else len(a)-1):
                k=(j+1)%len(a)
                self.faces.append((a[j],b[j],b[k],a[k]))

    def lathe(self, profile, color, n=32, axis=None):
        rings=[]
        for y,r in profile:
            ring=[]
            for j in range(n):
                a=TAU*j/n
                p=V((r*cos(a),y,r*sin(a)))
                ring.append(self.point(axis(p) if axis else p,color))
            rings.append(ring)
        self.bands(rings)

    def stem(self, start, end, r1, r2, color):
        start,end=V(start),V(end)
        axis=end-start
        rot=V((0,1,0)).matrixToRotateTo(axis.normalized())
        self.lathe([(0,r1),(axis.length(),r2)],color,7,lambda p: start+p*rot)

    def ribbon(self, start, end, width, side, lift, color):
        start,end,side,lift=V(start),V(end),V(side).normalized(),V(lift)
        rows=[]
        for i in range(6):
            t=i/5
            center=start+(end-start)*t+lift*sin(pi*t)
            w=width*(.04+sin(pi*t)**.8)
            rows.append([self.point(center-side*w,color),self.point(center+lift*.14,color),
                         self.point(center+side*w,color)])
        self.bands(rows,False)

    def finish(self, geo, material, direction=None):
        if direction is not None:
            rot=V((0,1,0)).matrixToRotateTo(direction)
            self.points=[tuple(V(p)*rot+direction*2) for p in self.points]
        geo.createPoints(self.points)
        geo.createPolygons(self.faces)
        geo.addAttrib(hou.attribType.Point,'Cd',(1.,1.,1.))
        geo.setPointFloatAttribValues('Cd',tuple(v for c in self.colors for v in c))
        geo.addAttrib(hou.attribType.Prim,'shop_materialpath','')
        geo.setPrimStringAttribValues('shop_materialpath',[material]*len(self.faces))

def model_rose(m):
    brass=(.49,.245,.072)
    m.lathe([(-.064,.30),(-.012,.375),(.014,.38),(.036,.35),(.046,.305)],brass,64)
    m.lathe([(.045,.31),(.055,.30),(.055,0)],(.17,.115,.055),48)
    m.stem((0,.04,0),(.01,.30,.01),.021,.017,(.12,.25,.052))
    m.stem((.01,.30,.01),(-.018,.57,0),.017,.011,(.13,.29,.055))
    for root,tip,side in [
        ((0,.23,.01),(-.192,.37,.02),(0,.2,1)),
        ((0,.32,.01),(.175,.46,.032),(0,.22,1)),
        ((-.008,.43,0),(-.11,.51,-.065),(-.4,0,1))]:
        m.ribbon(root,tip,.051,side,(0,.018,.019),(.105,.30,.084))
    # Each layer opens at a different angle, curling the rose around its center.
    for layer,(num,rad,h,spread) in enumerate([(7,.20,.18,1.64),(6,.154,.224,1.58),(5,.109,.254,1.72),(4,.061,.267,1.85)]):
        for j in range(num):
            phase=TAU*j/num+layer*.61
            rows=[]
            for ti in range(7):
                t=ti/6
                row=[]
                for ui in range(10):
                    u=ui/9*2-1
                    theta=phase+u*spread*.69+t*.22
                    r=.027+rad*t**.86*(1-.23*u*u)
                    y=.497+h*t+.035*(1-u*u)*t-.026*abs(u)**3*t
                    highlight=.62+.37*t
                    col=((.65+.12*sin(phase))*highlight,(.014+.045*t)*highlight,
                         (.065+.042*t)*highlight)
                    row.append(m.point((-.018+r*cos(theta),y,r*sin(theta)),col))
                rows.append(row)
            m.bands(rows,False)

    # Two narrow highlights describe the curved glass at turntable distance.
    for theta,y0,y1,w in [(2.69,.25,.83,.006),(2.69,.12,.205,.004),(.40,.52,.80,.0035)]:
        rows=[]
        for j in range(23):
            t=j/22
            y=y0+(y1-y0)*t
            r=(.349**2-max(0,y-.553)**2)**.5+.003
            a=theta+.11*t
            width=w*(.24+.76*sin(pi*t))/r
            rows.append([m.point((r*cos(a+v),y,r*sin(a+v)),(.60,.82,.83)) for v in (-width,width)])
        m.bands(rows,False)

def model_dome(m):
    r=.349
    profile=[(.031,r),(.46,r),(.553,r)]
    for i in range(1,18):
        a=pi*.5*i/17
        profile.append((.553+r*sin(a),max(.0004,r*cos(a))))
    m.lathe(profile,(.72,.88,.93),60)

def model_volcano(m):
    rng=random.Random(86)
    seg=31
    ridges=[rng.uniform(.84,1.16) for _ in range(seg)]
    profile=[(-.105,.52),(.025,.478),(.16,.35),(.34,.264),(.53,.187),(.623,.157),(.606,.112),(.525,.079),(.495,.007)]
    shades=[(.38,.26,.15),(.46,.31,.169),(.41,.263,.15),(.395,.239,.14),
            (.49,.301,.15),(.63,.373,.16),(.235,.134,.085),(.11,.067,.061),(.11,.052,.033)]
    rings=[]
    for i,((y,r),base) in enumerate(zip(profile,shades)):
        row=[]
        for j,wr in enumerate(ridges):
            a=TAU*j/seg
            w=1+(wr-1)*(.8 if i<6 else .4)
            shade=1.0+(wr-1)*1.65
            z=y+.026*sin(3*a+.8)+.009*cos(8*a)
            row.append(m.point((.075*y+r*w*cos(a),z,.04*y+r*w*sin(a)),tuple(v*shade for v in base)))
        rings.append(row)
    m.bands(rings)

def model_grass(m):
    rng=random.Random(174)
    for i in range(7):
        a=TAU*(i+rng.random()*.45)/7
        d=V((cos(a),0,sin(a))); s=V((-sin(a),0,cos(a)))
        h=rng.uniform(.070,.151)
        base=d*rng.uniform(.003,.025)
        m.ribbon(base,base+d*h*.55+V((0,h,0)),.009,s,d*.012,
                 rng.choice([(.16,.31,.075),(.25,.39,.083),(.38,.43,.105),(.24,.35,.11)]))

def model_flower(m):
    for cx,cz,h,scale in [(0,0,.142,1),(.048,.014,.10,.72)]:
        c=V((cx,h,cz))
        m.stem((cx*.35,-.007,cz*.35),c,.005,.0035,(.16,.32,.055))
        for i in range(7):
            a=i*TAU/7
            d=V((cos(a),0,sin(a)))
            m.ribbon(c+d*.006,c+d*(.049*scale)+V((0,.014,0)),.014*scale,
                     (-sin(a),0,cos(a)),(0,.008,0),(.95,.84,.62))
        m.lathe([(0,.008),(.007,.014),(.013,.009),(.014,.001)],(.92,.49,.075),10,lambda p:p+c)

def model_sky(m):
    # A softly mottled night sky on a plane behind the entire turntable.
    n=44
    grid=[]
    for j in range(n+1):
        y=-12+24*j/n
        row=[]
        for i in range(n+1):
            x=-15+30*i/n
            f=.5+.26*sin(.80*x+.69*y)+.15*sin(1.9*x-1.3*y)+.09*cos(3.4*y+.9*x)
            v=max(0,1-((x+1)/9)**2-((y+1)/8)**2)
            col=(.012+.015*v+.004*f,.022+.035*v+.009*f,.061+.071*v+.018*f)
            row.append(m.point((x,y,-6.5),col))
        grid.append(row)
    for a,b in zip(grid,grid[1:]):
        for i in range(n): m.faces.append((a[i],a[i+1],b[i+1],b[i]))
    rng=random.Random(612)
    for i in range(530):
        x,y=rng.uniform(-6.8,6.8),rng.uniform(-5,6)
        r=rng.uniform(.006,.018)*(1.85 if i%14==0 else 1)
        col=rng.choice([(.48,.59,.77),(.68,.72,.78),(.93,.68,.30),(.33,.44,.61)])
        center=m.point((x,y,-6.43),col); ring=[]
        for k in range(8):
            a=TAU*k/8
            r1=r*(1 if k%2==0 else .31)
            ring.append(m.point((x+cos(a)*r1,y+sin(a)*r1*(1.48 if i%14==0 else 1),-6.43),col))
        for k in range(8): m.faces.append((center,ring[k],ring[(k+1)%8]))

def build_part(part):
    shapes={'rose':(model_rose,'paint',ROSE),'dome':(model_dome,'glass',ROSE),
            'volcano':(model_volcano,'paint',VENT),'grass':(model_grass,'paint',None),
            'flower':(model_flower,'paint',None),'sky':(model_sky,'starlight',None)}
    draw,material,axis=shapes[part]
    mesh=Mesh()
    draw(mesh)
    geo=hou.pwd().geometry()
    mesh.finish(geo,'/mat/'+material,axis)
    geo.addAttrib(hou.attribType.Point,'Alpha',1.0)
    if part=='dome':
        geo.setPointFloatAttribValues('Alpha',[.11]*len(mesh.points))
