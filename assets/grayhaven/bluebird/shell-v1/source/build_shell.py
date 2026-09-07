"""Bluebird architectural shell: design-v3 geometry + oil-v1 textures, no props."""
import bpy, json, math, sys
from pathlib import Path
from mathutils import Vector

ROOT=Path(__file__).resolve().parents[1]
BASE=ROOT.parent
LAYOUT=json.loads((BASE/'design-v3/layout.json').read_text())
TEX=json.loads((BASE/'textures-oil-v1/manifest.json').read_text())
bpy.ops.wm.read_factory_settings(use_empty=True)
scene=bpy.context.scene
scene.unit_settings.system='METRIC'
scene.unit_settings.scale_length=1
groups={}
mats={}

def srgb(h):
    c=[int(h[i:i+2],16)/255 for i in (0,2,4)]
    return tuple(x/12.92 if x<=.04045 else ((x+.055)/1.055)**2.4 for x in c)+(1,)

def flat(name,color,rough=.85):
    m=bpy.data.materials.new(name);m.use_nodes=True
    p=m.node_tree.nodes.get('Principled BSDF')
    p.inputs['Base Color'].default_value=srgb(color)
    p.inputs['Roughness'].default_value=rough
    p.inputs['Specular IOR Level'].default_value=.25
    mats[name]=m
    return m

# Only architectural materials are consumed; countertop and upholstery stay unused.
for e in TEX['entries']:
    if e['id'][:2] not in ['01','02','03','04','05','07','08']:continue
    m=bpy.data.materials.new('BB_OIL_'+e['id']);m.use_nodes=True
    p=m.node_tree.nodes.get('Principled BSDF')
    p.inputs['Roughness'].default_value=e['roughness']
    p.inputs['Specular IOR Level'].default_value=.25
    tex=m.node_tree.nodes.new('ShaderNodeTexImage')
    im=bpy.data.images.load(str(BASE/'textures-oil-v1'/e['path']))
    im.colorspace_settings.name='sRGB';im.pack()
    im.filepath='//../textures-oil-v1/'+e['path']
    tex.image=im;tex.extension='EXTEND';tex.interpolation='Linear'
    m.node_tree.links.new(tex.outputs['Color'],p.inputs['Base Color'])
    mats[e['id'][:2]]=m
flat('foundation','888C81',.94)
flat('kitchen_floor','90958A',.87)
flat('frame_teal','496669',.67)
flat('roof_edge','454C49',.88)
flat('cut_plaster','C4BBA7',.92)
flat('white_clay','CFCBC0',.86)
flat('stage','787D75',1)
glass=flat('glass','69817E',.27)
gp=glass.node_tree.nodes.get('Principled BSDF')
gp.inputs['Alpha'].default_value=.23
glass.surface_render_method='DITHERED'
glass.diffuse_color=srgb('69817E')[:3]+(.23,)

def group(name,floor=0,role='wall',side='',band='full'):
    if name not in groups:
        groups[name]={'verts':[],'faces':[],'uv':[],'mi':[],'materials':[],
                      'meta':{'floor':floor,'role':role,'side':side,'band':band,'architecture':True}}
    return groups[name]

def face(g,pts,mat,uv=None):
    start=len(g['verts']);g['verts'].extend(pts)
    g['faces'].append(tuple(range(start,start+len(pts))))
    if mat not in g['materials']:g['materials'].append(mat)
    g['mi'].append(g['materials'].index(mat))
    g['uv'].append(uv or [(0,0),(1,0),(1,1),(0,1)][:len(pts)])

def box(g,center,size,mat,angle=0):
    x,y,z=center;w,d,h=size
    ca,sa=math.cos(angle),math.sin(angle)
    corners=[]
    for a,b,c in [(-1,-1,-1),(1,-1,-1),(1,1,-1),(-1,1,-1),(-1,-1,1),(1,-1,1),(1,1,1),(-1,1,1)]:
        xx,yy=a*w/2,b*d/2
        corners.append((x+xx*ca-yy*sa,y+xx*sa+yy*ca,z+c*h/2))
    for ids in [(0,3,2,1),(4,5,6,7),(0,1,5,4),(1,2,6,5),(2,3,7,6),(3,0,4,7)]:
        pts=[corners[k] for k in ids]
        # Put trim brush direction along each face's long axis.
        a=(Vector(pts[1])-Vector(pts[0])).length;b=(Vector(pts[3])-Vector(pts[0])).length
        uv=[(0,0),(1,0),(1,1),(0,1)]
        if mat=='03' and a>b:uv=[(0,0),(0,1),(1,1),(1,0)]
        face(g,pts,mat,uv)

def breaks(lo,hi,step,extra=()):
    return sorted(set([round(lo,5),round(hi,5)]+[round(lo+i*step,5) for i in range(1,math.ceil((hi-lo)/step)) if lo+i*step<hi]+[round(x,5) for x in extra if lo<x<hi]))

OPENINGS=[]
def wall(name,a,b,z0,z1,floor,side,openings=(),thick=.18,exterior=True):
    ax,ay=a;bx,by=b;length=math.hypot(bx-ax,by-ay)
    dx,dy=(bx-ax)/length,(by-ay)/length
    nx,ny=dy,-dx
    miters={'L0_FRONT':(.18,.18*math.tan(math.pi/8)),
            'L0_CORNER':(.18*math.tan(math.pi/8),.18*math.tan(math.pi/8)),
            'L0_RIGHT':(.18*math.tan(math.pi/8),.18),
            'L1_FRONT':(.14,.10),'L1_RIGHT':(.14,.14),
            'L1_REAR':(.10,.14),'L1_LEFT':(.14,.14)}
    start_miter,end_miter=miters.get(name,(thick,thick)) if exterior else (0,0)
    def point(s,z,out=0):
        if out<0 and s<1e-5:s+=start_miter*(-out/thick)
        elif out<0 and length-s<1e-5:s-=end_miter*(-out/thick)
        return (ax+dx*s+nx*out,ay+dy*s+ny*out,z)
    xx=breaks(0,length,.2,[v for o in openings for v in o[:2]]+[i*2.4 for i in range(1,8)])
    zz=breaks(z0,z1,.2,[1.0,1.2]+[v for o in openings for v in o[2:4]])
    def occupied(s,z):
        return 0<s<length and z0<z<z1 and not any(o[0]<s<o[1] and o[2]<z<o[3] for o in openings)
    for l,r in zip(xx,xx[1:]):
        for bottom,top in zip(zz,zz[1:]):
            s,z=(l+r)/2,(bottom+top)/2
            if any(o[0]<s<o[1] and o[2]<z<o[3] for o in openings):continue
            band='low' if floor==0 and top<=1.00001 else 'high'
            g=group(name+'_'+band,floor,'wall',side,band)
            paint='02' if exterior and floor==0 and z<1.2 else '01' if exterior else '08'
            if paint=='02':
                # Seven source boards; lower stain stays at ground level.
                col=int(s/.2)%7
                u0=col/7+(l% .2)/.2/7 if abs(l/.2-round(l/.2))>1e-4 else col/7
                u1=u0+(r-l)/.2/7
                uv=[(u0,bottom/1.2),(u1,bottom/1.2),(u1,top/1.2),(u0,top/1.2)]
                relief=.014
            elif paint=='01':
                base=1.2 if floor==0 else z0
                row=int((z-base)/.2)
                texrow=min(row,7) if floor==0 else 2+row%6
                t0=((bottom-base)-row*.2)/.2/8+texrow/8
                t1=t0+(top-bottom)/.2/8
                bay=math.floor((s+1e-6)/2.4)
                u0=(l-bay*2.4)/2.4;u1=(r-bay*2.4)/2.4
                uv=[(u0,t0),(u1,t0),(u1,t1),(u0,t1)]
                relief=.012
            else:
                ubase=math.floor(s/2)*2;vbase=z0+math.floor((z-z0)/2)*2
                uv=[((l-ubase)/2,(bottom-vbase)/2),((r-ubase)/2,(bottom-vbase)/2),((r-ubase)/2,(top-vbase)/2),((l-ubase)/2,(top-vbase)/2)]
                relief=0
            uv=[(max(.001,min(.999,u)),max(.001,min(.999,v))) for u,v in uv]
            # Front faces have a shallow lap; solid inward wall retains true opening reveals.
            face(g,[point(l,bottom,relief),point(r,bottom,relief),point(r,top,relief*.35),point(l,top,relief*.35)],paint,uv)
            ubase=math.floor(s/2)*2;vbase=z0+math.floor((z-z0)/2)*2
            inneruv=[((r-ubase)/2,(bottom-vbase)/2),((l-ubase)/2,(bottom-vbase)/2),((l-ubase)/2,(top-vbase)/2),((r-ubase)/2,(top-vbase)/2)]
            face(g,[point(r,bottom,-thick),point(l,bottom,-thick),point(l,top,-thick),point(r,top,-thick)],'08',inneruv)
            # Cap only boundaries/openings and the intentional 1m cut split.
            # Internal coplanar caps caused black seams and are omitted.
            if not occupied(s,bottom-1e-4) or abs(bottom-1)<1e-5:
                face(g,[point(l,bottom,-thick),point(r,bottom,-thick),point(r,bottom,relief),point(l,bottom,relief)],'cut_plaster')
            if not occupied(s,top+1e-4) or abs(top-1)<1e-5:
                face(g,[point(l,top,relief*.35),point(r,top,relief*.35),point(r,top,-thick),point(l,top,-thick)],'cut_plaster')
            if not occupied(l-1e-4,z):face(g,[point(l,bottom,relief),point(l,top,relief*.35),point(l,top,-thick),point(l,bottom,-thick)],'cut_plaster')
            if not occupied(r+1e-4,z):face(g,[point(r,bottom,-thick),point(r,top,-thick),point(r,top,relief*.35),point(r,bottom,relief)],'cut_plaster')
            if exterior and occupied(s,top+1e-4):
                nextrelief=.014 if floor==0 and top<1.2 else .012
                face(g,[point(l,top,relief*.35),point(r,top,relief*.35),point(r,top,nextrelief),point(l,top,nextrelief)],paint,uv)
    for k,o in enumerate(openings):
        l,r,bot,top,kind=o
        OPENINGS.append({'wall':name,'s':[l,r],'z':[bot,top],'kind':kind})
        frame=group(name+'_frames',floor,'frame',side,'high')
        angle=math.atan2(dy,dx)
        def bar(s,z,w,h,mat='03',depth=.105):box(frame,point(s,z,.045),(w,depth,h),mat,angle)
        bar(l-.045,(bot+top)/2,.09,top-bot)
        bar(r+.045,(bot+top)/2,.09,top-bot)
        bar((l+r)/2,top+.05,r-l+.18,.10)
        if bot>.1:bar((l+r)/2,bot-.045,r-l+.24,.10,depth=.22)
        # Entry and room doors remain empty openings; windows have slim joinery and panes.
        if kind=='window':
            gl=group(name+'_glass',floor,'glass',side,'high')
            panes=max(1,round((r-l)/1.35)) if floor==0 else 1
            for j in range(panes):
                p0=l+(r-l)*j/panes;p1=l+(r-l)*(j+1)/panes
                if j:bar(p0,(bot+top)/2,.055,top-bot,'frame_teal',.065)
                face(gl,[point(p0,bot,-.065),point(p1,bot,-.065),point(p1,top,-.065),point(p0,top,-.065)],'glass')
            trans=top-.38 if floor==0 and top-bot>1.2 else (bot+top)/2
            bar((l+r)/2,trans,r-l,.045,'frame_teal',.065)

# All wall paths are counterclockwise; geometry projects inward from the drawing perimeter.
wall('L0_FRONT',(0,0),(10.7,0),0,3.2,0,'front',[(.9,6.1,1.15,2.75,'window'),(6.6,9.7,1.15,2.75,'window')])
wall('L0_CORNER',(10.7,0),(12,1.3),0,3.2,0,'corner',[(.25,1.588,0,2.45,'entry')])
wall('L0_RIGHT',(12,1.3),(12,10),0,3.2,0,'right',[(.4,3.2,1.15,2.75,'window'),(3.9,5.6,1.3,2.6,'window')])
wall('L0_REAR',(12,10),(0,10),0,3.2,0,'rear',[(1.8,3.9,1.6,2.6,'window'),(5.8,8.5,1.6,2.6,'window'),(9.5,11,1.6,2.6,'window')])
wall('L0_LEFT',(0,10),(0,0),0,3.2,0,'left')
wall('L0_KITCHEN_PARTITION',(0,6),(12,6),0,3.0,0,'partition',[(7,8.4,0,2.35,'door'),(6,6.8,1.2,2.15,'hatch')],.12,False)
wall('L1_FRONT',(0,4),(6,4),3.2,5.82,1,'front',[(.65,2.05,4.02,5.42,'window'),(3.7,5.1,4.02,5.42,'window')],.14)
wall('L1_RIGHT',(6,4),(6,10),3.2,5.82,1,'right',[(3.75,4.75,4.3,5.4,'window')],.10)
wall('L1_REAR',(6,10),(0,10),3.2,5.82,1,'rear',[(1.05,2.35,4.12,5.42,'window')],.14)
wall('L1_LEFT',(0,10),(0,4),3.2,5.82,1,'left',[(1.05,2.35,4.12,5.42,'window')],.14)
wall('L1_BEDROOM_FRONT',(0,6.5),(3.15,6.5),3.2,5.78,1,'partition',[],.10,False)
wall('L1_BEDROOM_RIGHT',(3.15,6.5),(3.15,10),3.2,5.78,1,'partition',[(.05,.90,3.2,5.3,'door')],.10,False)

def clip(poly):
    out=[]
    for p,q in zip(poly,poly[1:]+poly[:1]):
        vp=p[1]-p[0]+10.7;vq=q[1]-q[0]+10.7
        if vp>=-1e-7:out.append(p)
        if (vp>=0)!=(vq>=0):
            t=vp/(vp-vq);out.append((p[0]+t*(q[0]-p[0]),p[1]+t*(q[1]-p[1])))
    return out

def slab(name,bounds,z,thick,floor,role,mat,holes=(),corner=False):
    x0,y0,x1,y1=bounds;g=group(name,floor,role)
    xs=breaks(x0,x1,2.4,[h[k] for h in holes for k in (0,2)]+[6,10.7])
    ys=breaks(y0,y1,2.4,[h[k] for h in holes for k in (1,3)]+[6])
    for a,b in zip(xs,xs[1:]):
        for c,d in zip(ys,ys[1:]):
            if any(h[0]<(a+b)/2<h[2] and h[1]<(c+d)/2<h[3] for h in holes):continue
            poly=[(a,c),(b,c),(b,d),(a,d)]
            if corner:poly=clip(poly)
            if len(poly)<3:continue
            topmat=mat
            if name=='L0_FLOOR' and c>=6:topmat='kitchen_floor'
            # Crop within discrete plank/roll zones rather than global Repeat wrapping.
            u0=math.floor(a/2.4)*2.4;v0=math.floor(c/2.4)*2.4
            uv=[(max(.001,min(.999,(x-u0)/2.4)),max(.001,min(.999,(y-v0)/2.4))) for x,y in poly]
            face(g,[(x,y,z) for x,y in poly],topmat,uv)
            face(g,[(x,y,z-thick) for x,y in reversed(poly)],'08',list(reversed(uv)))
            for p,q in zip(poly,poly[1:]+poly[:1]):face(g,[(p[0],p[1],z-thick),(q[0],q[1],z-thick),(q[0],q[1],z),(p[0],p[1],z)],'foundation' if floor==0 and role=='floor' else '03')

slab('L0_FLOOR',(0,0,12,10),0,.20,0,'floor','07',corner=True)
slab('L1_FLOOR',(0,4,6,10),3.2,.20,1,'floor','07',[tuple(LAYOUT['stair']['opening'])])
slab('L0_LOW_ROOF',(0,0,12,10),3.4,.20,0,'roof','05',[(0,4,6,10)],True)
slab('L1_ROOF',(0,4,6,10),6.0,.18,1,'roof','05')

# Architectural roof edges are continuous mitered rings, avoiding overlapping cap boxes.
def ring(name,outline,z,floor,width=.18,height=.14):
    def offset(distance):
        result=[]
        for i,p in enumerate(outline):
            prev=Vector(outline[i-1]);here=Vector(p);nxt=Vector(outline[(i+1)%len(outline)])
            a=(here-prev).normalized();b=(nxt-here).normalized()
            n1=Vector((a.y,-a.x));n2=Vector((b.y,-b.x))
            bisector=(n1+n2).normalized()
            result.append(tuple(here+bisector*(distance/bisector.dot(n1))))
        return result
    outer=offset(width/2);inner=offset(-width/2);g=group(name,floor,'roof_edge')
    for i in range(len(outline)):
        j=(i+1)%len(outline);a,b,c,d=outer[i],outer[j],inner[j],inner[i]
        face(g,[(x,y,z+height/2) for x,y in [a,b,c,d]],'03')
        face(g,[(x,y,z-height/2) for x,y in [d,c,b,a]],'03')
        face(g,[(a[0],a[1],z-height/2),(b[0],b[1],z-height/2),(b[0],b[1],z+height/2),(a[0],a[1],z+height/2)],'03')
        face(g,[(c[0],c[1],z-height/2),(d[0],d[1],z-height/2),(d[0],d[1],z+height/2),(c[0],c[1],z+height/2)],'03')
outline=LAYOUT['ground']['outline']
ring('L0_FASCIA',outline,3.31,0)
upper=[(0,4),(6,4),(6,10),(0,10)]
ring('L1_FASCIA',upper,5.95,1)
for i,(x,y) in enumerate([(0,0),(12,1.3),(12,10),(0,10)]):
    box(group('L0_CORNER_BOARDS',0,'frame','corner','high'),(x,y,1.59),(.13,.13,3.18),'03')
for x,y in upper:box(group('L1_CORNER_BOARDS',1,'frame','corner','high'),(x,y,4.50),(.12,.12,2.60),'03')
awning=group('L0_FIXED_CANOPY',0,'canopy','front','high')
for a,b in [(.8,3.2),(3.2,5.6),(5.6,6.2)]:
    face(awning,[(a,-.08,2.94),(b,-.08,2.94),(b,-.78,2.69),(a,-.78,2.69)],'04',[(0,1),((b-a)/2.4,1),((b-a)/2.4,0),(0,0)])
box(awning,(3.5,-.78,2.67),(5.4,.035,.09),'04')

# Staircase: same exact footprint, rise count and direction as layout.json.
stairs=group('L0_STAIR',0,'stair')
profile=[(9.2,0)]
for i in range(16):
    top=(i+1)*.2;rear=9.2-i*.2;front=rear-.2
    face(stairs,[(5.9,rear,top-.2),(4.8,rear,top-.2),(4.8,rear,top),(5.9,rear,top)],'07',[(.46,.45),(0,.45),(0,.54),(.46,.54)])
    face(stairs,[(4.8,front,top),(5.9,front,top),(5.9,rear,top),(4.8,rear,top)],'07',[(0,.3),(.46,.3),(.46,.39),(0,.39)])
    profile.extend([(rear,top),(front,top)])
profile.append((6,0))
face(stairs,[(4.8,y,z) for y,z in reversed(profile)],'03',[(z/3.2,(9.2-y)/3.2) for y,z in reversed(profile)])
face(stairs,[(5.9,y,z) for y,z in profile],'03',[(z/3.2,(9.2-y)/3.2) for y,z in profile])
# Recess the concealed stair end 6mm into the partition to avoid coplanar surfaces.
face(stairs,[(4.8,6.006,0),(5.9,6.006,0),(5.9,6.006,3.2),(4.8,6.006,3.2)],'08')
face(stairs,[(4.8,9.2,0),(5.9,9.2,0),(5.9,6,0),(4.8,6,0)],'03')
# A continuous structural stringer and guard, not freestanding furnishing.
rail=group('L0_STAIR_GUARD',0,'stair')
def beam_between(g,a,b,width,mat):
    direction=Vector(b)-Vector(a);length=direction.length
    up=direction.normalized();cross=up.cross(Vector((1,0,0))).normalized();right=cross.cross(up).normalized()
    corners=[]
    for p in [Vector(a),Vector(b)]:
        corners.extend([tuple(p+right*width*x/2+cross*width*y/2) for x,y in [(-1,-1),(1,-1),(1,1),(-1,1)]])
    for ids in [(0,3,2,1),(4,5,6,7),(0,1,5,4),(1,2,6,5),(2,3,7,6),(3,0,4,7)]:face(g,[corners[i] for i in ids],mat)
for y,z in [(9.1,.2),(8.3,1),(7.5,1.8),(6.7,2.6),(6.1,3.2)]:box(rail,(4.84,y,z+.43),(.045,.045,.86),'03')
beam_between(rail,(4.84,9.14,1.05),(4.84,6.04,4.10),.055,'03')
guard=group('L1_OPENING_GUARD',1,'guard')
for y in [6.05,7.1,8.2,9.28]:box(guard,(4.76,y,3.66),(.05,.05,.92),'03')
box(guard,(4.76,7.665,4.12),(.065,3.33,.065),'03')
box(guard,(5.33,9.33,4.12),(1.2,.065,.065),'03')
for x in [4.76,5.86]:box(guard,(x,9.33,3.66),(.05,.05,.92),'03')
# Setback load is transferred by a beam/post; it does not add a wall across the dining plan.
support=group('L0_TRANSFER_STRUCTURE',0,'structure')
box(support,(3.09,4.10,3.06),(5.82,.22,.28),'03')
box(support,(5.97,4.1,1.46),(.18,.22,2.92),'03')

objects=[]
for name,g in groups.items():
    if not g['faces']:continue
    mesh=bpy.data.meshes.new(name)
    mesh.from_pydata(g['verts'],[],g['faces']);mesh.update()
    uv=mesh.uv_layers.new(name='UVMap')
    for p,coords,mi in zip(mesh.polygons,g['uv'],g['mi']):
        p.material_index=mi
        for loop,co in zip(p.loop_indices,coords):uv.data[loop].uv=co
    obj=bpy.data.objects.new(name,mesh);scene.collection.objects.link(obj)
    for m in g['materials']:mesh.materials.append(mats[m])
    for k,v in g['meta'].items():obj[k]=v
    obj['assetScope']='architecture_only'
    objects.append(obj)

def camera(name,pos,target,scale):
    data=bpy.data.cameras.new(name);data.type='ORTHO';data.ortho_scale=scale
    obj=bpy.data.objects.new(name,data);scene.collection.objects.link(obj)
    obj.location=pos;obj.rotation_euler=(Vector(target)-Vector(pos)).to_track_quat('-Z','Y').to_euler()
    return obj
cameras={
 'exterior':camera('CAM_EXTERIOR',(21,-17,15),(5.8,4.8,2.0),19),
 'ground':camera('CAM_GROUND',(18,-14,20),(6,5,1.0),18),
 'upper':camera('CAM_UPPER',(13,-7,15),(3,7,3.8),11),
 'plan':camera('CAM_PLAN',(6,5,25),(6,5,0),14),
 'front':camera('CAM_FRONT',(6,-25,3),(6,0,3),14.5),
 'right':camera('CAM_RIGHT',(30,5,3),(12,5,3),13),
 'rear':camera('CAM_REAR',(6,30,3),(6,10,3),14.5),
}
scene.render.engine='CYCLES';scene.cycles.samples=32;scene.cycles.use_denoising=True
scene.render.resolution_x=1500;scene.render.resolution_y=1150;scene.render.resolution_percentage=100
scene.render.image_settings.file_format='PNG'
scene.view_settings.view_transform='Standard';scene.view_settings.look='None'
scene.view_settings.exposure=-.2
world=bpy.data.worlds.new('Neutral coastal daylight');world.use_nodes=True
world.node_tree.nodes['Background'].inputs[0].default_value=(.56,.65,.7,1)
world.node_tree.nodes['Background'].inputs[1].default_value=.6;scene.world=world
sun=bpy.data.lights.new('Soft daylight','SUN');sun.energy=1.8;sun.angle=.18
sun.color=(1,.93,.82);sunob=bpy.data.objects.new('Soft daylight',sun);scene.collection.objects.link(sunob)
sunob.rotation_euler=(.42,-.5,-.4)
# Ground is a display stage, separately tagged and excluded from the building GLB.
bpy.ops.mesh.primitive_plane_add(size=200,location=(6,5,-.205))
stage=bpy.context.object;stage.name='DISPLAY_GROUND';stage.data.materials.append(mats['stage'])

def view(mode):
    for o in objects:
        d=o;hide=False
        if mode in ['ground','plan']:
            hide=d['floor']==1 or d['role'] in ['roof','roof_edge'] or (d['side'] in ['front','right','corner'] and d['band']=='high')
        elif mode=='upper':
            hide=(d['floor']==0 and d['role']!='stair') or d['role'] in ['roof','roof_edge'] or (d['side'] in ['front','right','corner'] and d['role'] in ['wall','frame','glass'])
        o.hide_render=hide;o.hide_set(hide)
    scene.camera=cameras[mode]

view('exterior')
for area in bpy.context.screen.areas:
    if area.type=='VIEW_3D':
        area.spaces.active.region_3d.view_perspective='CAMERA';area.spaces.active.shading.type='MATERIAL'
# Embedded helper provides scene-only cutaway toggles in Blender's Text Editor.
helper=bpy.data.texts.new('README_AND_VIEWS.py')
helper.write('''# Architecture only. Select a view below, then Run Script.\nimport bpy\nMODE = "ground" # exterior / ground / upper\nfor o in bpy.data.objects:\n if not o.get("architecture"): continue\n hide = False\n if MODE == "ground": hide = o["floor"] == 1 or o["role"] in ["roof","roof_edge"] or (o["side"] in ["front","right","corner"] and o["band"] == "high")\n if MODE == "upper": hide = o["floor"] == 0 or o["role"] in ["roof","roof_edge"] or (o["side"] in ["front","right","corner"] and o["role"] in ["wall","frame","glass"])\n o.hide_render=hide; o.hide_set(hide)\nbpy.context.scene.camera=bpy.data.objects.get("CAM_"+MODE.upper())\n''')
fixed_helper=helper.as_string().replace('hide = o["floor"] == 0 or','hide = (o["floor"] == 0 and o["role"] != "stair") or')
fixed_helper=fixed_helper.replace(' o.hide_render=hide;', ' if o["role"] == "glass" and bpy.data.filepath.endswith("_white.blend"): hide=True\n o.hide_render=hide;')
helper.clear();helper.write(fixed_helper)
bpy.ops.wm.save_as_mainfile(filepath=str(ROOT/'bluebird_shell_textured.blend'))
bpy.ops.object.select_all(action='DESELECT')
for o in objects:o.select_set(True)
bpy.ops.export_scene.gltf(filepath=str(ROOT/'bluebird_shell_textured.glb'),export_format='GLB',use_selection=True,export_extras=True,export_cameras=False,export_lights=False)
checks={'scope':'architecture only; no furniture, equipment or item models','layout':LAYOUT,'openings':OPENINGS,
        'meshObjects':len(objects),'triangles':sum(sum(len(p.vertices)-2 for p in o.data.polygons) for o in objects),
        'texturesUsed':[e['id'] for e in TEX['entries'] if e['id'][:2] in ['01','02','03','04','05','07','08']],
        'propModels':0,'stairRisers':16,'stairTop':3.2,'slabOpening':LAYOUT['stair']['opening'],
        'notes':['Upper right wall 0.10 m thick to meet stair edge at x=5.9','No furniture or sign lettering','Full model runtime scale not integrated','Setback beam and one post resolve schematic section support without blocking dining plan']}
(ROOT/'manifest.json').write_text(json.dumps(checks,ensure_ascii=False,indent=2)+'\n')
for mode,out in [('exterior','01-textured-exterior'),('ground','02-ground-cutaway'),('upper','03-upper-cutaway'),('front','05-front'),('right','06-right'),('rear','07-rear')]:
    view(mode);scene.render.filepath=str(ROOT/'previews'/f'{out}.png');bpy.ops.render.render(write_still=True)
view('exterior')
for o in objects:
    if o['role']=='glass':o.hide_render=True;o.hide_set(True)
scene.view_layers[0].material_override=mats['white_clay']
scene.render.filepath=str(ROOT/'previews'/'04-white-shell.png');bpy.ops.render.render(write_still=True)
scene.view_layers[0].material_override=None
for o in objects:
    for i in range(len(o.data.materials)):o.data.materials[i]=mats['white_clay']
bpy.ops.wm.save_as_mainfile(filepath=str(ROOT/'bluebird_shell_white.blend'))
print('SHELL_COMPLETE',checks['meshObjects'],checks['triangles'],flush=True)
