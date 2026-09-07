"""Add built exterior joinery to the approved v3 shell; never repaint its surfaces."""
import bpy, math, json, hashlib
from pathlib import Path
from mathutils import Vector, Matrix

ROOT=Path(__file__).resolve().parents[1]
BASE=ROOT.parent
bpy.ops.wm.open_mainfile(filepath=str(BASE/'shell-v3/bluebird_shell_textured.blend'))
scene=bpy.context.scene
original=[o for o in scene.objects if o.get('architecture')]
groups={}
def srgb(h):
    a=[int(h[i:i+2],16)/255 for i in (0,2,4)]
    return tuple(v/12.92 if v<=.04045 else ((v+.055)/1.055)**2.4 for v in a)+(1,)
def color(name,h,rough=.8,metal=0):
    m=bpy.data.materials.new(name);m.use_nodes=True
    p=m.node_tree.nodes.get('Principled BSDF');p.inputs['Base Color'].default_value=srgb(h)
    p.inputs['Roughness'].default_value=rough;p.inputs['Metallic'].default_value=metal
    p.inputs['Specular IOR Level'].default_value=.25
    return m
def texture(name,filename,rough=.8):
    m=color(name,'FFFFFF',rough);n=m.node_tree.nodes.new('ShaderNodeTexImage')
    n.image=bpy.data.images.load(str(BASE/'textures-oil-v1/basecolor'/filename),check_existing=True)
    n.image.colorspace_settings.name='sRGB';n.image.pack();n.extension='EXTEND'
    m.node_tree.links.new(n.outputs['Color'],m.node_tree.nodes.get('Principled BSDF').inputs['Base Color'])
    return m
ivory=texture('DETAIL_OIL_Ivory_wood','01-ivory-clapboard.png',.84)
teal=texture('DETAIL_OIL_Teal_wood','02-teal-wainscot.png',.82)
rust=texture('DETAIL_OIL_Weathered_sheet','04-rusted-awning.png',.84)
trim=bpy.data.materials['BB_OIL_03-ivory-trim']
glass=bpy.data.materials['glass']
dark=color('DETAIL_Blackened_iron','3B4442',.86)
brass=color('DETAIL_Door_hardware_brass','8A7957',.6,1)
ink=color('DETAIL_Painted_blue_letters','3D595A',.91)
red=color('DETAIL_Painted_oxide_letters','905742',.92)
raw=bpy.data.materials['BB_OIL_07-dining-floor']

def group(name,floor=0,side='front',role='fixture',band='high'):
    if name not in groups:groups[name]={'v':[],'f':[],'uv':[],'mi':[],'m':[],
        'meta':dict(architecture=True,floor=floor,side=side,role=role,band=band,assetScope='architecture_only',exteriorDetail=True)}
    return groups[name]
def face(g,pts,mat,uv=None):
    k=len(g['v']);g['v']+=list(pts);g['f'].append(tuple(range(k,k+len(pts))))
    if mat not in g['m']:g['m'].append(mat)
    g['mi'].append(g['m'].index(mat));g['uv'].append(uv or [(0,0),(1,0),(1,1),(0,1)][:len(pts)])
def box(g,c,size,mat,rot=0,uvrect=(.03,.03,.97,.97)):
    c=Vector(c);R=Matrix.Rotation(rot,3,'Z');w,d,h=size
    p=[c+R@Vector((a*w/2,b*d/2,e*h/2)) for a,b,e in [(-1,-1,-1),(1,-1,-1),(1,1,-1),(-1,1,-1),(-1,-1,1),(1,-1,1),(1,1,1),(-1,1,1)]]
    for ids in [(0,3,2,1),(4,5,6,7),(0,1,5,4),(1,2,6,5),(2,3,7,6),(3,0,4,7)]:
        a,b,e,f=[p[i] for i in ids];u0,v0,u1,v1=uvrect
        uv=[(u0,v0),(u1,v0),(u1,v1),(u0,v1)]
        if mat==trim and (b-a).length>(f-a).length:uv=[(u0,v0),(u0,v1),(u1,v1),(u1,v0)]
        face(g,[a,b,e,f],mat,uv)
def beam(g,a,b,w,mat,depth=None):
    a,b=Vector(a),Vector(b);z=(b-a).normalized();x=z.cross(Vector((0,0,1)))
    if x.length<.01:x=z.cross(Vector((1,0,0)))
    x.normalize();y=z.cross(x);d=depth or w
    p=[q+x*i*w/2+y*j*d/2 for q in [a,b] for i,j in [(-1,-1),(1,-1),(1,1),(-1,1)]]
    for ids in [(0,3,2,1),(4,5,6,7),(0,1,5,4),(1,2,6,5),(2,3,7,6),(3,0,4,7)]:face(g,[p[i] for i in ids],mat)
def tube(g,points,r,mat,thick=.006,sides=12):
    """True hollow pipe with lengthwise UVs and visible wall thickness at open mouths."""
    pts=[Vector(p) for p in points];frames=[];distance=0
    for i,p in enumerate(pts):
        t=(pts[min(i+1,len(pts)-1)]-pts[max(0,i-1)]).normalized()
        x=t.cross(Vector((0,1,0)))
        if x.length<.05:x=t.cross(Vector((1,0,0)))
        x.normalize();y=t.cross(x);distance+=(p-pts[i-1]).length if i else 0
        frames.append((p,x,y,distance))
    rings=lambda radius:[[p+radius*(x*math.cos(j*2*math.pi/sides)+y*math.sin(j*2*math.pi/sides)) for j in range(sides)] for p,x,y,d in frames]
    outer,inner=rings(r),rings(r-thick)
    for i in range(len(pts)-1):
        for j in range(sides):
            k=(j+1)%sides;u0=.02+.92*j/sides;u1=.02+.92*(j+1)/sides
            v0=.06+.84*frames[i][3]/max(distance,.01);v1=.06+.84*frames[i+1][3]/max(distance,.01)
            face(g,[outer[i][j],outer[i][k],outer[i+1][k],outer[i+1][j]],mat,[(u0,v0),(u1,v0),(u1,v1),(u0,v1)])
            face(g,[inner[i][k],inner[i][j],inner[i+1][j],inner[i+1][k]],dark)
    for i in [0,len(pts)-1]:
        for j in range(sides):
            k=(j+1)%sides;face(g,[outer[i][j],inner[i][j],inner[i][k],outer[i][k]],mat)
def rounded(points,radius=.11):
    p=[Vector(v) for v in points];out=[p[0]]
    for i in range(1,len(p)-1):
        a,b,c=p[i-1:i+2];r=min(radius,(b-a).length*.35,(c-b).length*.35)
        q=b+(a-b).normalized()*r;s=b+(c-b).normalized()*r
        for j in range(7):
            t=j/6;out.append((1-t)**2*q+2*(1-t)*t*b+t*t*s)
    return out+[p[-1]]
def collar(g,p,r=.073,axis=(0,0,1),mat=dark):
    a=Vector(p);t=Vector(axis)*.027;tube(g,[a-t,a+t],r,mat,.006,12)
def gutter(g,a,b):
    a,b=Vector(a),Vector(b);axis=(b-a).normalized();side=Vector((-axis.y,axis.x,0));up=Vector((0,0,1));N=10
    for j in range(N):
        t0=math.pi*j/N;t1=math.pi*(j+1)/N
        s0=side*math.cos(t0)-up*math.sin(t0);s1=side*math.cos(t1)-up*math.sin(t1)
        face(g,[a+s0*.096,b+s0*.096,b+s1*.096,a+s1*.096],rust)
        face(g,[a+s1*.088,b+s1*.088,b+s0*.088,a+s0*.088],dark)
    for sign in [-1,1]:tube(g,[a+side*.092*sign,b+side*.092*sign],.01,dark,.003,6)
    # Solid end plates, plus real brackets returning to the fascia.
    for p in [a,b]:
        for j in range(N):
            t0=math.pi*j/N;t1=math.pi*(j+1)/N
            face(g,[p,p+.096*(side*math.cos(t0)-up*math.sin(t0)),p+.096*(side*math.cos(t1)-up*math.sin(t1))],rust,[(.2,.2),(.8,.2),(.8,.8)])
    for j in range(1,math.ceil((b-a).length/1.3)):
        p=a+(b-a)*j/math.ceil((b-a).length/1.3)
        beam(g,p-up*.11,p+side*.19+up*.02,.022,dark)

# Rainwater collection: open channels, sockets, offset elbows, wall straps, open shoes.
drain_specs=[('FRONT',(0.32,-.23),0,3.2,(0,-1)),('RIGHT',(12.23,4.88),0,3.2,(1,0)),
             ('REAR',(11.7,10.23),0,3.2,(0,1)),('UPPER_FRONT',(5.73,3.77),1,5.83,(0,-1)),
             ('UPPER_REAR',(-.23,9.67),1,5.83,(-1,0))]
drain_paths=[]
for label,(x,y),floor,top,n in drain_specs:
    side='front' if 'FRONT' in label else 'right' if label=='RIGHT' else 'rear'
    g=group('D'+str(floor)+'_RAIN_'+label,floor,side,'drain')
    low=3.51 if label=='UPPER_FRONT' else 3.50 if label=='UPPER_REAR' else .19
    nx,ny=n
    path=[(x,y,top+.04),(x,y,top-.18),(x-nx*.07,y-ny*.07,top-.37),(x-nx*.07,y-ny*.07,low+.27),(x+nx*.17,y+ny*.17,low)]
    tube(g,rounded(path),.063,rust)
    for z in [low+.55,(top+low)/2,top-.45]:
        p=(x-nx*.07,y-ny*.07,z);collar(g,p)
        beam(g,p,(x-nx*.24,y-ny*.24,z),.028,dark)
        box(g,(x-nx*.22,y-ny*.22,z),(.10 if nx==0 else .035,.035 if nx==0 else .10,.13),rust,uvrect=(.1,.2,.5,.4))
    collar(g,(x,y,top-.1),.077)
    drain_paths.append({'name':g['meta'],'label':label,'centerline':path,'outsideDiameter':.126,'lowerOutletZ':low})
g=group('D0_RAIN_GUTTERS',0,'front','roof_edge')
for a,b in [((.05,-.23,3.30),(10.68,-.23,3.30)),((12.23,1.34,3.30),(12.23,10.12,3.30)),((12.06,10.23,3.30),(.02,10.23,3.30))]:gutter(g,a,b)
g=group('D1_RAIN_GUTTERS',1,'front','roof_edge')
for a,b in [((-.03,3.77,5.93),(6.10,3.77,5.93)),((-.23,10.04,5.93),(-.23,3.96,5.93)),((6.08,10.23,5.93),(-.1,10.23,5.93))]:gutter(g,a,b)
# Upper rear rain leader continues to ground as a separate ground-floor component.
g=group('D0_REAR_LEADER_EXTENSION',0,'rear','drain')
tube(g,rounded([(-.16,9.67,3.54),(-.16,9.67,.47),(-.39,9.67,.18)]),.063,rust)
for z in [.65,1.8,3.13]:collar(g,(-.16,9.67,z));beam(g,(-.16,9.67,z),(-.01,9.67,z),.03,dark)

# Main sign: board courses, thick case, flashed cap, rear bracing and separately authored lettering.
g=group('D0_MAIN_SIGN_CASE',0,'front','sign')
for row in range(5):
    z=3.39+row*.217
    box(g,(8.44,-.175,z),(4.10,.16,.211),ivory,uvrect=(.02,row/8+.005,.98,(row+1)/8-.005))
for x in [6.34,10.54]:box(g,(x,-.19,3.83),(.15,.24,1.30),trim)
for z in [3.20,4.46]:box(g,(8.44,-.18,z),(4.38,.27,.12),trim)
box(g,(8.44,-.18,4.54),(4.52,.36,.055),rust,uvrect=(.04,.34,.96,.47))
box(g,(8.44,-.29,3.14),(4.51,.12,.095),teal,uvrect=(.02,.43,.98,.6))
for x in [6.66,10.23]:
    box(g,(x,-.03,3.57),(.13,.13,1.47),raw)
    beam(g,(x,.02,4.3),(x,1.04,3.45),.065,dark)
    box(g,(x,.95,3.44),(.28,.28,.06),rust)
    for z in [3.36,4.22]:collar(g,(x,-.322,z),.027,(0,1,0),dark)

font=bpy.data.fonts.load('/System/Library/Fonts/Supplemental/Georgia Bold.ttf')
sans=bpy.data.fonts.load('/System/Library/Fonts/Supplemental/Arial Narrow Bold.ttf')
text_objects=[]
def lettering(name,body,center,width,height,mat,yaw=0,font=font):
    curve=bpy.data.curves.new(name,'FONT');curve.body=body;curve.font=font;curve.align_x='CENTER';curve.align_y='CENTER'
    curve.size=1;curve.resolution_u=5;curve.extrude=0;curve.space_character=1.06
    o=bpy.data.objects.new(name,curve);scene.collection.objects.link(o);curve.materials.append(mat)
    # Local text +Z is its face normal; rotate onto the upright sign, normal facing away from wall.
    o.rotation_euler=(math.pi/2,0,yaw);bpy.context.view_layer.update()
    coords=[Vector(v) for v in o.bound_box];sx=max(v.x for v in coords)-min(v.x for v in coords);sy=max(v.y for v in coords)-min(v.y for v in coords)
    o.scale=(width/max(sx,.01),height/max(sy,.01),1);o.location=center
    for k,v in dict(architecture=True,floor=0,side='front',role='sign',band='high',assetScope='architecture_only',exteriorDetail=True,lettering=body).items():o[k]=v
    text_objects.append(o);return o
lettering('D0_SIGN_BLUEBIRD','BLUEBIRD',(8.44,-.258,4.12),3.48,.32,ink)
lettering('D0_SIGN_DINER','DINER',(8.44,-.258,3.60),3.34,.54,red)

# Blade sign perpendicular to right wall, so the name and vertical EATS read from the corner.
g=group('D0_BLADE_SIGN',0,'corner','sign')
box(g,(12.46,1.43,3.42),(.55,.12,1.90),ivory)
for x in [12.15,12.77]:box(g,(x,1.43,3.42),(.065,.16,2.04),trim)
for z in [2.4,4.44]:box(g,(12.46,1.43,z),(.72,.20,.09),teal)
for z in [2.78,4.1]:
    beam(g,(11.98,1.43,z),(12.64,1.43,z),.048,dark)
    box(g,(12.016,1.43,z),(.045,.18,.25),rust)
for i,ch in enumerate('EATS'):
    lettering('D0_BLADE_FRONT_'+ch,ch,(12.46,1.365,4.06-i*.43),.32,.34,red,font=sans)
    lettering('D0_BLADE_BACK_'+ch,ch,(12.46,1.495,4.06-i*.43),.32,.34,red,math.pi,font=sans)

# Entrance trim and inset joinery. Door leaf is a fixed architectural assembly, not an item.
angle=math.pi/4;t=Vector((math.cos(angle),math.sin(angle),0));n=Vector((math.sin(angle),-math.cos(angle),0));origin=Vector((11.35,.65,0))
def entry(x,z,out=.08):return origin+t*x+n*out+Vector((0,0,z))
g=group('D0_ENTRY_SURROUND',0,'corner','frame')
for x in [-.77,.77]:
    box(g,entry(x,1.43),(.17,.18,2.84),trim,angle)
    box(g,entry(x,.23,.115),(.205,.205,.46),teal,angle)
for z,w,h,out in [(2.58,1.70,.16,.10),(2.78,1.9,.10,.17),(2.85,2.05,.045,.20)]:box(g,entry(0,z,out),(w,.26,h),trim if z<2.8 else rust,angle)
box(g,entry(0,.024,.025),(1.44,.39,.048),raw,angle)
g=group('D0_ENTRY_DOOR',0,'corner','door')
for x in [-.591,.591]:box(g,entry(x,1.22,-.065),(.105,.075,2.37),teal,angle,uvrect=(.3,.12,.40,.95))
for z,h in [(.095,.13),(.90,.18),(2.345,.12)]:box(g,entry(0,z,-.065),(1.13,.075,h),teal,angle,uvrect=(.12,.3,.90,.43))
for i in range(5):box(g,entry(-.442+i*.221,.478,-.084),(.213,.045,.66),teal,angle,uvrect=(i/7,.15,(i+1)/7,.78))
for x in [-.528,.528]:box(g,entry(x,1.63,-.018),(.026,.035,1.31),trim,angle)
for z in [.985,2.275]:box(g,entry(0,z,-.018),(1.08,.035,.027),trim,angle)
gl=group('D0_ENTRY_GLASS',0,'corner','glass')
face(gl,[entry(-.515,1,-.07),entry(.515,1,-.07),entry(.515,2.26,-.07),entry(-.515,2.26,-.07)],glass)
g=group('D0_ENTRY_HARDWARE',0,'corner','door')
for z in [.39,1.19,2.04]:box(g,entry(-.66,z,-.015),(.064,.10,.115),dark,angle)
box(g,entry(.48,1.12,.008),(.065,.026,.27),brass,angle)
tube(g,[entry(.48,1.055,.04),entry(.48,1.055,.11),entry(.48,1.2,.11),entry(.48,1.2,.04)],.014,brass,.004,8)

# Canopy seams and braces follow the original sloping canopy; no replacement of its painted face.
g=group('D0_CANOPY_JOINERY',0,'front','canopy')
for x in [.80,1.70,2.6,3.5,4.4,5.3,6.2]:beam(g,(x,-.08,2.965),(x,-.79,2.710),.026,rust,.04)
for x in [1.04,3.5,5.96]:
    beam(g,(x,-.045,2.31),(x,-.73,2.67),.045,dark)
    box(g,(x,-.042,2.39),(.1,.05,.37),rust)
box(g,(3.5,-.12,2.98),(5.5,.16,.045),rust)
for x in [.80,6.2]:face(g,[(x,-.08,2.94),(x,-.78,2.69),(x,-.78,2.59),(x,-.08,2.83)],rust)
# Small side canopy referenced in right elevation, over the separate kitchen-side window.
g=group('D0_SIDE_CANOPY',0,'right','canopy')
face(g,[(12.08,5.15,2.86),(12.08,6.94,2.86),(12.60,6.94,2.65),(12.60,5.15,2.65)],rust)
box(g,(12.59,6.045,2.61),(.05,1.83,.10),rust)
for y in [5.16,5.60,6.04,6.49,6.94]:beam(g,(12.07,y,2.88),(12.61,y,2.68),.024,rust)
for y in [5.27,6.81]:beam(g,(12.045,y,2.36),(12.53,y,2.61),.037,dark)

# Window aprons, projecting sills and drip flashings, kept below/above every real opening.
window_specs=[(0,'front',(0,0),0,[(.9,6.1,1.15,2.75),(6.6,9.7,1.15,2.75)]),
 (0,'right',(12,1.3),math.pi/2,[(.4,3.2,1.15,2.75),(3.9,5.6,1.3,2.6)]),
 (0,'rear',(12,10),math.pi,[(1.8,3.9,1.6,2.6),(5.8,8.5,1.6,2.6),(9.5,11,1.6,2.6)]),
 (1,'front',(0,4),0,[(.65,2.05,4.02,5.42),(3.7,5.1,4.02,5.42)]),
 (1,'right',(6,4),math.pi/2,[(3.75,4.75,4.3,5.4)])]
for floor,side,(ox,oy),rot,windows in window_specs:
    g=group(f'D{floor}_{side.upper()}_WINDOW_JOINERY',floor,side,'frame')
    def point(s,z,out):return (ox+math.cos(rot)*s+math.sin(rot)*out,oy+math.sin(rot)*s-math.cos(rot)*out,z)
    for a,b,bottom,top in windows:
        mid=(a+b)/2
        box(g,point(mid,bottom-.145,.05),(b-a+.14,.08,.10),teal,rot)
        box(g,point(mid,bottom-.08,.155),(b-a+.3,.20,.038),trim,rot)
        box(g,point(mid,top+.12,.08),(b-a+.25,.20,.038),rust,rot,uvrect=(.12,.4,.86,.47))

# Built-in roof exhausts: flashing, curb, pipe body, collars, weather hood and visible supports.
def vent(name,pos,height,radius,floor):
    x,y,z=pos;g=group(name,floor,'rear','roof')
    box(g,(x,y,z+.025),(radius*3.7,radius*3.7,.05),rust)
    box(g,(x,y,z+.13),(radius*2.5,radius*2.5,.24),dark)
    tube(g,[(x,y,z+.22),(x,y,z+height-.12)],radius,rust,.014,16)
    collar(g,(x,y,z+height-.20),radius+.017)
    for j in range(3):
        a=j*2*math.pi/3;beam(g,(x+radius*.72*math.cos(a),y+radius*.72*math.sin(a),z+height-.24),(x+radius*.72*math.cos(a),y+radius*.72*math.sin(a),z+height+.03),.025,dark)
    for j in range(16):
        a=j*2*math.pi/16;b=(j+1)*2*math.pi/16
        face(g,[(x,y,z+height+.13),(x+radius*1.55*math.cos(a),y+radius*1.55*math.sin(a),z+height),(x+radius*1.55*math.cos(b),y+radius*1.55*math.sin(b),z+height)],rust,[(.5,.9),(.1,.1),(.9,.1)])
    return g
vent('D0_KITCHEN_EXHAUST',(9.12,7.75,3.4),.68,.28,0)
vent('D0_ROOF_AIR_VENT',(7.17,5.91,3.4),.42,.15,0)
vent('D1_STOVE_FLUE',(1.01,8.8,6),.98,.105,1)

# A fixed porch light is attached to the entry header, not suspended in empty space.
g=group('D0_ENTRY_PORCH_LIGHT',0,'corner','fixture')
box(g,entry(0,3.035,.055),(.15,.055,.24),dark,angle)
tube(g,rounded([entry(0,3.08,.10),entry(0,3.13,.26),entry(0,3.06,.42)],.06),.025,dark,.006,10)
c=entry(0,2.99,.42)
lamp=color('DETAIL_Porch_bulb','D9AE70',.54)
lp=lamp.node_tree.nodes.get('Principled BSDF');lp.inputs['Emission Color'].default_value=srgb('D9AE70');lp.inputs['Emission Strength'].default_value=.5
for j in range(16):
    a=j*2*math.pi/16;b=(j+1)*2*math.pi/16
    def ringpoint(r,z,theta):return c+Vector((r*math.cos(theta),r*math.sin(theta),z))
    face(g,[ringpoint(.07,.07,a),ringpoint(.07,.07,b),ringpoint(.19,-.025,b),ringpoint(.19,-.025,a)],rust)
    face(g,[ringpoint(.036,.015,a),ringpoint(.036,.015,b),ringpoint(.041,-.095,b),ringpoint(.041,-.095,a)],lamp)
    face(g,[c+Vector((0,0,-.11)),ringpoint(.041,-.095,a),ringpoint(.041,-.095,b)],lamp,[(.5,.5),(0,0),(1,0)])

new=[]
for name,g in groups.items():
    mesh=bpy.data.meshes.new(name);mesh.from_pydata(g['v'],[],g['f']);mesh.update()
    uv=mesh.uv_layers.new(name='UVMap')
    for p,coords,mi in zip(mesh.polygons,g['uv'],g['mi']):
        p.material_index=mi
        for i,co in zip(p.loop_indices,coords):uv.data[i].uv=co
    for m in g['m']:mesh.materials.append(m)
    o=bpy.data.objects.new(name,mesh);scene.collection.objects.link(o)
    for k,v in g['meta'].items():o[k]=v
    new.append(o)
# Keep editable typography in a hidden collection; export only converted exact letter meshes.
type_collection=bpy.data.collections.new('SOURCE · Editable sign typography');scene.collection.children.link(type_collection)
for o in text_objects:
    saved=o.copy();saved.data=o.data.copy();type_collection.objects.link(saved);saved.name='SOURCE_'+o.name
    saved.hide_render=True;saved.hide_set(True);saved['architecture']=False
    bpy.ops.object.select_all(action='DESELECT');o.select_set(True);bpy.context.view_layer.objects.active=o
    bpy.ops.object.convert(target='MESH');bpy.context.object.visible_shadow=False;new.append(bpy.context.object)
arch=original+new
def camera(name,pos,target,scale):
    data=bpy.data.cameras.new(name);data.type='ORTHO';data.ortho_scale=scale
    o=bpy.data.objects.new(name,data);scene.collection.objects.link(o);o.location=pos
    o.rotation_euler=(Vector(target)-Vector(pos)).to_track_quat('-Z','Y').to_euler();return o
camera('CAM_ENTRY_DETAIL',(17,-8,5.3),(10.38,.65,2.45),7.4)
camera('CAM_ROOF_DETAIL',(19,-9,14),(8.5,4.4,3.5),12)
camera('CAM_STREET',(21,-22,10.7),(6,3.5,2.6),19)
scene.camera=bpy.data.objects['CAM_EXTERIOR']
scene.cycles.samples=32;scene.render.image_settings.color_mode='RGBA'
scene.render.resolution_x=1500;scene.render.resolution_y=1150;scene.render.resolution_percentage=100
for o in arch:o.hide_set(False);o.hide_render=False
scene['exterior_revision']='v4: built joinery; original v3 geometry / UVs / images retained'
helper=bpy.data.texts.get('README_AND_VIEWS.py') or bpy.data.texts.new('README_AND_VIEWS.py')
helper.clear();helper.write('''# Select MODE, then Run Script. Fixed details follow their host cutaway.\nimport bpy\nMODE="exterior" # exterior / ground / upper\nfor o in bpy.data.objects:\n if not o.get("architecture"):continue\n hide=False\n if MODE=="ground":hide=o["floor"]==1 or o["role"] in ["roof","roof_edge"] or (o["side"] in ["front","right","corner"] and o["band"]=="high")\n if MODE=="upper":hide=(o["floor"]==0 and o["role"]!="stair") or o["role"] in ["roof","roof_edge"] or (o["side"] in ["front","right","corner"] and (o["role"] in ["wall","frame","glass"] or o.get("exteriorDetail")))\n o.hide_render=hide;o.hide_set(hide)\nbpy.context.scene.camera=bpy.data.objects["CAM_"+MODE.upper()]\n''')
bpy.ops.wm.save_as_mainfile(filepath=str(ROOT/'bluebird_exterior_detailed.blend'))
def export(path,objs):
    bpy.ops.object.select_all(action='DESELECT')
    for o in objs:o.select_set(True)
    bpy.ops.export_scene.gltf(filepath=str(path),export_format='GLB',use_selection=True,export_extras=True,export_cameras=False,export_lights=False)
export(ROOT/'bluebird_exterior_detailed.glb',arch)
export(ROOT/'bluebird_exterior_details.glb',new)
def signature(o):return hashlib.sha256(repr(([tuple(v.co) for v in o.data.vertices],[tuple(p.vertices) for p in o.data.polygons],list(o.matrix_world))).encode()).hexdigest()
manifest={'revision':4,'base':'shell-v3','scope':'Fixed architectural exterior details, no freestanding props or interior contents',
 'reference':'../design-v3/primary-reference.png','dimensions':'Existing 12 × 10 m ground floor and 6 × 6 m upper floor unchanged',
 'originalGeometry':{o.name:signature(o) for o in original},'newObjects':[dict(name=o.name,**{k:o[k] for k in ['floor','side','role','band']}) for o in new],
 'triangles':sum(sum(len(p.vertices)-2 for p in o.data.polygons) for o in arch),'detailTriangles':sum(sum(len(p.vertices)-2 for p in o.data.polygons) for o in new),
 'rainwater':drain_paths,'signText':['BLUEBIRD','DINER','EATS'],'texturePolicy':'Existing approved v3 shell remains unmodified; additions reuse oil-v1 source maps',
 'runtimeComposition':'Load shell-v3 base and detail-only GLB at the same transform; full GLB is standalone offline delivery'}
(ROOT/'manifest.json').write_text(json.dumps(manifest,ensure_ascii=False,indent=2)+'\n')
print('DETAIL_BUILD_COMPLETE',manifest['detailTriangles'],len(new),flush=True)
