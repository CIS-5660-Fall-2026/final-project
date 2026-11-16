"""Small, self-contained meshes for the B-612 Houdini Python SOPs."""
from math import atan2, cos, degrees, pi, sin
import random
import hou

TAU = 2*pi
V = hou.Vector3
ROSE = V((-.30, .80, .52)).normalized()
VENT = V((.49, .85, .20)).normalized()
PRINCE = V((.10,.82,.57)).normalized()

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
                self.faces.append((a[j],a[k],b[k],b[j]))

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

    def ellipsoid(self, center, radii, color, n=24, steps=12):
        center = V(center)
        rings = []
        for i in range(steps+1):
            latitude = -pi/2 + pi*i/steps
            ring = []
            for j in range(n):
                angle = TAU*j/n
                pos = center + V((radii[0]*cos(latitude)*cos(angle),
                                  radii[1]*sin(latitude),
                                  radii[2]*cos(latitude)*sin(angle)))
                ring.append(self.point(pos,color))
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
    brass = (.56,.31,.09)
    m.lathe([(-.10,.36),(-.035,.455),(-.004,.475),(.022,.475),
             (.037,.43),(.047,.425),(.057,.425),(.065,.39)],
            brass,80)
    m.lathe([(.06,.39),(.069,.39),(.069,.0001)],(.24,.16,.075),64)
    # Repeated ridges around the plinth make the rose read as a treasured object.
    for j in range(56):
        angle = TAU*j/56
        m.stem((.468*cos(angle),-.006,.468*sin(angle)),
               (.468*cos(angle),.024,.468*sin(angle)),.003,.003,(.76,.48,.15))
    for a,b,r1,r2 in [
        ((0,.065,0),(.028,.31,.015),.021,.018),
        ((.028,.31,.015),(-.015,.51,0),.018,.014),
        ((-.015,.51,0),(0,.68,0),.014,.011)]:
        m.stem(a,b,r1,r2,(.10,.27,.055))
    for base,tip,side in [
        ((.015,.25,0),(-.25,.40,.05),(0,0,1)),
        ((.018,.34,.01),(.23,.48,.06),(0,.10,1)),
        ((-.01,.48,0),(-.14,.56,-.10),(-.5,.1,1))]:
        m.ribbon(base,tip,.067,side,(0,.025,.015),(.10,.31,.075))
    # Five staggered whorls form a bud at the center and rolled outer petals.
    layers = [(5,.052,.34),(6,.105,.32),(8,.165,.29),(9,.225,.25),(11,.286,.20)]
    for layer,(count,radius,height) in enumerate(layers):
        for j in range(count):
            phase = TAU*j/count + layer*.53
            rows=[]
            for i in range(12):
                t=i/11
                row=[]
                for k in range(15):
                    u=k/14*2-1
                    angle=phase+u*(pi/count*1.35)+.18*t
                    radius_at_t=.012+radius*t**.78*(1-.16*u*u)+.032*t**6
                    y=.64+height*t+.045*(1-u*u)*t-.050*t**5-.018*u*u*t
                    red=.30+.42*t
                    color=(red,.014+.038*t,.034+.053*t)
                    row.append(m.point((radius_at_t*cos(angle),y,radius_at_t*sin(angle)),color))
                rows.append(row)
            m.bands(rows,False)
    # Small gold handle and subtle highlights outline the clear bell jar.
    m.ellipsoid((0,1.20,0),(.052,.044,.052),brass)
    for theta,y0,y1,width in [(2.69,.20,1.06,.0035),(.39,.62,1.03,.0025)]:
        rows=[]
        for j in range(28):
            t=j/27
            y=y0+(y1-y0)*t
            radius=(.43**2-max(0,y-.75)**2)**.5+.002
            angle=theta+.09*t
            half_width=width*(.2+.8*sin(pi*t))/radius
            rows.append([m.point((radius*cos(angle+v),y,radius*sin(angle+v)),
                                 (.66,.85,.90)) for v in (-half_width,half_width)])
        m.bands(rows,False)

def model_dome(m):
    radius = .43
    thickness = .006
    outer = [(.037,radius),(.50,radius),(.75,radius)]
    inner = [(.037,radius-thickness),(.50,radius-thickness),(.75,radius-thickness)]
    for i in range(1,29):
        angle=pi*.5*i/28
        outer.append((.75+radius*sin(angle),max(.0001,radius*cos(angle))))
        inner.append((.75+(radius-thickness)*sin(angle),
                      max(.0001,(radius-thickness)*cos(angle))))
    m.lathe(outer+list(reversed(inner))+[outer[0]],(.98,.995,1),80)

def model_volcano(m):
    # The broad foot, broken rim, and recessed bowl are built as one continuous shell.
    segments=144
    profile=[(-.22,.84),(-.045,.76),(.12,.65),(.29,.55),(.47,.465),
             (.65,.395),(.83,.35),(1.00,.315),(1.09,.29),
             (1.065,.215),(.91,.195),(.71,.16),(.49,.095),(.36,.001)]
    shades=[(.24,.225,.20),(.34,.295,.24),(.41,.335,.255),(.30,.27,.235),
            (.44,.36,.27),(.35,.31,.255),(.47,.39,.285),(.50,.425,.32),
            (.67,.55,.39),(.37,.30,.23),(.23,.195,.16),(.14,.12,.10),
            (.095,.078,.060),(.065,.052,.04)]
    rings=[]
    dense_profile=[]
    for index in range(len(profile)-1):
        (y0,r0),(y1,r1)=profile[index:index+2]
        c0,c1=shades[index:index+2]
        for step in range(5):
            t=step/5
            dense_profile.append((y0+(y1-y0)*t,r0+(r1-r0)*t,
                                  tuple(a+(b-a)*t for a,b in zip(c0,c1)),
                                  index<8))
    dense_profile.append((*profile[-1],shades[-1],False))

    def rim_height(angle):
        notch=atan2(sin(angle-1.9),cos(angle-1.9))
        return (.045*sin(5*angle+.4)+.018*cos(11*angle)
                +.008*sin(23*angle)-.07*pow(2.718281828,-pow(notch/.24,2)))

    for height,radius,color,exterior in dense_profile:
        row=[]
        for j in range(segments):
            angle=TAU*j/segments
            folds=.032*sin(7*angle+.8*height)+.020*cos(13*angle-1.5*height)
            channel=pow(.5+.5*sin(12*angle+.45*sin(5*angle)+height),8)
            rock_grain=.004*sin(37*angle+43*height)*sin(19*angle-31*height)
            groove=(.014+.008*height)*channel if exterior else 0
            r=max(.001,radius*(1+folds)-groove+rock_grain)
            rim_weight=max(0,min(1,(height-.55)/.48))
            y=height+(rim_height(angle)-.25*radius*sin(angle))*rim_weight
            ash=pow(.5+.5*sin(37*height+1.1*sin(3*angle)),5)
            shade=1-.13*ash-.12*channel+.04*sin(23*angle+27*height)
            row.append(m.point((r*cos(angle)+.035*height,y,r*sin(angle)),
                               tuple(max(.025,c*shade) for c in color)))
        rings.append(row)
    m.bands(rings)
    rng=random.Random(212)
    # Small fractured stones break the smooth silhouette of the crater lip.
    for i in range(18):
        angle=TAU*(i+rng.uniform(-.18,.18))/18
        radius=rng.uniform(.265,.30)
        y=1.085+rim_height(angle)-.25*radius*sin(angle)
        size=rng.uniform(.022,.044)
        m.ellipsoid((radius*cos(angle)+.038,y,radius*sin(angle)),
                    (size,size*.65,size*.85),
                    rng.choice([(.52,.43,.31),(.64,.53,.38),(.40,.34,.27)]),10,6)
    # Scree follows the spherical ground rather than floating on a flat plane.
    for i in range(38):
        angle=TAU*(i+rng.random()*.6)/38
        radius=rng.uniform(.80,.93)
        size=rng.uniform(.023,.065)
        ground=(4-radius*radius)**.5-2
        m.ellipsoid((radius*cos(angle),ground+size*.28,radius*sin(angle)),
                    (size,size*.60,size*.82),
                    rng.choice([(.30,.27,.23),(.40,.34,.26),(.47,.40,.31)]),10,6)

def model_grass(m):
    rng=random.Random(174)
    for i in range(13):
        angle=TAU*(i+rng.random()*.5)/13
        direction=V((cos(angle),0,sin(angle)))
        side=V((-sin(angle),0,cos(angle)))
        height=rng.uniform(.035,.070)
        base=direction*rng.uniform(.002,.015)
        m.ribbon(base,base+direction*height*.5+V((0,height,0)),rng.uniform(.0045,.0065),
                 side,direction*.018,
                 rng.choice([(.10,.23,.045),(.17,.32,.065),(.29,.39,.085)]))

def model_flower(m):
    for cx,cz,height,scale in [(0,0,.18,1),(.064,.025,.115,.70)]:
        center=V((cx,height,cz))
        m.stem((cx*.35,-.009,cz*.35),center,.005,.0035,(.10,.27,.052))
        m.ribbon((cx*.5,.045,cz*.5),(cx+.045,.10,cz+.01),.018,
                 (0,0,1),(0,.01,0),(.13,.32,.06))
        for i in range(9):
            angle=i*TAU/9
            direction=V((cos(angle),0,sin(angle)))
            m.ribbon(center+direction*.012,
                     center+direction*.075*scale+V((0,-.014,0)),
                     .022*scale,(-sin(angle),0,cos(angle)),
                     (0,.016,0),(.96,.91,.75))
        m.ellipsoid(center+V((0,.005,0)),(.021*scale,.014*scale,.021*scale),
                    (.94,.48,.04),16,8)

def model_prince(m):
    green=(.10,.27,.095)
    gold=(.95,.56,.055)
    skin=(.78,.45,.235)
    hair=(.94,.66,.16)
    boots=(.17,.085,.039)
    for x in (-.06,.06):
        m.ellipsoid((x,.045,.035),(.047,.045,.085),boots,18,8)
        m.stem((x,.07,0),(x,.34,0),.031,.038,(.19,.28,.105))
    m.lathe([(.29,.17),(.36,.155),(.49,.119),(.62,.145),
             (.70,.14),(.735,.08)],green,40,lambda p:V((p[0],p[1],p[2]*.62)))
    # A belt, lapels, and buttons make the small coat recognizable from the camera.
    m.lathe([(.475,.121),(.497,.121)],gold,40,lambda p:V((p[0],p[1],p[2]*.64)))
    for x in (-1,1):
        m.ribbon((x*.075,.72,.04),(x*.023,.57,.085),.027,
                 (1,0,0),(0,0,.012),(.20,.38,.12))
        shoulder=V((x*.13,.67,0))
        elbow=V((x*.185,.54,.015))
        wrist=V((x*.16,.435,.045))
        m.stem(shoulder,elbow,.049,.042,green)
        m.stem(elbow,wrist,.042,.031,green)
        m.ellipsoid(wrist+V((0,-.021,.009)),(.031,.041,.028),skin,16,8)
    for y in (.55,.605,.66):
        m.ellipsoid((0,y,.09),(.009,.009,.006),gold,10,6)
    m.stem((0,.72,0),(0,.81,0),.033,.037,skin)
    m.ellipsoid((0,.905,0),(.129,.158,.117),skin,32,20)
    for x in (-1,1):
        m.ellipsoid((x*.126,.902,0),(.025,.035,.018),skin,16,8)
        m.ellipsoid((x*.039,.919,.108),(.008,.012,.007),(.065,.04,.023),12,8)
    m.ellipsoid((0,.885,.125),(.015,.018,.023),skin,16,8)
    m.stem((-.021,.856,.111),(.021,.856,.111),.0025,.0025,(.37,.14,.08))
    # A golden cap and overlapping locks form the tousled hair silhouette.
    profile=[]
    for i in range(13):
        t=pi*.5*i/12
        profile.append((.952+.132*sin(t),max(.0001,.137*cos(t))))
    m.lathe(profile,hair,32,lambda p:V((p[0],p[1],p[2]*.94)))
    for j in range(15):
        a=TAU*j/15
        height=.959+.013*cos(3*a)
        m.ellipsoid((.113*cos(a),height,.105*sin(a)),(.047,.067,.043),
                    (.78+.15*(.5+.5*sin(a)),.49+.14*(.5+.5*sin(a)),.08),16,10)
    for j in range(5):
        a=-.9+j*.44
        base=V((.06*cos(a),1.045,.045*sin(a)))
        tip=base+V((.055*cos(a),.085,.04*sin(a)))
        m.stem(base,tip,.032,.0005,hair)
    m.lathe([(.733,.089),(.750,.107),(.778,.090)],gold,32,
            lambda p:V((p[0],p[1],p[2]*.85)))
    m.ellipsoid((.08,.753,-.025),(.035,.037,.045),gold,16,10)
    for length,offset in [(.68,0),(.46,.028)]:
        rows=[]
        for j in range(27):
            t=j/26
            center=V((.10+.055*sin(pi*t)+offset,
                      .754+.07*sin(2*pi*t)*t+.10*t,
                      -.045-length*t))
            width=.055*(1-.35*t)
            rows.append([m.point(center+V((width*u,.018*(1-u*u)*sin(pi*t),0)),gold)
                         for u in (-1,0,1)])
        m.bands(rows,False)
    # Face the rose along the tangent plane while standing radially upright.
    radial_rotation=V((0,1,0)).matrixToRotateTo(PRINCE)
    toward=ROSE-PRINCE
    toward-=PRINCE*toward.dot(PRINCE)
    local=toward*radial_rotation.inverted()
    yaw=hou.hmath.buildRotate((0,degrees(atan2(local[0],local[2])),0))
    m.points=[tuple(V(point)*yaw) for point in m.points]

def model_sky(m):
    n=48
    grid=[]
    for j in range(n+1):
        y=-12+24*j/n
        row=[]
        for i in range(n+1):
            x=-15+30*i/n
            grain=.5+.25*sin(.8*x+.69*y)+.15*sin(1.9*x-1.3*y)+.1*cos(3.4*y+.9*x)
            glow=max(0,1-((x+1)/9)**2-((y+1)/8)**2)
            color=(.003+.006*glow+.002*grain,
                   .010+.012*glow+.004*grain,
                   .035+.040*glow+.010*grain)
            row.append(m.point((x,y,-6.5),color))
        grid.append(row)
    for a,b in zip(grid,grid[1:]):
        for i in range(n):
            m.faces.append((a[i],a[i+1],b[i+1],b[i]))
    rng=random.Random(612)
    # Large, warm four-point stars echo the reference's illustrated sky.
    stars=[(-3.05,1.15,.115),(-2.8,-.35,.07),(-3.2,-2.25,.095),
           (2.8,1.35,.09),(3.05,-.25,.125),(2.7,-2.55,.11),
           (-1.8,1.55,.06),(.1,1.7,.06),(-1.1,-3.45,.07),
           (1.45,-3.25,.09),(-3.35,-1.25,.045),(3.35,-1.35,.055)]
    stars += [(rng.uniform(-4,4),rng.uniform(-4.1,1.8),rng.uniform(.009,.026))
              for _ in range(180)]
    for x,y,radius in stars:
        center=m.point((x,y,-6.43),(2.1,1.38,.50))
        ring=[]
        twist=rng.uniform(-.18,.18)
        for k in range(8):
            a=TAU*k/8+twist
            r=radius*(1 if k%2==0 else .22)
            ring.append(m.point((x+r*cos(a),y+r*sin(a)*1.3,-6.43),
                                 (1.45,.78,.16)))
        for k in range(8):
            m.faces.append((center,ring[k],ring[(k+1)%8]))

def build_part(part):
    shapes={'rose':(model_rose,'paint',ROSE),'dome':(model_dome,'glass',ROSE),
            'volcano':(model_volcano,'paint',VENT),'grass':(model_grass,'paint',None),
            'flower':(model_flower,'paint',None),'sky':(model_sky,'starlight',None),
            'prince':(model_prince,'paint',PRINCE)}
    draw,material,axis=shapes[part]
    mesh=Mesh()
    draw(mesh)
    geo=hou.pwd().geometry()
    mesh.finish(geo,'/mat/'+material,axis)
    geo.addAttrib(hou.attribType.Point,'Alpha',1.0)
    if part=='dome':
        geo.setPointFloatAttribValues('Alpha',[.045]*len(mesh.points))
