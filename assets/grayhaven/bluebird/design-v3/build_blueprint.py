from pathlib import Path
import json
R=Path(__file__).resolve().parent
S=50;parts=[]
parts.append('''<svg xmlns="http://www.w3.org/2000/svg" width="1500" height="1160" viewBox="0 0 1500 1160"><defs><pattern id="hatch" width="7" height="7" patternUnits="userSpaceOnUse"><path d="M0 7L7 0" stroke="#8a7968" stroke-width="1"/></pattern><marker id="arrow" markerWidth="7" markerHeight="7" refX="6" refY="3.5" orient="auto-start-reverse"><path d="M0 0L7 3.5L0 7" fill="#984f43"/></marker></defs><rect width="1500" height="1160" fill="#e7ddc8"/><g font-family="Arial,sans-serif" fill="#24282b">''')
def t(x,y,s,size=15):parts.append(f'<text x="{x}" y="{y}" font-size="{size}">{s}</text>')
def rect(x,y,w,h,fill='none',stroke='#24282b',sw=1,dash=''):
 parts.append(f'<rect x="{x}" y="{y}" width="{w}" height="{h}" fill="{fill}" stroke="{stroke}" stroke-width="{sw}" '+(f'stroke-dasharray="{dash}" ' if dash else '')+'/>')
def line(x1,y1,x2,y2,color='#24282b',sw=1,dash='',arrow=False):
 parts.append(f'<path d="M{x1} {y1}L{x2} {y2}" fill="none" stroke="{color}" stroke-width="{sw}" '+(f'stroke-dasharray="{dash}" ' if dash else '')+('marker-end="url(#arrow)" ' if arrow else '')+'/>')
def plan(ox,oy,upper=False):
 def p(x,y):return ox+x*S,oy+(10-y)*S
 def r(x,y,w,d,fill,stroke='#24282b',sw=1,dash=''):
  px,py=p(x,y+d);rect(px,py,w*S,d*S,fill,stroke,sw,dash)
 def l(x,y,xx,yy,**kw):line(*p(x,y),*p(xx,yy),**kw)
 def txt(x,y,st,sz=14):t(*p(x,y),st,sz)
 # Faint full lower footprint remains visible beneath the smaller upper plan.
 outline=[p(0,0),p(10.7,0),p(12,1.3),p(12,10),p(0,10)]
 points=' '.join(f'{x},{y}' for x,y in outline)
 parts.append(f'<polygon points="{points}" fill="none" stroke="#8a7968" stroke-width="2" '+('stroke-dasharray="8 5" ' if upper else '')+'/>')
 if not upper:
  parts.append(f'<polygon points="{points}" fill="#c3b395"/>');r(.18,6,11.64,3.82,'#a8b3ae',sw=0)
  # Opaque wall strokes; chamfered entry has a single clear doorway.
  for a,b in [((0,0),(10.7,0)),((12,1.3),(12,10)),((12,10),(0,10)),((0,10),(0,0))]:l(*a,*b,sw=9)
  # storefront opening, street-side and rear service windows
  for x,w in [(.9,5.2),(6.6,3.1)]:l(x,0,x+w,0,color='#e7ddc8',sw=10);l(x,0,x+w,0,color='#496669',sw=3)
  for y,d in [(1.7,2.8),(5.2,1.7)]:l(12,y,12,y+d,color='#e7ddc8',sw=10);l(12,y,12,y+d,color='#496669',sw=3)
  for x,w in [(1,1.5),(3.5,2.7),(8.1,2.1)]:l(x,10,x+w,10,color='#e7ddc8',sw=10);l(x,10,x+w,10,color='#496669',sw=3)
  l(0,6,7,6,sw=6);l(8.4,6,12,6,sw=6)
  l(6,6,6.8,6,color='#e7ddc8',sw=7);l(6,6,6.8,6,color='#496669',sw=3)
  # Kitchen double door, symbol open into kitchen.
  l(7,6,7,6.65,sw=2);l(8.4,6,8.4,6.65,sw=2)
  parts.append(f'<path d="M{p(7,6.65)[0]} {p(7,6.65)[1]}Q{p(7.7,6.65)[0]} {p(7.7,6.65)[1]} {p(7.7,6)[0]} {p(7.7,6)[1]}M{p(8.4,6.65)[0]} {p(8.4,6.65)[1]}Q{p(7.7,6.65)[0]} {p(7.7,6.65)[1]} {p(7.7,6)[0]} {p(7.7,6)[1]}" fill="none" stroke="#24282b"/>')
  for x in [1.3,3.3,5.3]:
   r(x-.6,.5,.36,1.25,'#496669');r(x+.55,.5,.36,1.25,'#496669');r(x-.18,.65,.50,.95,'#e7ddc8')
  r(9.2,1.6,.85,3.8,'#b58a50')
  for y in [1.85,2.45,3.05,3.65,4.25,4.85]:
   px,py=p(8.65,y);parts.append(f'<circle cx="{px}" cy="{py}" r="10" fill="#984f43" stroke="#24282b"/>')
  r(.35,7,.8,2.4,'#696373');txt(.38,8.1,'RANGE',9)
  r(2.4,7.2,1.0,1.55,'#e7ddc8');txt(2.48,7.85,'PREP',10)
  r(1.3,9.1,2.3,.65,'#8a9693');txt(1.55,9.30,'3-BAY SINK',10)
  r(9.6,8.3,1.05,1.3,'#e7ddc8');txt(9.65,8.9,'COOLER',9)
  r(10.8,8.2,.8,1.5,'#8a7968');txt(10.83,8.9,'STORE',8)
  txt(6.8,8.1,'KITCHEN');txt(3.6,3.2,'DINING');txt(8.7,.6,'CORNER ENTRY',10)
  l(11.34,.66,10.5,1.65,color='#984f43',sw=2,arrow=True)
 else:
  r(0,4,6,6,'#c3b395',sw=9)
  l(0,6.5,2.95,6.5,sw=5);l(3.15,6.5,3.15,10,sw=5)
  l(3.15,6.5,3.15,7.35,color='#e7ddc8',sw=6);l(3.15,6.5,3.95,6.5,sw=2)
  r(.45,7.65,1.2,1.95,'#e7ddc8');r(.45,7.65,1.2,1.2,'#496669')
  r(2.2,8.8,.6,.95,'#8a7968')
  r(3.6,4.5,.65,1.2,'#8a7968')
  px,py=p(2.0,5.15);parts.append(f'<circle cx="{px}" cy="{py}" r="29" fill="#e7ddc8" stroke="#24282b"/>')
  r(.55,4.40,.55,.65,'#8a7968')
  for x,w in [(.65,1.4),(3.7,1.4)]:l(x,4,x+w,4,color='#e7ddc8',sw=10);l(x,4,x+w,4,color='#496669',sw=3)
  txt(.5,9.1,'BEDROOM');txt(1.4,5.95,'LIVING')
  txt(7.4,6.3,'LOWER ROOF ONLY');txt(7.4,5.8,'NO TERRACE ACCESS',11)
 # Identical stair position on both floors, ascending from rear kitchen toward front landing.
 r(4.8,6,1.1,3.2,'#8a7968' if not upper else '#d6c8ae',sw=2,dash='4 3' if upper else '')
 for i in range(17):l(4.8,6+i*.2,5.9,6+i*.2,sw=.7)
 l(5.35,9.0,5.35,6.25,color='#984f43',sw=2,arrow=True)
 txt(4.9,7.45,'UP',11)
 if upper:r(4.8,5,1.1,1,'#b58a50',sw=1);txt(4.85,5.38,'LANDING',8)
 else:txt(4.5,9.55,'LOWER LANDING',8)
 # Cut line and coordinate system reference.
 l(5.35,-.3,5.35,10.35,color='#984f43',dash='10 5')
 txt(5.4,10.45,'A',12);txt(5.4,-.58,'A',12)
 txt(3,-.9,'FRONT STREET',13)
 txt(12.15,4.8,'RIGHT',11);txt(12.15,4.45,'STREET',11)
 txt(0,10.55,'REAR / y=10',12)
 if not upper:
  l(0,-1.3,12,-1.3);l(0,-1.15,0,-1.45);l(12,-1.15,12,-1.45);txt(5.6,-1.65,'12.00 m',13)
  parts.append(f'<text x="{ox-28}" y="{oy+S*5}" transform="rotate(-90 {ox-28} {oy+S*5})" font-size="12">10.00 m</text>')
 return p

t(65,42,'BLUEBIRD / CORNER DINER — GEOMETRY CONTROL',26)
t(65,73,'Design assumptions in metres. Front street: y=0; right street: x=12. Image-generation studies are not measured drawings.',14)
t(65,111,'01 / GROUND FLOOR — 12 x 10 m',19)
t(815,111,'02 / UPPER FLOOR — 6 x 6 m, rear-left',19)
plan(65,155);plan(815,155,True)
t(65,780,'03 / SECTION A-A — THROUGH THE KITCHEN STAIR',20)
# section: horizontal is rear->front, y=10 at left, y=0 at right
ox,base,ss=100,1090,44
def sp(y,z):return ox+(10-y)*ss,base-z*ss
def sl(y,z,yy,zz,**kw):line(*sp(y,z),*sp(yy,zz),**kw)
# floor and section walls: upper at y=4..10, opening y=6..9.3
sl(10,0,0,0,sw=8);sl(10,0,10,6.0,sw=8);sl(0,0,0,3.4,sw=8)
sl(10,6.0,4,6.0,sw=8);sl(4,3.2,4,6.0,sw=8);sl(4,3.4,0,3.4,sw=6)
sl(10,3.2,9.3,3.2,sw=7);sl(6,3.2,4,3.2,sw=7)
# loadbearing line below setback
sl(4,0,4,3.2,sw=5)
for i in range(16):
 y=9.2-i*.2;h=(i+1)*.2
 sl(y,h,y-.2,h,sw=2);sl(y,h-.2,y,h,sw=1.5)
sl(9.15,.9,6.05,4.0,color='#8a7968',sw=3)
for y,z in [(9.1,.2),(8.3,1),(7.5,1.8),(6.7,2.6),(6.1,3.2)]:sl(y,z,y,z+.85,sw=1)
for z,lab in [(0,'+0.00 GROUND'),(3.2,'+3.20 UPPER'),(6,'+6.00 ROOF')]:sl(10.6,z,-1,z,color='#8a7968',dash='5 5');t(*sp(-1.1,z),lab,12)
t(115,1118,'REAR',12);t(510,1118,'FRONT',12)
t(800,839,'MODELING CONTROL',18)
for i,st in enumerate(['Ground: 12 x 10 m, 1.3 m corner chamfer','Upper: x=0..6 m, y=4..10 m (30% coverage)','Stair: x=4.8..5.9 m, y=6.0..9.2 m','16 risers x 0.20 m; UP toward front','Upper opening: x=4.8..5.9 m, y=6.0..9.3 m','Upper landing: x=4.8..5.9 m, y=5.0..6.0 m','Kitchen door: y=6 m, x=7.0..8.4 m','No exterior back door. No public upper terrace.','Game host dimensions require separate recalibration.']):t(800,875+i*27,st,14)
parts.append('</g></svg>');(R/'03-geometry-control.svg').write_text(''.join(parts))
layout={'units':'metres','status':'concept-derived authoring assumptions, not surveyed data','ground':{'outline':[[0,0],[10.7,0],[12,1.3],[12,10],[0,10]],'level':0,'roof':3.4},'upper':{'bounds':[0,4,6,10],'level':3.2,'roof':6.0},'stair':{'bounds':[4.8,6,5.9,9.2],'rise':.2,'count':16,'upDirection':'-y','opening':[4.8,6,5.9,9.3],'landing':[4.8,5,5.9,6]},'kitchen':{'bounds':[0,6,12,10],'door':[7,6,8.4,6]},'frontStreet':'y=0','rightStreet':'x=12','cornerEntry':'segment (10.7,0) to (12,1.3)','canonicalRooms':['SCN_bluebird_dining','SCN_bluebird_kitchen','SCN_bluebird_upstairs'],'runtimeScale':'not yet calibrated'}
(R/'layout.json').write_text(json.dumps(layout,indent=2)+'\n')
