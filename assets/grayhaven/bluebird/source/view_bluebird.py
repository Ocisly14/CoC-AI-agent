"""Run inside the delivered .blend: adds a local N-panel, no add-on install."""
import bpy
from bpy.props import EnumProperty
VIEWS=[('01_exterior','Exterior','Complete building'),('02_ground_cutaway','Dining cutaway','Ground floor'),('03_residence','Residence','Upper floor'),('04_kitchen','Kitchen','Ground-floor kitchen'),('05_stew_pot','Stew pot','Close detail'),('06_exterior_dusk','Dusk','Exterior at dusk')]
class BLUEBIRD_OT_view(bpy.types.Operator):
    bl_idname='bluebird.set_view'
    bl_label='Bluebird view'
    view:EnumProperty(items=VIEWS)
    def execute(self,context):
        name=self.view
        cam=bpy.data.objects.get(name)
        if not cam:
            self.report({'ERROR'},'Open bluebird_diner.blend first');return {'CANCELLED'}
        context.scene.camera=cam
        for o in context.scene.objects:
            if o.type in ('LIGHT','CAMERA','EMPTY'):continue
            f=o.get('floor',-1);role=o.get('role','');side=o.get('side','')
            hide=role=='shadow_proxy'
            if name in ['02_ground_cutaway','04_kitchen','05_stew_pot']:
                hide|=f==1 or role=='roof' or (role=='wall_upper' and side in ['front','left','partition'])
                if o.get('semanticId') in ['item.bluebird_dining.wall_clock','item.bluebird_dining.door_sign']:hide=True
                if name=='04_kitchen' and o.users_collection and o.users_collection[0].name=='02_DINING':hide=True
            elif name=='03_residence':hide|=f==0 or role=='roof' or (role=='wall_upper' and side in ['front','left','partition'])
            o.hide_render=hide;o.hide_set(hide)
        for o in bpy.data.objects:
            if o.type=='LIGHT' and o.name.startswith(('dining_lamp','bedside_bulb')):
                o.hide_render=(name=='03_residence' and o.name.startswith('dining')) or (name in ['02_ground_cutaway','04_kitchen','05_stew_pot'] and o.name.startswith('bedside'))
        dusk=name=='06_exterior_dusk'
        bpy.data.lights['overcast_warm_key'].energy=170 if dusk else 1000 if name in ['02_ground_cutaway','03_residence','04_kitchen'] else 1500
        bpy.data.lights['cool_sky_fill'].energy=220 if dusk else 1000
        context.scene.world.node_tree.nodes['Background'].inputs['Strength'].default_value=.14 if dusk else .45
        for area in context.screen.areas:
            if area.type=='VIEW_3D':area.spaces.active.region_3d.view_perspective='CAMERA'
        return {'FINISHED'}
class BLUEBIRD_PT_views(bpy.types.Panel):
    bl_label='Bluebird inspection views';bl_idname='BLUEBIRD_PT_views'
    bl_space_type='VIEW_3D';bl_region_type='UI';bl_category='Bluebird'
    def draw(self,context):
        for key,label,desc in VIEWS:self.layout.operator('bluebird.set_view',text=label).view=key
        self.layout.label(text='Cutaways: neutral inspection light')
for cls in [BLUEBIRD_OT_view,BLUEBIRD_PT_views]:
    old=getattr(bpy.types,cls.__name__,None)
    if old:bpy.utils.unregister_class(old)
    bpy.utils.register_class(cls)
print('Bluebird views ready: 3D View > N > Bluebird')
