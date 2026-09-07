// Offline browser verification of static SVG design samples, not the game.
import fs from "node:fs";
import path from "node:path";
import {fileURLToPath} from "node:url";
import {createRequire} from "node:module";
const root=path.dirname(fileURLToPath(import.meta.url));
const require=createRequire(import.meta.url);
const {chromium}=require(process.env.ART_NODE_DEPS?path.join(process.env.ART_NODE_DEPS,"playwright"):"playwright");
const launch={headless:true,args:["--disable-background-networking"]};
if(process.env.ART_BROWSER) launch.executablePath=process.env.ART_BROWSER;
const browser=await chromium.launch(launch);
const report=[];
try{
 const samples=["desktop-1440x900","item-1280x720","mobile-390x844","mobile-expanded-390x844","components"];
 for(const name of samples){
  const svg=fs.readFileSync(path.join(root,"ui",name+".svg"),"utf8");
  const [width,height]=svg.match(/width="(\d+)" height="(\d+)"/).slice(1).map(Number);
  const page=await browser.newPage({viewport:{width,height},deviceScaleFactor:1});
  await page.route("**/*",route=>route.abort());
  const errors=[]; page.on("pageerror",e=>errors.push(e.message));
  await page.setContent('<html><head><meta charset="utf-8"></head><body style="margin:0">'+svg+"</body></html>");
  await page.evaluate(()=>document.fonts.ready);
  const result=await page.evaluate(()=>{
   const root=document.querySelector("svg"), box=root.getBoundingClientRect();
   const outside=[],overlaps=[],small=[];
   const texts=[...root.querySelectorAll("text")].map(el=>({el,r:el.getBoundingClientRect(),text:el.textContent}));
   for(const {el,r,text} of texts) if(r.x<-.5||r.y<-.5||r.right>box.right+.5||r.bottom>box.bottom+.5) outside.push(text);
   const overlap=(a,b)=>Math.min(a.right,b.right)-Math.max(a.left,b.left)>1&&Math.min(a.bottom,b.bottom)-Math.max(a.top,b.top)>1;
   for(let i=0;i<texts.length;i++) for(let j=i+1;j<texts.length;j++) if(overlap(texts[i].r,texts[j].r)) overlaps.push([texts[i].text,texts[j].text]);
   for(const el of root.querySelectorAll('[data-hit="true"]')){
    const r=el.getBoundingClientRect();
    if(r.width<43.9||r.height<43.9) small.push({label:el.parentElement.getAttribute("aria-label"),width:r.width,height:r.height});
   }
   return {outside,overlaps,small,textNodes:texts.length,controls:root.querySelectorAll('[data-hit="true"]').length,fonts:document.fonts.status};
  });
  await page.screenshot({path:path.join(root,"qa","browser-"+name+".png")});
  report.push({name,width,height,...result,errors});
  await page.close();
 }
}finally{await browser.close();}
fs.writeFileSync(path.join(root,"qa","browser-report.json"),JSON.stringify(report,null,2)+"\n");
console.log(JSON.stringify(report,null,2));
if(report.some(r=>r.outside.length||r.overlaps.length||r.small.length||r.errors.length))process.exitCode=1;

