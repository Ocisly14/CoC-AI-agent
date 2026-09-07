"""Bluebird diner, authored in metres. Blender 5.2+, no add-ons required.
Native +Y points towards kitchen; GLB +Z points towards street.
Rebuild: Blender --background --factory-startup --python this_file
"""
import bpy, math, random, json, sys
from pathlib import Path
from mathutils import Vector
from collections import defaultdict
R=Path(__file__).resolve().parents[1]
random.seed(1985)
bpy.ops.object.select_all(action='SELECT'); bpy.ops.object.delete(use_global=False)
for c in list(bpy.data.collections):
    if c.name != 'Collection': bpy.data.collections.remove(c)
scene=bpy.context.scene
scene.unit_settings.system='METRIC'; scene.unit_settings.scale_length=1
scene.render.engine='CYCLES'; scene.cycles.device='CPU'; scene.cycles.samples=32
scene.cycles.use_denoising=True
scene.render.resolution_x=1500; scene.render.resolution_y=1300; scene.render.resolution_percentage=100
scene.render.image_settings.file_format='PNG'
scene.view_settings.view_transform='AgX'
scene.world.color=(.15,.15,.15)
scene.world.use_nodes=True
scene.world.node_tree.nodes['Background'].inputs['Color'].default_value=(.48,.57,.62,1)
scene.world.node_tree.nodes['Background'].inputs['Strength'].default_value=.45
F=2.891; TOP=5.90
COL={}
for n in ['01_STRUCTURE','02_DINING','03_KITCHEN','04_RESIDENCE','05_ROOF','06_SITE','07_RENDER_RIG','08_SHADOW_PROXY']:
    c=bpy.data.collections.new(n); scene.collection.children.link(c); COL[n]=c
context={'col':COL['01_STRUCTURE'],'floor':0,'role':'shell','side':'','id':''}
root=bpy.data.objects.new('gh_bluebird_diner_a_lod0',None); COL['01_STRUCTURE'].objects.link(root)
root['assetId']='bluebird_diner'; root['authorMetersToSceneUnits']=2.0
root['sceneGroundY']=.4; root['nativeFront']='-Y'; root['exportFront']='+Z'; root['version']='1.0'
root['roomIds']=['SCN_bluebird_dining','SCN_bluebird_kitchen','SCN_bluebird_upstairs']
GROUPS={}; current=root

def scope(col=None,floor=None,role=None,side='',id=''):
    global current
    if col: context['col']=COL[col]
    if floor is not None: context['floor']=floor
    if role: context['role']=role
    context['side']=side; context['id']=id
    key=(context['col'].name,context['floor'],context['role'],side,id)
    if key not in GROUPS:
        nm=id or f"f{context['floor']}_{context['role']}_{side or 'all'}"
        g=bpy.data.objects.new(nm,None); context['col'].objects.link(g); g.parent=root
        g['floor']=context['floor']; g['role']=context['role']
        if side:g['side']=side
        if id:g['itemId' if id.startswith('item.') else 'connectionId']=id
        GROUPS[key]=g
    current=GROUPS[key]
    return current

def finish(o,name,mat):
    o.name='gh_bluebird_'+name+'_a_lod0'
    for c in list(o.users_collection): c.objects.unlink(o)
    context['col'].objects.link(o); o.parent=current
    o['floor']=context['floor']; o['role']=context['role']; o['side']=context['side']
    if context['id']: o['semanticId']=context['id']
    if mat:o.data.materials.append(M[mat])
    return o

def linear(h):
    cs=[int(h[i:i+2],16)/255 for i in (0,2,4)]
    return tuple(c/12.92 if c<=.04045 else ((c+.055)/1.055)**2.4 for c in cs)+(1,)

M={}
def material(name,color,rough=.75,metal=0,texture=None,transmission=0,emission=0):
    m=bpy.data.materials.new('mat_'+name); m.use_nodes=True
    n=m.node_tree.nodes; p=n.get('Principled BSDF'); p.inputs['Base Color'].default_value=linear(color)
    p.inputs['Roughness'].default_value=rough; p.inputs['Metallic'].default_value=metal
    p.inputs['Transmission Weight'].default_value=transmission
    p.inputs['IOR'].default_value=1.46
    if emission:
        p.inputs['Emission Color'].default_value=linear(color); p.inputs['Emission Strength'].default_value=emission
    if texture:
        for suffix,socket,space in [('basecolor','Base Color','sRGB'),('roughness','Roughness','Non-Color')]:
            t=n.new('ShaderNodeTexImage'); t.image=bpy.data.images.load(str(R/'textures'/f'{texture}_{suffix}.png'),check_existing=True)
            t.image.colorspace_settings.name=space; t.extension='REPEAT'; m.node_tree.links.new(t.outputs['Color'],p.inputs[socket])
    m.diffuse_color=linear(color); M[name]=m; return m
for n,c in [('siding','8C9990'),('blue','496669'),('trim','C3B79D'),('wood','8A6B49'),('darkwood','514537'),('plaster','C5B99E'),('roof','4B4E49'),('green','394F43'),('red','874C40'),('cloth','DED5BF'),('stone','777E77'),('iron','343838')]: material(n,c,texture=n,metal=1 if n=='iron' else 0)
for n,c,r,m in [('steel','A2AAA6',.34,1),('brass','B59961',.45,1),('enamel','D3CEB7',.34,0),('black','252A29',.46,0),('paper','DFD2B2',.92,0),('tile_light','ACA78C',.72,0),('tile_dark','6D776A',.78,0),('rust','984F43',.91,0),('soup','88582B',.34,0),('ochre','B58A50',.79,0),('chalk','DDD4BE',.98,0),('glass','B5C9C1',.14,0)]:material(n,c,r,m,transmission=.96 if n=='glass' else 0)
material('milkglass','E7DDC8',.35,emission=.8)
material('backdrop','68716C',.98)

def uv_metric(o,scale=1.6):
    if o.type!='MESH':return
    uv=o.data.uv_layers.active or o.data.uv_layers.new(name='UVMap')
    for p in o.data.polygons:
        a=max(range(3),key=lambda k:abs(p.normal[k]))
        axes=(1,2) if a==0 else (0,2) if a==1 else (0,1)
        for li in p.loop_indices:
            v=o.data.vertices[o.data.loops[li].vertex_index].co
            uv.data[li].uv=(v[axes[0]]/scale,v[axes[1]]/scale)

def box(name,loc,size,mat,bev=.012):
    bpy.ops.mesh.primitive_cube_add(size=1,location=loc); o=bpy.context.object
    o.dimensions=size; bpy.ops.object.transform_apply(location=False,rotation=False,scale=True)
    finish(o,name,mat); uv_metric(o)
    if bev:
        mod=o.modifiers.new('Softened construction edges','BEVEL'); mod.width=min(bev,min(size)/3); mod.segments=1
        mod=o.modifiers.new('Weighted corner normals','WEIGHTED_NORMAL'); mod.keep_sharp=True; mod.weight=40
    return o

def cyl(name,loc,r,depth,mat,verts=24,r2=None):
    bpy.ops.mesh.primitive_cone_add(vertices=verts,radius1=r,radius2=r if r2 is None else r2,depth=depth,location=loc)
    o=finish(bpy.context.object,name,mat)
    for p in o.data.polygons:p.use_smooth=len(p.vertices)==4
    return o

def sphere(name,loc,scale,mat):
    bpy.ops.mesh.primitive_uv_sphere_add(segments=16,ring_count=8,radius=1,location=loc)
    o=finish(bpy.context.object,name,mat); o.scale=scale
    bpy.ops.object.transform_apply(location=False,rotation=False,scale=True)
    for p in o.data.polygons:p.use_smooth=True
    return o

def tube(name,points,r,mat,cyclic=False):
    d=bpy.data.curves.new(name,'CURVE'); d.dimensions='3D'; d.resolution_u=1; d.bevel_depth=r; d.bevel_resolution=1
    s=d.splines.new('POLY'); s.points.add(len(points)-1)
    for p,co in zip(s.points,points):p.co=(*co,1)
    s.use_cyclic_u=cyclic
    o=bpy.data.objects.new(name,d); context['col'].objects.link(o)
    return finish(o,name,mat)

def ring(name,loc,major,minor,mat,axis='Z'):
    pts=[]
    for i in range(32):
        a=i*math.tau/32; u,v=major*math.cos(a),major*math.sin(a)
        q=(u,v,0) if axis=='Z' else (u,0,v) if axis=='Y' else (0,u,v)
        pts.append(tuple(loc[k]+q[k] for k in range(3)))
    return tube(name,pts,minor,mat,True)

def lathe(name,loc,profile,mat,segments=32):
    vs=[]; fs=[]
    for r,z in profile:
        for i in range(segments):
            a=i*math.tau/segments; vs.append((loc[0]+r*math.cos(a),loc[1]+r*math.sin(a),loc[2]+z))
    for j in range(len(profile)-1):
        for i in range(segments):fs.append((j*segments+i,j*segments+(i+1)%segments,(j+1)*segments+(i+1)%segments,(j+1)*segments+i))
    mesh=bpy.data.meshes.new(name); mesh.from_pydata(vs,[],fs); mesh.update()
    o=bpy.data.objects.new(name,mesh); context['col'].objects.link(o); finish(o,name,mat); uv_metric(o,.7)
    for p in mesh.polygons:p.use_smooth=True
    return o

font=bpy.data.fonts.load('/System/Library/Fonts/Supplemental/Georgia.ttf')
def text(name,body,loc,size,mat='trim',rotation=(math.pi/2,0,0)):
    d=bpy.data.curves.new(name,'FONT');d.body=body;d.font=font;d.size=size;d.align_x='CENTER';d.align_y='CENTER';d.extrude=.0008
    o=bpy.data.objects.new(name,d);context['col'].objects.link(o);o.location=loc;o.rotation_euler=rotation
    return finish(o,name,mat)

def legtable(name,x,y,z,w,d,h,mat='wood'):
    box(name+'_top',(x,y,z+h),(w,d,.065),mat,.025)
    for dx in [-w/2+.09,w/2-.09]:
        for dy in [-d/2+.09,d/2-.09]:box(name+'_leg',(x+dx,y+dy,z+h/2),(.055,.055,h),'darkwood')

def wall_axis(side):return (0,-5.5) if side=='front' else (0,5.5) if side=='back' else (-3.5,0) if side=='left' else (3.5,0)

def wallsegment(side,a,b,z,h,mat='siding',depth=.18):
    # Segment runs horizontally along a wall. All low pieces survive cutaway.
    if b-a<.008 or h<.008:return
    x,y=wall_axis(side)
    if mat=='plaster':
        if side=='front':y+=.10
        elif side=='back':y-=.10
        elif side=='left':x+=.10
        elif side=='right':x-=.10
    if side in ('front','back'):pos=((a+b)/2,y,z+h/2);size=(b-a,depth,h)
    else:pos=(x,(a+b)/2,z+h/2);size=(depth,b-a,h)
    box('weatherboard_'+side,pos,size,mat,.005)

def wall(side,a,b,z0,z1,openings,floor):
    row=.145
    for j in range(math.ceil((z1-z0)/row)):
        z=z0+j*row; h=min(row,z1-z)-.007
        cuts=sorted([(max(a,l),min(b,r)) for l,r,lo,hi in openings if z<hi and z+h>lo and r>a and l<b])
        bounds=[]; cursor=a
        for l,r in cuts:
            if l>cursor:bounds.append((cursor,l))
            cursor=max(cursor,r)
        if cursor<b:bounds.append((cursor,b))
        scope('01_STRUCTURE',floor,'wall_low' if z<z0+.78 else 'wall_upper',side)
        for l,r in bounds:wallsegment(side,l,r,z,h)
    # Interior plaster panels share openings with exterior; no sealed window cards.
    cutsZ=sorted({z0,z1,*[v for g in openings for v in g[2:] if z0<v<z1],z0+.78})
    for lo,hi in zip(cutsZ,cutsZ[1:]):
        ranges=sorted([(l,r) for l,r,b0,t0 in openings if lo<t0 and hi>b0])
        cursor=a
        for l,r in ranges+[(b,b)]:
            if l>cursor:
                scope('01_STRUCTURE',floor,'wall_low' if hi<=z0+.78 else 'wall_upper',side)
                o=wallsegment(side,cursor,min(l,b),lo,hi-lo,'plaster',.10)
            cursor=max(cursor,r)

def window(side,a,b,bottom,top,floor,door=False):
    scope('01_STRUCTURE',floor,'wall_upper',side)
    x,y=wall_axis(side); mid=(a+b)/2; w=b-a; h=top-bottom
    if side in ('front','back'):
        s=-1 if side=='front' else 1; plane=y+s*.13
        def part(n,u,z,ww,hh,mat='trim',dd=.10):return box(n,(u,plane,z),(ww,dd,hh),mat)
        glass=box('window_glazing',(mid,plane,(top+bottom)/2),(w-.1,.018,h-.1),'glass',0)
    else:
        s=-1 if side=='left' else 1; plane=x+s*.13
        def part(n,u,z,ww,hh,mat='trim',dd=.10):return box(n,(plane,u,z),(dd,ww,hh),mat)
        glass=box('window_glazing',(plane,mid,(top+bottom)/2),(.018,w-.1,h-.1),'glass',0)
    for u in (a,b):part('window_jamb',u,(top+bottom)/2,.09,h+.14)
    for z in (bottom,top):part('window_rail',mid,z,w+.20,.09)
    if not door:
        part('sash_rail',mid,bottom+h*.58,w,.055)
        for u in [mid] if w<1.8 else [a+w/3,a+2*w/3]:part('window_mullion',u,(top+bottom)/2,.045,h)
        part('projecting_sill',mid,bottom-.05,w+.25,.10,dd=.24)
    else:
        part('door_lower_panel',mid,bottom+.27,w-.14,.45,'blue')
        part('door_pushrail',mid,bottom+1.0,w-.08,.05,'brass')

# Base and weatherboarding. Real author dimensions calibrated to existing 14 x 22 unit footprint.
scope('01_STRUCTURE',0,'floor')
box('masonry_plinth',(0,0,-.14),(7.12,11.12,.28),'stone',.035)
box('ground_slab',(0,0,-.035),(6.85,10.85,.07),'stone',0)
# Checker linoleum: quiet large fields, no dense microtexture.
for i in range(14):
    for j in range(13):
        x=-3.25+i*.5;y=-5.25+j*.5
        box('linoleum',(x,y,.007),(.494,.494,.014),'tile_light' if (i+j)%2 else 'tile_dark',0)
front0=[(-2.525,-1.525,0,2.15),(-.25,2.775,.6,2.30)]
front1=[(-2.95,-1.55,F+.70,F+2.05),(-.70,.70,F+.70,F+2.05),(1.55,2.95,F+.70,F+2.05)]
left0=[(-4.45,-3.25,.65,2.0),(-2.775,-1.575,.65,2),(-1.1,.1,.65,2)]
back0=[(-2.3,-.75,.80,1.95),(1.45,2.4,.80,1.95)]
wall('front',-3.5,3.5,0,F,front0,0);wall('front',-3.5,3.5,F,TOP,front1,1)
wall('left',-5.5,5.5,0,F,left0,0);wall('left',-5.5,1.1,F,TOP,[],1)
wall('right',-5.5,5.5,0,F,[],0);wall('right',-5.5,1.1,F,TOP,[],1)
wall('back',-3.5,3.5,0,F,back0,0)
for g in front0:window('front',*g,0,door=g==front0[0])
for g in front1:window('front',*g,1)
for g in left0:window('left',*g,0)
for g in back0:window('back',*g,0)
# Corner boards and water-table trim, independently classified per facade.
for f,lo,hi in [(0,0,F),(1,F,TOP)]:
    for side in ['front','left','right']:
        scope('01_STRUCTURE',f,'wall_upper',side)
        vals=[-3.48,3.48] if side=='front' else [-5.48,1.06 if f else 5.48]
        for p in vals:
            x,y=wall_axis(side); loc=(p,y, (lo+hi)/2) if side=='front' else (x,p,(lo+hi)/2)
            box('corner_board',loc,(.17,.23,hi-lo),'trim')
# Upper floor retains the staircase void, matching x=2.35..3.25,y=-.85..1.1.
scope('01_STRUCTURE',1,'floor')
box('upper_slab_main',(-.575,-2.2,F-.10),(5.85,6.6,.20),'darkwood')
box('upper_slab_front',(2.925,-3.175,F-.10),(1.15,4.65,.20),'darkwood')
for i in range(34):
    x=-3.4+i*.2
    yend=-.85 if x>2.35 else 1.1
    for j in range(4):
        l=(yend+5.5)/4; y=-5.5+l*(j+.5)
        box('upstairs_floorboard',(x,y,F+.012),(.194,l-.006,.024),'wood',.002)
# Rear upper wall: true stair opening, no door to the outdoors.
scope('01_STRUCTURE',1,'wall_low','rear_upper')
box('upper_rear_low',(-.58,1.1,F+.38),(5.86,.18,.76),'plaster')
scope('01_STRUCTURE',1,'wall_upper','rear_upper')
for a,b in [(-3.5,-2.3),(-1,1),(2.2,2.35),(3.25,3.5)]:box('upper_rear_pier',((a+b)/2,1.1,F+1.38),(b-a,.18,1.24),'plaster')
box('upper_rear_lintel',(0,1.1,F+2.505),(7,.18,1.01),'plaster')
for x,w in [(-1.65,1.3),(1.6,1.2)]:
    box('upper_rear_glazing',(x,1.1,F+1.38),(w,.02,1.23),'glass',0)
    for z in [F+.77,F+1.38,F+2]:box('rear_window_rail',(x,1.1,z),(w+.08,.14,.045),'trim')
    for xx in [x-w/2,x+w/2]:box('rear_window_jamb',(xx,1.1,F+1.38),(.06,.14,1.3),'trim')
# Bedroom partition left; keep passage at y around -1.75.
for a,b in [(-5.4,-2.35),(-1.20,1.0)]:
    scope('01_STRUCTURE',1,'wall_low','partition');box('bedroom_dado',(-.6,(a+b)/2,F+.38),(.10,b-a,.76),'darkwood')
    scope('01_STRUCTURE',1,'wall_upper','partition');box('bedroom_partition',(-.6,(a+b)/2,F+1.82),(.1,b-a,2.1),'plaster')
# Main gable behind false front and low kitchen lean-to.
scope('05_ROOF',1,'roof')
for s in [-1,1]:
    o=box('main_roof',(s*1.84,-2.2,6.25),(3.86,7.0,.13),'roof');o.rotation_euler.y=s*math.atan2(.67,3.7)
    for j in range(9):
        y=-5.55+j*.84
        o=box('roof_course',(s*1.84,y,6.335),(3.87,.026,.022),'darkwood',0);o.rotation_euler.y=s*math.atan2(.67,3.7)
    tube('gutter',[(s*3.73,-5.65,5.96),(s*3.73,1.30,5.96)],.065,'iron')
box('ridge_cap',(0,-2.2,6.63),(.14,7.0,.10),'iron')
scope('05_ROOF',0,'roof')
o=box('kitchen_roof',(0,3.35,3.11),(7.45,4.7,.16),'roof');o.rotation_euler.x=-.055
for y in [1.15+i*.55 for i in range(9)]:box('kitchen_roof_seam',(0,y,3.29-(y-1.15)*.055),(7.45,.025,.025),'darkwood',0)
cyl('kitchen_flue',(-2.85,4.5,3.8),.14,1.30,'iron');cyl('flue_cap',(-2.85,4.5,4.48),.23,.09,'iron')
# Stepped false-front, sign and canopy are exterior removable shell.
scope('01_STRUCTURE',1,'wall_upper','front')
for a,b,h in [(-3.6,-2.45,.34),(-2.45,2.45,.74),(2.45,3.6,.34)]:
    box('stepped_parapet',((a+b)/2,-5.57,TOP+h/2),(b-a,.23,h),'blue')
    box('parapet_cap',((a+b)/2,-5.57,TOP+h),(b-a+.12,.31,.09),'trim')
box('signboard',(0,-5.69,5.51),(5.75,.15,.72),'blue')
for z in [5.15,5.87]:box('sign_border',(0,-5.78,z),(5.85,.04,.035),'trim',0)
text('bluebird_sign','BLUEBIRD',(0,-5.79,5.5),.55)
scope('01_STRUCTURE',0,'wall_upper','front')
o=box('front_canopy',(0,-5.91,2.66),(7.35,.9,.09),'roof');o.rotation_euler.x=.16
for x in [-3.3,3.3]:tube('canopy_bracket',[(x,-5.52,2.1),(x,-6.16,2.54),(x,-5.52,2.6)],.025,'iron')
scope('01_STRUCTURE',0,'wall_low','front')
box('front_step',(-2.02,-5.83,-.035),(1.3,.60,.16),'stone',.02)
scope('02_DINING',0,'fixtures',id='item.bluebird_dining.door_sign')
box('open_sign',(-2.025,-5.67,1.3),(.53,.035,.28),'darkwood')
text('open_english','OPEN',(-2.025,-5.695,1.35),.10,'paper');text('open_portuguese','ABERTO',(-2.025,-5.695,1.25),.062,'paper')
tube('sign_string',[(-2.28,-5.68,1.45),(-2.025,-5.68,1.62),(-1.77,-5.68,1.45)],.005,'darkwood')
# Authentic use wear is placed at board bases, sill edges and handles, not random story marks.
for side in ['front','left','right']:
    scope('01_STRUCTURE',0,'wall_low',side)
    for i in range(26):
        u=random.uniform(-3.3,3.3) if side=='front' else random.uniform(-5.3,5.3)
        x,y=wall_axis(side)
        loc=(u,y-.102,.12+random.random()*.12) if side=='front' else (x+(-.102 if side=='left' else .102),u,.12+random.random()*.12)
        size=(random.uniform(.08,.25),.002,.008) if side=='front' else (.002,random.uniform(.08,.25),.008)
        box('salt_paint_loss',loc,size,'wood',0)
# Local brush-shaped paint loss at sill drip edges and near ground splash zone.
for side,windows in [('front',front0+front1),('left',left0)]:
    for a,b,lo,hi in windows:
        f=1 if lo>F else 0
        scope('01_STRUCTURE',f,'wall_upper',side)
        for k in range(12):
            u=random.uniform(a,b);ln=random.uniform(.025,.11)
            if side=='front':loc=(u,-5.759,lo-.053);dims=(ln,.003,.013)
            else:loc=(-3.759,u,lo-.053);dims=(.003,ln,.013)
            box('sill_edge_paint_loss',loc,dims,'wood',0)
# Upper weatherboards keep restrained dry-brush wear; boards are still sound construction.
for side in ['front','left','right']:
    for i in range(68):
        f=i%2;z=(F if f else 0)+random.uniform(.10,.60)
        scope('01_STRUCTURE',f,'wall_low' if z<(F if f else 0)+.78 else 'wall_upper',side)
        u=random.uniform(-3.35,3.35) if side=='front' else random.uniform(-5.3,1.0 if f else 5.3)
        if side=='front':loc=(u,-5.594,z);dims=(random.uniform(.04,.20),.002,random.uniform(.002,.008))
        elif side=='left':loc=(-3.594,u,z);dims=(.002,random.uniform(.04,.20),random.uniform(.002,.008))
        else:loc=(3.594,u,z);dims=(.002,random.uniform(.04,.20),random.uniform(.002,.008))
        # Skip ground front doorway and all actual window openings.
        openings=front1 if f and side=='front' else front0 if side=='front' else left0 if side=='left' and not f else []
        if not any(a<u<b and l<z<h for a,b,l,h in openings):box('weatherboard_dry_wear',loc,dims,'wood',0)
# Downpipes attach to original gutters and disappear with their relevant upper wall.
for x in [-3.62,3.62]:
    for f,points in [(0,[(x,1.32,F),(x,1.32,.24),(x,1.49,.08)]),(1,[(x,1.18,5.95),(x,1.32,5.75),(x,1.32,F)])]:
        scope('01_STRUCTURE',f,'wall_upper','left' if x<0 else 'right')
        tube('rain_downpipe',points,.04,'iron')

# Dining fixtures. Physical furniture heights corrected independently of schematic anchors.
def item(room,name,col=None,floor=0,role='contents'):
    return scope(col or ('02_DINING' if room=='dining' else '03_KITCHEN' if room=='kitchen' else '04_RESIDENCE'),floor,role,id=f'item.bluebird_{room}.{name}')
# Partition is deliberately split around serving hatch and the spring door pair.
for a,b in [(-3.4,-.70),( .70,1.28),(2.25,3.4)]:
    scope('01_STRUCTURE',0,'wall_low','partition');box('kitchen_dado',((a+b)/2,1.1,.38),(b-a,.15,.76),'darkwood')
    scope('01_STRUCTURE',0,'wall_upper','partition');box('kitchen_wall',((a+b)/2,1.1,1.80),(b-a,.15,2.08),'plaster')
scope('01_STRUCTURE',0,'wall_low','partition');box('pass_base',(0,1.1,.48),(1.4,.15,.96),'darkwood')
scope('01_STRUCTURE',0,'wall_upper','partition');box('pass_lintel',(0,1.1,2.5),(1.4,.15,.68),'plaster')
box('door_lintel',(1.765,1.1,2.55),(.97,.15,.58),'plaster')
box('pass_shelf',(0,1.1,1.02),(1.58,.52,.055),'steel')
for x in [1.53,2.0]:
    scope('02_DINING',0,'fixtures',id='connection.bluebird_dining.kitchen_door')
    # A clear upper round pane in each spring door; geometry frame and inset glazing.
    box('spring_door_lower',(x,1.11,.68),(.44,.075,1.24),'green')
    box('spring_door_upper',(x,1.11,1.89),(.44,.075,.46),'green')
    for xx in [x-.195,x+.195]:box('spring_door_stile',(xx,1.11,1.48),(.05,.075,.45),'green')
    ring('porthole_frame',(x,1.06,1.5),.16,.025,'brass','Y')
    o=cyl('porthole_glass',(x,1.11,1.5),.154,.012,'glass');o.rotation_euler.x=math.pi/2
    box('door_pushplate',(x,1.055,1.02),(.12,.016,.23),'steel')
    current['hingeNative']=[x+(-.23 if x<1.8 else .23),1.1,0]
item('dining','lunch_counter')
box('counter_carcass',(.70,-2.15,.46),(.85,5.1,.92),'blue',.022)
box('maple_counter',(.62,-2.15,.95),(1.02,5.25,.11),'wood',.045)
for y in [-4.28,-3.05,-1.8,-.55]:box('counter_recess',(.254,y,.48),(.028,1.08,.65),'darkwood',.008)
tube('counter_footrail',[(-.04,-4.55,.19),(-.04,.28,.19)],.025,'brass')
for y in [-4.1,-3.38,-2.66,-1.94,-1.22,-.50]:
    cyl('stool_foot',(-.45,y,.035),.16,.07,'iron');cyl('stool_pedestal',(-.45,y,.34),.033,.60,'steel')
    ring('stool_foot_ring',(-.45,y,.26),.13,.012,'steel')
    cyl('red_seat',(-.45,y,.68),.195,.105,'red',32);ring('seat_piping',(-.45,y,.716),.18,.007,'ochre')
    box('seat_patch',(-.51,y,.736),(.10,.075,.002),'rust',0)
item('dining','booths')
for y in [-.5,-2.175,-3.85]:
    for s in [-1,1]:
        box('booth_plinth',(-2.35,y+s*.57,.20),(1.35,.45,.40),'darkwood')
        box('green_booth_seat',(-2.35,y+s*.55,.46),(1.36,.51,.14),'green',.05)
        box('green_booth_back',(-2.35,y+s*.80,.77),(1.36,.13,.77),'green',.04)
        for x in [-2.85,-2.55,-2.25,-1.95]:tube('upholstery_channel',[(x,y+s*.721,.57),(x,y+s*.721,1.08)],.006,'darkwood')
        box('booth_top_wear',(-2.38,y+s*.80,1.163),(.65,.055,.004),'olive' if 'olive' in M else 'wood',0)
    cyl('booth_table_pedestal',(-2.35,y,.37),.055,.74,'steel')
    cyl('booth_table_foot',(-2.35,y,.04),.23,.06,'iron')
    box('booth_table',(-2.35,y,.77),(1.25,.66,.065),'enamel',.035)
    item('dining','sugar_shakers')
    box('condiment_tray',(-2.77,y,.825),(.29,.21,.026),'steel')
    for k in range(3):
        x=-2.86+k*.085
        cyl('glass_condiment',(x,y,.895),.031,.12,'glass',16)
        cyl('sugar_or_pepper',(x,y,.876),.026,.075,'paper' if k!=1 else 'darkwood',16)
        cyl('metal_pour_cap',(x,y,.96),.033,.025,'steel',16)
    cyl('ketchup',(-2.75,y+.07,.92),.035,.17,'red',16,r2=.022)
    item('dining','booths')
# Chrome espresso machine with boiler, group head, handles and steam wand.
item('dining','espresso_machine')
box('coffee_base',(.64,-4.15,1.05),(.66,.46,.09),'steel')
box('coffee_boiler',(.72,-4.19,1.30),(.48,.34,.42),'steel',.08)
for y in [-4.29,-4.1]:
    o=cyl('grouphead',(.43,y,1.25),.068,.13,'brass');o.rotation_euler.y=math.pi/2
    tube('portafilter',[(.41,y,1.22),(.24,y,1.20)],.022,'black')
    cyl('cup_on_tray',(.30,y,1.11),.043,.075,'enamel')
for i in range(8):box('drip_grid',(.39,-4.33+i*.047,1.101),(.22,.007,.006),'iron',0)
tube('steam_wand',[(.55,-3.97,1.40),(.31,-3.93,1.36),(.27,-3.93,1.14)],.012,'steel')
o=cyl('pressure_gauge',(.465,-4.2,1.51),.041,.015,'paper');o.rotation_euler.y=math.pi/2
# Pastry case, metal frame, glass panes, two shelves and properly modeled tart cups.
item('dining','pastry_case')
box('pastry_base',(.63,-2.4,1.036),(.80,.87,.05),'steel')
for z in [1.07,1.32]:
    box('pastry_shelf',(.63,-2.4,z),(.70,.77,.015),'steel')
    for x in [.43,.72]:
        for y in [-2.62,-2.36,-2.12]:
            lathe('tart_crust',(x,y,z+.008),[(.045,0),(.060,.025),(.057,.032),(.046,.021),(0,.02)],'ochre',16)
            cyl('custard',(x,y,z+.031),.045,.009,'soup',16)
box('case_front',(.215,-2.4,1.30),(.012,.83,.46),'glass',0)
box('case_top',(.63,-2.4,1.55),(.83,.90,.015),'glass',0)
for y in [-2.84,-1.96]:
    box('case_side',(.63,y,1.30),(.81,.012,.46),'glass',0)
    for x in [.215,1.04]:box('case_corner',(x,y,1.30),(.018,.018,.52),'steel',0)
item('dining','cash_register')
box('register_drawer',(.65,-.62,1.04),(.48,.45,.10),'darkwood')
box('register_body',(.70,-.62,1.23),(.32,.42,.28),'brass',.045)
box('register_keydeck',(.45,-.62,1.12),(.22,.42,.06),'brass')
for i in range(4):
    for j in range(3):
        cyl('register_key',(.37+j*.067,-.77+i*.096,1.162),.021,.021,'paper',12)
box('register_display',(.71,-.62,1.43),(.06,.32,.10),'black')
item('dining','tip_jar')
lathe('tip_jar',(.58,-.98,1.01),[(0,0),(.067,0),(.07,.02),(.068,.17),(.061,.18),(.058,.17),(.058,.02),(0,.02)],'glass',24)
for i in range(12):cyl('tip_coin',(.58+random.uniform(-.035,.035),-.98+random.uniform(-.035,.035),1.03+i*.002),.014,.002,'brass',12)
box('jar_label',(.51,-.98,1.09),(.003,.10,.05),'paper',0)
# Radios intentionally show only the source-established station name.
def radio(x,y,z,small=False):
    w,d,h=(.25,.15,.18) if small else (.36,.21,.23)
    box('radio_case',(x,y,z+h/2),(w,d,h),'darkwood',.025)
    box('radio_fabric',(x-w*.15,y-d/2-.002,z+h*.5),(w*.48,.007,h*.70),'cloth',0)
    for xx in [x+w*.24]:
        o=cyl('radio_knob',(xx,y-d/2-.016,z+h*.26),.022,.025,'black',16);o.rotation_euler.x=math.pi/2
    box('radio_dial',(x+w*.22,y-d/2-.01,z+h*.70),(w*.28,.008,.045),'paper',0)
    text('station','KGRV',(x+w*.21,y-d/2-.018,z+h*.70),.018,'black')
item('dining','counter_radio');radio(.91,.03,1.01)
item('dining','wall_clock',role='fixtures')
ring('clock_rim',(1.02,1.004,2.36),.18,.022,'darkwood','Y')
o=cyl('clock_face',(1.02,1.003,2.36),.18,.022,'paper',48);o.rotation_euler.x=math.pi/2
for i in range(12):
    a=i*math.tau/12
    tube('clock_tick',[(1.02+.145*math.sin(a),.985,2.36+.145*math.cos(a)),(1.02+.163*math.sin(a),.985,2.36+.163*math.cos(a))],.003,'black')
tube('clock_hands',[(.965,.975,2.405),(1.02,.975,2.36),(1.02,.975,2.49)],.006,'black')
item('dining','menu_board',role='fixtures')
box('menu_frame',(3.365,-2.4,1.80),(.09,.92,1.02),'darkwood')
box('menu_chalkface',(3.31,-2.4,1.80),(.012,.79,.88),'black',0)
# Known dishes only. Unspecified prices and three dishes deliberately remain undecorated.
text('menu_title','TODAY',(3.296,-2.4,2.09),.09,'chalk',(math.pi/2,0,-math.pi/2))
text('menu_soup','FISH STEW',(3.296,-2.4,1.88),.065,'chalk',(math.pi/2,0,-math.pi/2))
text('menu_tarts','PASTEIS DE NATA',(3.296,-2.4,1.72),.048,'chalk',(math.pi/2,0,-math.pi/2))
item('dining','newspaper_rack')
box('newspaper_back',(-3.15,-5.07,.45),(.50,.07,.83),'darkwood')
for x in [-3.41,-2.9]:box('newspaper_side',(x,-4.95,.28),(.035,.30,.55),'wood')
for z in [.11,.36]:box('newspaper_bar',(-3.15,-4.80,z),(.55,.035,.04),'wood')
for i in range(4):
    o=box('folded_newspaper',(-3.34+i*.12,-4.95,.43),(.105,.04,.41),'paper',.003);o.rotation_euler.x=-.20
# Wall phone: correct mounted configuration (not motel desk phone).
item('dining','wall_phone',role='fixtures')
box('wall_phone_body',(3.34,-.04,1.49),(.14,.25,.40),'black',.04)
o=cyl('rotary_dial',(3.257,-.04,1.43),.080,.013,'brass',32);o.rotation_euler.y=math.pi/2
for i in range(10):
    a=i*math.tau/11
    o=cyl('dial_finger_hole',(3.246,-.04+.057*math.sin(a),1.43+.057*math.cos(a)),.011,.007,'black',12);o.rotation_euler.y=math.pi/2
for y in [-.145,.07]:sphere('receiver_end',(3.22,y,1.72),(.055,.062,.060),'black')
tube('phone_receiver',[(3.22,-.15,1.72),(3.20,-.10,1.77),(3.20,.03,1.77),(3.22,.075,1.72)],.032,'black')
pts=[]
for i in range(160):
    t=i/159;pts.append((3.24+.018*math.cos(t*math.tau*24),-.10+.018*math.sin(t*math.tau*24),1.64-.70*t))
tube('coiled_phone_cord',pts,.0045,'black')
# Milk glass lamps: two rows. Physical emitters remain attached to lamps.
LAMPS=[]
def area(name,loc,energy,color,size,target):
    d=bpy.data.lights.new(name,'AREA');d.energy=energy;d.color=color;d.shape='DISK';d.size=size
    o=bpy.data.objects.new(name,d);COL['07_RENDER_RIG'].objects.link(o);o.location=loc;o.rotation_euler=(Vector(target)-o.location).to_track_quat('-Z','Y').to_euler();return o
item('dining','ceiling_lights',role='fixtures')
for x in [-1.35,1.30]:
    for y in [-1,-2.2,-3.4]:
        tube('lamp_cable',[(x,y,F-.05),(x,y,2.19)],.008,'black')
        cyl('lamp_socket',(x,y,2.17),.038,.14,'brass')
        lathe('milk_glass_shade',(x,y,1.99),[(.16,0),(.19,.04),(.15,.12),(.07,.19),(.048,.20)],'milkglass',24)
        LAMPS.append(area('dining_lamp',(x,y,2.01),24,(1,.75,.44),.27,(x,y,0)))
# Kitchen floors and stair: continuous straight run climbs through rear upper opening.
scope('03_KITCHEN',0,'floor');box('kitchen_floor',(0,3.25,.005),(6.78,4.28,.018),'stone',0)
scope('03_KITCHEN',0,'stairs',id='connection.bluebird_kitchen.stairs_up')
N=16;run=3.20;start=4.02
for i in range(N):
    h=(i+1)*F/N;y=start-(i+.5)*run/N
    box('stair_tread',(2.8,y,h-.032),(.88,run/N+.02,.064),'wood',.008)
    box('stair_riser',(2.8,y+run/N/2-.016,h-F/N/2),(.88,.032,F/N),'darkwood',.004)
    if i%2==0:
        for x in [2.32,3.27]:box('stair_baluster',(x,y,h+.43),(.035,.035,.86),'darkwood',.004)
for x in [2.31,3.28]:
    tube('stair_handrail',[(x,start-.13,.88+F/N),(x,start-run+.10,F+.88)],.031,'wood')
    tube('stair_stringer',[(x,start-.12,.045),(x,start-run+.1,F-.19)],.065,'darkwood')
box('upper_stair_landing',(2.8,.0,F-.045),(.9,1.70,.09),'wood')
scope('04_RESIDENCE',1,'stairs')
for y in [-.8,-.3,.2,.7]:box('landing_baluster',(2.32,y,F+.43),(.036,.036,.86),'darkwood')
tube('landing_handrail',[(2.32,-.85,F+.90),(2.32,.95,F+.90)],.033,'wood')
# Kitchen range on west wall. Six burners, intact oven and true hollow pot.
item('kitchen','range')
box('range_body',(-2.90,4.43,.44),(.95,1.38,.80),'iron',.025)
box('range_top',(-2.90,4.43,.88),(1.02,1.44,.07),'steel')
for y in [3.96,4.43,4.9]:
    for x in [-3.15,-2.65]:
        cyl('burner',(x,y,.928),.10,.022,'iron')
        for a in [0,math.pi/2]:
            o=box('burner_grate',(x,y,.95),(.29,.026,.025),'iron',.003);o.rotation_euler.z=a
    o=cyl('gas_knob',(-2.409,y,.76),.037,.03,'black');o.rotation_euler.y=math.pi/2
box('range_hood',(-2.89,4.43,2.16),(1.21,1.58,.27),'steel',.025)
box('hood_duct',(-2.89,4.43,2.6),(.35,.42,.70),'iron')
item('kitchen','stew_pot')
POT=(-3.10,4.42,.967)
lathe('cast_iron_pot',POT,[(0,0),(.12,0),(.154,.025),(.18,.195),(.18,.225),(.165,.225),(.162,.198),(.138,.03),(0,.03)],'iron',48)
ring('pot_rim',(POT[0],POT[1],POT[2]+.22),.173,.012,'iron')
ring('amber_residue',(POT[0],POT[1],POT[2]+.205),.164,.008,'soup')
for s in [-1,1]:
    tube('pot_ear',[(POT[0]+s*.164,POT[1]-.065,POT[2]+.17),(POT[0]+s*.23,POT[1]-.055,POT[2]+.19),(POT[0]+s*.24,POT[1]+.045,POT[2]+.19),(POT[0]+s*.164,POT[1]+.065,POT[2]+.17)],.014,'iron')
cyl('stew_surface',(POT[0],POT[1],POT[2]+.164),.158,.012,'soup',48)
for i in range(7):
    a=i*2.4;r=.03+i*.014
    sphere('stew_vegetable',(POT[0]+r*math.cos(a),POT[1]+r*math.sin(a),POT[2]+.174),(.026,.015,.007),'ochre')
item('kitchen','old_oven')
box('cream_oven',(-2.91,3.1,.47),(.96,1.10,.9),'enamel',.045)
box('oven_door',(-2.409,3.1,.43),(.05,.88,.55),'iron',.02)
box('oven_door_window',(-2.376,3.1,.43),(.018,.61,.32),'black')
tube('oven_handle',[(-2.33,2.76,.70),(-2.29,2.76,.7),(-2.29,3.44,.7),(-2.33,3.44,.7)],.019,'steel')
for y in [2.80,3.05,3.30]:
    o=cyl('oven_control',(-2.405,y,.83),.035,.03,'black');o.rotation_euler.y=math.pi/2
for y in [2.65,3.52]:box('oven_enamel_chip',(-2.40,y,.18),(.006,.07,.014),'iron',0)
item('kitchen','tart_tray')
for z in [.25,.56,.87]:
    box('tart_rack',(-2.90,2.33,z),(.87,.51,.03),'steel')
    for x in [-3.14,-2.9,-2.66]:
        for y in [2.2,2.44]:lathe('baking_tin',(x,y,z+.02),[(.045,0),(.06,.03),(.055,.033),(.04,.007),(0,.007)],'brass',16)
for x in [-3.29,-2.51]:box('tart_rack_upright',(x,2.33,.46),(.03,.46,.92),'steel')
item('kitchen','spice_rack')
for z in [1.5,1.87]:
    box('spice_shelf',(-3.25,3.1,z),(.35,1.36,.04),'wood')
    for i in range(6):
        y=2.55+i*.22
        cyl('spice_can',(-3.22,y,z+.12),.065,.20,'brass' if i%2 else 'glass',16)
        cyl('spice_lid',(-3.22,y,z+.226),.066,.017,'iron',16)
# Prep table, shelf and tools, with actual underside clearance.
item('kitchen','prep_table')
legtable('prep',-.8,3.2,0,.87,2.85,.89,'steel')
box('prep_lower_shelf',(-.8,3.2,.26),(.79,2.68,.035),'steel')
box('cutting_board',(-.8,2.65,.947),(.62,.47,.055),'wood',.015)
for y in [2.15,3.7,4.15]:
    for i in range(5):cyl('stacked_plate',(-.8,y,.3+i*.018),.14,.02,'enamel',24)
item('kitchen','knife_block')
box('knife_block',(-.82,1.87,1.02),(.19,.22,.22),'wood',.015)
for i in range(3):
    x=-.89+i*.065
    box('knife_blade',(x,1.87,1.17),(.018,.055,.20),'steel',.002)
    box('knife_handle',(x,1.87,1.315),(.024,.041,.12),'darkwood',.008)
item('kitchen','dish_sink')
box('sink_underframe',(-1.54,5.12,.45),(2.0,.56,.04),'steel')
for x in [-2.45,-.62]:
    for y in [4.90,5.35]:box('sink_leg',(x,y,.42),(.035,.035,.84),'steel')
for x in [-2.17,-1.54,-.91]:
    box('sink_basin_bottom',(x,5.11,.63),(.56,.46,.04),'steel')
    for dx in [-.28,.28]:box('sink_side',(x+dx,5.11,.745),(.027,.50,.24),'steel')
    for yy in [4.86,5.36]:box('sink_side',(x,yy,.745),(.59,.027,.24),'steel')
    tube('sink_faucet',[(x,5.37,.88),(x,5.37,1.17),(x,5.24,1.23),(x,5.06,1.23),(x,5.06,1.14)],.018,'steel')
box('sink_backsplash',(-1.54,5.41,1.01),(2.03,.04,.31),'steel')
item('kitchen','extinguisher',role='fixtures')
cyl('extinguisher_body',(-.45,5.32,1.57),.073,.38,'red');sphere('extinguisher_shoulder',(-.45,5.32,1.77),(.072,.072,.053),'red')
box('extinguisher_label',(-.45,5.24,1.57),(.09,.004,.17),'paper',0)
tube('extinguisher_handle',[(-.51,5.32,1.84),(-.36,5.32,1.84)],.012,'iron')
tube('extinguisher_hose',[(-.38,5.32,1.81),(-.32,5.29,1.76),(-.32,5.26,1.39)],.012,'black')
item('kitchen','cooler')
# Move 0.25 m away from stair approach within the existing rear-right equipment zone.
box('cooler', (3.04,5.06,.98),(.70,.67,1.91),'enamel',.05)
box('cooler_gasket',(3.04,4.705,1.04),(.62,.027,1.64),'black')
box('cooler_door',(3.04,4.681,1.04),(.59,.04,1.60),'enamel',.023)
tube('cooler_handle',[(2.83,4.64,.88),(2.83,4.61,.9),(2.83,4.61,1.20),(2.83,4.64,1.22)],.014,'steel')
item('kitchen','pantry_shelf')
for z in [.12,.57,1.02,1.47,1.92]:box('pantry_shelf',(1.77,5.16,z),(.92,.50,.04),'wood')
for x in [1.29,2.25]:box('pantry_upright',(x,5.16,1.0),(.045,.52,2.02),'darkwood')
for z in [.62,1.07,1.52]:
    for x in [1.48,1.77,2.07]:
        cyl('pantry_tin',(x,5.10,z+.10),.09,.20,'enamel' if x<1.6 else 'brass',16)
for x in [1.50,1.95]:sphere('coffee_rice_sack',(x,5.1,.32),(.17,.18,.18),'cloth')
item('kitchen','order_wheel',role='fixtures')
ring('order_wheel',(0,1.3,1.88),.20,.011,'steel')
tube('order_wheel_axle',[(0,1.3,1.85),(0,1.3,2.15)],.009,'steel')
for i in range(7):
    a=i*math.tau/7
    box('order_ticket',(.20*math.cos(a),1.3+.20*math.sin(a),1.80),(.073,.01,.13),'paper',0)
item('kitchen','kitchen_radio');radio(-.4,1.25,1.06,True)
item('kitchen','dolores_apron',role='fixtures')
# Garment prop, no human body or character geometry.
vs=[(3.33,4.00,1.60),(3.33,4.22,1.60),(3.32,4.24,1.30),(3.29,4.35,.88),(3.32,3.84,.88),(3.32,3.98,1.30)]
me=bpy.data.meshes.new('apron');me.from_pydata(vs,[],[(0,1,2,3,4,5)]);me.update()
o=bpy.data.objects.new('apron',me);context['col'].objects.link(o);finish(o,'hanging_apron','cloth');uv_metric(o)
tube('apron_loop',[(3.32,4,1.6),(3.33,4.1,1.77),(3.32,4.22,1.6)],.009,'cloth')
# Upstairs residence: left bedroom, front-facing rocker, rear dresser.
item('upstairs','bed',floor=1)
box('bed_mattress',(-2.53,-3.97,F+.53),(1.21,2.02,.23),'cloth',.07)
box('bed_quilt',(-2.53,-3.61,F+.674),(1.22,1.22,.065),'green',.025)
for x in [-2.87,-2.28]:box('bed_pillow',(x,-4.61,F+.705),(.49,.39,.12),'cloth',.055)
for y,h in [(-4.99,1.10),(-2.95,.85)]:
    for x in [-3.18,-1.88]:
        tube('bed_post',[(x,y,F+.06),(x,y,F+h)],.022,'enamel');sphere('bed_finial',(x,y,F+h+.023),(.035,.035,.035),'brass')
    tube('bed_rail',[(-3.18,y,F+h-.09),(-1.88,y,F+h-.09)],.021,'enamel')
    for i in range(7):tube('bed_spindle',[(-3.10+i*.19,y,F+.35),(-3.10+i*.19,y,F+h-.09)],.011,'enamel')
for x in [-3.14,-1.92]:tube('bed_side_rail',[(x,-4.98,F+.4),(x,-2.96,F+.4)],.025,'iron')
item('upstairs','bedside_lamp',floor=1)
legtable('bedside',-1.42,-4.75,F,.52,.49,.56,'darkwood')
cyl('lamp_base',(-1.42,-4.75,F+.61),.11,.03,'brass')
cyl('lamp_stem',(-1.42,-4.75,F+.82),.025,.40,'brass')
lathe('fringed_lamp',(-1.42,-4.75,F+.95),[(.22,0),(.21,.025),(.105,.28),(.102,.30)],'cloth',32)
for i in range(32):
    a=i*math.tau/32;x=-1.42+.21*math.cos(a);y=-4.75+.21*math.sin(a)
    tube('lampshade_fringe',[(x,y,F+.95),(x,y,F+.88)],.0035,'cloth')
LAMPS.append(area('bedside_bulb',(-1.42,-4.75,F+.99),9,(1,.64,.32),.16,(-1.42,-4.75,F)))
item('upstairs','wardrobe',floor=1)
box('wardrobe_body',(-2.63,-2.07,F+.97),(1.1,.56,1.89),'darkwood',.03)
for x in [-2.92,-2.37]:
    box('wardrobe_door',(x,-2.368,F+1.0),(.51,.036,1.72),'wood')
    box('wardrobe_raised_panel',(x,-2.39,F+1.03),(.39,.028,1.45),'darkwood')
for x in [-2.70,-2.56]:sphere('wardrobe_handle',(x,-2.423,F+1.03),(.015,.022,.015),'brass')
box('wardrobe_crown',(-2.63,-2.07,F+1.97),(1.22,.65,.11),'darkwood')
item('upstairs','tablecloth',floor=1)
# Parametric cloth profile retains broad calm planes and a hanging hem.
cyl('round_table_pedestal',(1.20,-2.75,F+.39),.085,.77,'darkwood')
for a in [0,math.pi/2,math.pi,3*math.pi/2]:tube('table_foot',[(1.2,-2.75,F+.3),(1.2+.35*math.cos(a),-2.75+.35*math.sin(a),F+.05)],.037,'darkwood')
cyl('round_table_top',(1.2,-2.75,F+.76),.63,.055,'wood',48)
vs=[];fs=[]
for row,(rad,z) in enumerate([(0,F+.815),(.645,F+.815),(.68,F+.79),(.70,F+.47)]):
    for i in range(64):
        a=i*math.tau/64; r=rad+(0 if row<2 else .02*math.sin(a*12));zz=z+(0 if row<3 else .027*math.cos(a*12))
        vs.append((1.2+r*math.cos(a),-2.75+r*math.sin(a),zz))
for j in range(3):
    for i in range(64):fs.append((j*64+i,j*64+(i+1)%64,(j+1)*64+(i+1)%64,(j+1)*64+i))
me=bpy.data.meshes.new('tablecloth');me.from_pydata(vs,[],fs);me.update();o=bpy.data.objects.new('tablecloth',me);context['col'].objects.link(o);finish(o,'pressed_tablecloth','cloth');uv_metric(o)
# Quiet border stitches, decorative only.
ring('tablecloth_hem',(1.2,-2.75,F+.49),.70,.006,'trim')
item('upstairs','rocking_chair',floor=1)
x,y=2.14,-4.65
# Seat faces native -Y (street window). Back towards room, curved rocker runners.
box('rocker_seat',(x,y,F+.46),(.53,.53,.07),'wood',.028)
box('rocker_cushion',(x,y-.035,F+.51),(.44,.42,.045),'green',.025)
for dx in [-.25,.25]:
    tube('rocker_runner',[(x+dx,y+t,F+.035+.17*(t/.62)**2) for t in [-.62,-.45,-.2,0,.2,.45,.62]],.027,'darkwood')
    for dy in [-.20,.22]:tube('chair_leg',[(x+dx,y+dy,F+.075),(x+dx,y+dy,F+.67)],.020,'wood')
    tube('rocker_arm',[(x+dx,y-.30,F+.70),(x+dx,y+.29,F+.70)],.026,'wood')
    tube('rocker_back_post',[(x+dx,y+.23,F+.4),(x+dx,y+.37,F+1.05)],.023,'darkwood')
for dx in [-.18,-.09,0,.09,.18]:tube('rocker_back_spindle',[(x+dx,y+.25,F+.53),(x+dx,y+.36,F+.98)],.012,'wood')
tube('rocker_crest',[(x-.27,y+.37,F+1.02),(x,y+.38,F+1.10),(x+.27,y+.37,F+1.02)],.035,'wood')
item('upstairs','sewing_basket',floor=1)
lathe('sewing_basket',(2.92,-4.81,F+.03),[(0,0),(.13,0),(.18,.17),(.17,.19),(.155,.17),(.115,.025),(0,.025)],'wood',24)
for z in [F+.07,F+.1,F+.13,F+.16]:ring('basket_weave',(2.92,-4.81,z),.135+(z-F)*.2,.005,'trim')
for i in range(4):cyl('sewing_spool',(2.84+(i%2)*.1,-4.86+(i//2)*.10,F+.17),.023,.07,'red' if i%2 else 'cloth',12)
item('upstairs','dresser',floor=1)
box('dresser_body',(1.59,.71,F+.62),(1.2,.53,1.13),'darkwood',.025)
for i in range(5):
    z=F+.19+i*.20
    box('dresser_drawer',(1.59,.424,z),(1.10,.045,.175),'wood')
    for x in [1.26,1.92]:
        ring('drawer_pull',(x,.387,z),.026,.006,'brass','Y')
box('dresser_top',(1.59,.71,F+1.22),(1.31,.62,.085),'darkwood')
box('crochet_runner',(1.59,.71,F+1.267),(.91,.39,.009),'cloth',0)
item('upstairs','recipe_book',floor=1)
box('recipe_cover',(1.39,.69,F+1.29),(.31,.23,.035),'darkwood',.004)
for x,rot in [(1.311,.07),(1.469,-.07)]:
    o=box('open_recipe_page',(x,.69,F+1.312),(.15,.215,.013),'paper',.002);o.rotation_euler.y=rot
# Non-legible ink strokes communicate handwriting without inventing recipe clues.
for j in range(5):box('recipe_ink',(1.47,.62+j*.028,F+1.322),(.09,.0015,.001),'wood',0)
item('upstairs','letters',floor=1)
for i in range(5):box('letter_envelope',(1.88,.68,F+1.279+i*.006),(.24,.15,.005),'paper',.001)
box('letter_rubberband',(1.88,.68,F+1.313),(.014,.151,.002),'ochre',0)
item('upstairs','photo_wall',floor=1,role='fixtures')
# Existing portrait imagery is not fabricated. Archival image planes are explicitly pending.
for i,(y,z,w,h) in enumerate([(-1.65,.95,.38,.48),(-2.28,1.32,.48,.35),(-2.95,1.28,.55,.41),(-3.75,1.46,.34,.46),(-4.4,1.16,.31,.41)]):
    box('archive_frame',(3.37,y,F+z),(.07,w,h),'darkwood')
    box('archive_mat',(3.326,y,F+z),(.012,w-.055,h-.055),'paper',0)
    box('archive_image_placeholder',(3.313,y,F+z),(.009,w-.105,h-.105),'stone',0)
current['artStatus']='Frame geometry complete; existing canonical images required for image planes. No generated portraits.'
item('upstairs','saint_statue',floor=1)
box('devotional_shelf',(3.23,-1.20,F+1.22),(.43,.38,.04),'darkwood')
# Small porcelain household object, not a character asset: deliberately no facial detail.
cyl('porcelain_plinth',(3.21,-1.20,F+1.26),.075,.045,'enamel')
lathe('porcelain_mantle',(3.21,-1.20,F+1.28),[(.073,0),(.065,.08),(.039,.19),(.029,.22)],'blue',20)
sphere('porcelain_head',(3.21,-1.20,F+1.526),(.033,.03,.042),'enamel')
cyl('candle_holder',(3.13,-1.32,F+1.255),.028,.021,'brass');cyl('candle',(3.13,-1.32,F+1.30),.015,.07,'cloth')
item('upstairs','calendar',floor=1,role='fixtures')
box('calendar_back',(-.96,1.0,F+1.60),(.30,.021,.40),'paper')
box('calendar_image',(-.96,.986,F+1.69),(.25,.003,.14),'blue',0)
# Year only is established. Month/date markings remain unfilled to avoid inventing clues.
text('calendar_year','1985',(-.96,.98,F+1.49),.035,'darkwood')
# Context plinth and pavement are presentation only, excluded from runtime asset.
scope('06_SITE',-1,'presentation')
box('ground_plane',(0,0,-.40),(200,200,.20),'backdrop',0)
box('site_paving',(0,-.2,-.255),(8.25,12.75,.12),'stone',.015)
for x in [-3.95+i*.65 for i in range(13)]:
    for y in [-6.10,-5.70]:box('sidewalk_slab',(x,y,-.18),(.64,.38,.07),'trim',.01)
for x in [-3.99,3.99]:box('side_curb',(x,0,-.19),(.16,11.7,.12),'stone',.018)
# Render cameras and lights: separate, no baked shadows in base color.
key=area('overcast_warm_key',(-6,-8,12),1500,(1,.85,.65),7,(0,0,1))
fill=area('cool_sky_fill',(5,4,10),1000,(.62,.76,1),8,(0,0,2))
CAMERAS={}
def camera(name,loc,target,scale):
    d=bpy.data.cameras.new(name);d.type='ORTHO';d.ortho_scale=scale;d.lens=50;d.clip_end=300
    o=bpy.data.objects.new(name,d);COL['07_RENDER_RIG'].objects.link(o);o.location=loc;o.rotation_euler=(Vector(target)-o.location).to_track_quat('-Z','Y').to_euler();CAMERAS[name]=o;return o
camera('01_exterior',(-13,-18,12),(0,-.1,2.3),16.4)
camera('02_ground_cutaway',(-12,-16,17),(0,0,.65),15.7)
camera('03_residence',(-11,-15,17),(0,-2.2,F+.45),10.9)
camera('04_kitchen',(-9,-7,13),(-.2,3.25,.85),9.5)
camera('05_stew_pot',(-4.1,3.28,2.0),(-3.1,4.42,1.12),.93)
camera('06_exterior_dusk',(-13,-18,12),(0,-.1,2.3),16.4)
scene.camera=CAMERAS['01_exterior']
# Helpers for repeatable inspection views. Visibility is geometry-based; rig belongs only to previews.
def set_view(name):
    for o in bpy.data.objects:o.hide_render=False
    COL['08_SHADOW_PROXY'].hide_render=True
    scene.camera=CAMERAS[name]
    for o in bpy.data.objects:
        if o.type in ('LIGHT','CAMERA') or o.type=='EMPTY':continue
        f=o.get('floor',-1);role=o.get('role','');side=o.get('side','')
        hide=False
        if name in ['02_ground_cutaway','04_kitchen']:
            hide=f==1 or role=='roof' or (role=='wall_upper' and side in ['front','left','partition'])
            if o.get('semanticId') in ['item.bluebird_dining.wall_clock','item.bluebird_dining.door_sign']:hide=True
            if name=='04_kitchen' and o.users_collection and o.users_collection[0].name=='02_DINING':hide=True
        elif name=='03_residence':
            hide=(f==0) or role=='roof' or (role=='wall_upper' and side in ['front','left','partition'])
        elif name=='05_stew_pot':
            hide=(f==1) or role=='roof' or (role=='wall_upper' and side in ['front','left','partition'])
        o.hide_render=hide
    for l in LAMPS:l.hide_render=(name=='03_residence' and l.name.startswith('dining')) or (name in ['02_ground_cutaway','04_kitchen','05_stew_pot'] and l.name.startswith('bedside'))
    dusk=name=='06_exterior_dusk'
    key.data.energy=170 if dusk else 1500;fill.data.energy=220 if dusk else 1000
    scene.world.node_tree.nodes['Background'].inputs['Strength'].default_value=.14 if dusk else .45
    if name in ['02_ground_cutaway','03_residence','04_kitchen']:
        # Technical cutaway illustration opens the roof to neutral sky. Runtime shadow retention is separate.
        key.data.energy=1000

# Give semantic objects useful contact/support pivots without changing any world geometry.
bpy.context.view_layer.update()
for g in GROUPS.values():
    if not g.get('itemId'):continue
    children=[o for o in g.children if o.type in ('MESH','CURVE','FONT')]
    points=[o.matrix_world @ Vector(v) for o in children for v in o.bound_box]
    if not points:continue
    lower=Vector(tuple(min(v[k] for v in points) for k in range(3)))
    upper=Vector(tuple(max(v[k] for v in points) for k in range(3)))
    pivot=Vector(((lower.x+upper.x)/2,(lower.y+upper.y)/2,upper.z if g.get('role')=='fixtures' else lower.z))
    matrices={o:o.matrix_world.copy() for o in children}
    g.location=pivot
    bpy.context.view_layer.update()
    for o,matrix in matrices.items():o.matrix_world=matrix
    g['pivotNativeMeters']=list(pivot)
    g['pivotConvention']='upper mounting center' if g.get('role')=='fixtures' else 'lower support center'
bpy.context.view_layer.update()
# Validate semantic coverage before export.
canonical={}
repo=R.parents[2]
for room in ['dining','kitchen','upstairs']:
    data=json.loads((repo/'testmods/grayhaven/Grayhaven_Scenarios'/f'SCN_bluebird_{room}.json').read_text())
    for i in data['references']['items']:canonical[i['id']]=i['name']
actual={g.get('itemId') for g in GROUPS.values() if g.get('itemId')}
assert actual==set(canonical),(sorted(set(canonical)-actual),sorted(actual-set(canonical)))
bpy.data.texts.load(str(R/'source'/'view_bluebird.py'))
# Both views and source are fully editable; images packed for portable .blend handoff.
for img in bpy.data.images:
    if img.source=='FILE':img.pack()
scene['assetReadme']='See README.md alongside this blend. Render cameras 01–06. Original texture layers in textures/source. No character rig. Not yet integrated into Three.js.'
scene['cutawayNote']='Preview cutaways receive neutral sky through removed ceilings. Runtime requires physical shadow proxy, not these preview light values.'
# Dedicated physical shell copy preserves apertures. Do not render simultaneously with visible shell.
for o in list(bpy.data.objects):
    if o.type=='MESH' and o.get('role') in ('roof','wall_low','wall_upper') and o.users_collection[0].name in ('01_STRUCTURE','05_ROOF'):
        c=o.copy();c.data=o.data;COL['08_SHADOW_PROXY'].objects.link(c);c.name='shadow_proxy_'+o.name;c.parent=root
        c['role']='shadow_proxy';c.hide_render=True;c.hide_set(True)
COL['08_SHADOW_PROXY'].hide_render=True;COL['08_SHADOW_PROXY'].hide_viewport=True
# Default useful material preview camera view when file is opened.
set_view('01_exterior')
for area_ui in bpy.context.screen.areas:
    if area_ui.type=='VIEW_3D':
        area_ui.spaces.active.region_3d.view_perspective='CAMERA'
        area_ui.spaces.active.shading.type='MATERIAL'
bpy.ops.wm.save_as_mainfile(filepath=str(R/'bluebird_diner.blend'))
print('SAVED_SOURCE',flush=True)
# Export a separate working scene, merging per semantic object/material/visibility class.
# Keep .blend rich in parts, keep GLB draw units under control.
source_scene=scene
export_scene=bpy.data.scenes.new('GLB_EXPORT');bpy.context.window.scene=export_scene
expcol=export_scene.collection
export_root=root.copy();export_root.parent=None;expcol.objects.link(export_root)
export_groups={}
for g in GROUPS.values():
    if g.users_collection[0].name not in ['06_SITE','07_RENDER_RIG','08_SHADOW_PROXY']:
        c=g.copy();c.parent=export_root;expcol.objects.link(c);export_groups[g]=c
buckets=defaultdict(list)
for o in list(source_scene.objects):
    if o.type not in ('MESH','CURVE','FONT') or o.parent not in export_groups:continue
    c=o.copy();c.data=o.data.copy();c.parent=export_groups[o.parent];expcol.objects.link(c)
    c.hide_render=False;c.hide_set(False)
    bpy.context.view_layer.objects.active=c;c.select_set(True)
    bpy.ops.object.convert(target='MESH');c=bpy.context.object
    for m in list(c.modifiers):
        bpy.context.view_layer.objects.active=c;bpy.ops.object.modifier_apply(modifier=m.name)
    c.select_set(False)
    buckets[(c.parent.name,tuple(m.name for m in c.data.materials))].append(c)
for objects in buckets.values():
    bpy.ops.object.select_all(action='DESELECT')
    for o in objects:o.select_set(True)
    bpy.context.view_layer.objects.active=objects[0];bpy.ops.object.join()
# Object transforms are applied on meshes; item parent/pivot metadata remains intact.
bpy.ops.object.select_all(action='SELECT')
bpy.ops.export_scene.gltf(filepath=str(R/'bluebird_diner.glb'),export_format='GLB',use_active_scene=True,
    export_apply=True,export_extras=True,export_yup=True,export_cameras=False,export_lights=False,export_animations=False)
meshes=[o for o in export_scene.objects if o.type=='MESH']
triangles=0
for o in meshes:o.data.calc_loop_triangles();triangles+=len(o.data.loop_triangles)
manifest={'assetId':'bluebird_diner','version':'1.0','source':'bluebird_diner.blend','runtimeCandidate':'bluebird_diner.glb',
    'status':'authored LOD0 sample; not integrated into runtime','nativeAxes':{'up':'+Z','front':'-Y'},'glbAxes':{'up':'+Y','front':'+Z'},
    'authorUnits':'metres','footprintMeters':[7,11],'floorElevationsMeters':[0,F],'authorMetersToSceneUnits':2,
    'sceneGroundY':.4,'hostFootprintSceneUnits':[14,22],
    'hostMapping':'Three local = (GLB.x*2, GLB.y*2+0.4, GLB.z*2); apply existing host world transform afterwards.',
    'meshCount':len(meshes),'triangles':triangles,'materialCount':len({m.name for o in meshes for m in o.data.materials}),'glbBytes':(R/'bluebird_diner.glb').stat().st_size,
    'items':[{'id':i,'name':canonical[i]} for i in sorted(actual)],
    'roles':['shell','roof','wall_upper','wall_low','floor','stairs','contents','fixtures','shadow_proxy'],
    'lods':['LOD0 only; LOD1/LOD2 not authored in this pass'],
    'pending':['Canonical archive photo images','Unspecified menu prices and dish copy','Runtime integration, shadows, picking and performance validation'],
    'artInterpretations':['Furniture dimensions use human working heights, not a uniform scaling of schematic props','Cabinet hardware and wear are decorative and carry no new clues','Small devotional object is a household prop, not a character model'],
    'previewLighting':'Cutaways are neutral studio inspection renders. They do not validate runtime shadow retention.',
    'textureSource':'Original deterministic layered pigment textures in source/make_textures.py; no external stock assets.',
    'exportNote':'GLB keeps texture-based PBR, item IDs and visibility groups. Shadow proxy remains in .blend; importer must derive or import separately.'}
(R/'manifest.json').write_text(json.dumps(manifest,ensure_ascii=False,indent=2)+'\n')
print('EXPORTED',json.dumps({'triangles':triangles,'meshes':len(meshes),'bytes':manifest['glbBytes']}),flush=True)
bpy.context.window.scene=source_scene
bpy.data.scenes.remove(export_scene)
# Render first review images. Remaining cameras are available for secondary QA.
views=['01_exterior','02_ground_cutaway','03_residence','04_kitchen','05_stew_pot','06_exterior_dusk']
if '--' in sys.argv:
    args=sys.argv[sys.argv.index('--')+1:]
    if args:views=args
for name in views:
    set_view(name)
    if name=='05_stew_pot':scene.render.resolution_x=1100;scene.render.resolution_y=950
    else:scene.render.resolution_x=1500;scene.render.resolution_y=1300
    scene.render.filepath=str(R/'previews'/f'{name}.png')
    print('RENDER_START',name,flush=True);bpy.ops.render.render(write_still=True)
set_view('01_exterior');scene.render.resolution_x=1500;scene.render.resolution_y=1300
bpy.ops.wm.save_as_mainfile(filepath=str(R/'bluebird_diner.blend'))
print('BLUEBIRD_COMPLETE',flush=True)
