/* Furniture prompt parser and parametric casework generator. No API keys belong in this file. */
(function () {
  'use strict';
  const DEFAULTS = {
    table:{w:140,d:80,h:75}, chair:{w:45,d:48,h:90}, shelf:{w:90,d:30,h:180},
    bed:{w:160,d:200,h:100}, wardrobe:{w:122,d:56,h:200}, cabinet:{w:100,d:45,h:90},
    dresser:{w:100,d:45,h:95}, sideboard:{w:150,d:45,h:85}, tv_unit:{w:150,d:40,h:55},
    shoe_cabinet:{w:90,d:35,h:100}, desk:{w:140,d:65,h:75}, sofa:{w:200,d:85,h:85}, bench:{w:120,d:40,h:45}
  };
  const MATERIAL_COLORS = {oak:'#c8a06a',walnut:'#5b3a29',pine:'#e0c28a',teak:'#a0693a',steel:'#2b2b2b'};
  const clamp = (n,a,b) => Math.max(a,Math.min(b,n));
  function canonicalType(value) {
    const s=String(value||'').toLowerCase().replace(/[ -]+/g,'_');
    if (/wardrobe|almari|almira|almirah|closet/.test(s)) return 'wardrobe';
    if (/shoe/.test(s)) return 'shoe_cabinet';
    if (/sideboard|credenza/.test(s)) return 'sideboard';
    if (/tv_unit|television|media_unit/.test(s)) return 'tv_unit';
    if (/dresser|chest_of_drawers/.test(s)) return 'dresser';
    if (/bookcase|bookshelf|shelving|shelf|rack/.test(s)) return 'shelf';
    if (/cabinet|cupboard|cabenat|cabenet/.test(s)) return 'cabinet';
    if (/table|desk/.test(s)) return /desk|study/.test(s)?'desk':'table';
    if (/chair|stool|kursi|seat/.test(s)) return 'chair';
    if (/bed|crib|palang/.test(s)) return 'bed';
    if (/sofa|couch|settee/.test(s)) return 'sofa';
    if (/bench/.test(s)) return 'bench';
    return DEFAULTS[s]?s:null;
  }
  function toCm(value,unit,assumeFeet) {
    const n=Number(value); if (!Number.isFinite(n)) return null;
    const u=String(unit||'').toLowerCase();
    if (/^(ft|feet|foot|')$/.test(u)) return n*30.48;
    if (/^(in|inch|inches|")$/.test(u)) return n*2.54;
    if (/^(mm|millimeter|millimeters)$/.test(u)) return n/10;
    if (/^(m|meter|meters)$/.test(u)) return n*100;
    if (/^(cm|centimeter|centimeters)$/.test(u)) return n;
    return assumeFeet?n*30.48:n;
  }
  function parse(text, previous) {
    let s=String(text||'').toLowerCase().replace(/[’]/g,"'");
    const nums={one:'1',a:'1',an:'1',two:'2',three:'3',four:'4',five:'5',six:'6',seven:'7',eight:'8',nine:'9',ten:'10'};
    s=s.replace(/\b(one|a|an|two|three|four|five|six|seven|eight|nine|ten)\b/g,m=>nums[m]||m);
    const p={type:null,material:null,style:null,w:null,d:null,h:null,doors:null,drawers:null,shelves:null,corner:null,cornerWidth:null,found:[]};
    const hit=(re,key,value)=>{if(re.test(s)){p[key]=value||true;p.found.push(key);return true;}return false;};
    if (/\b(wardrobe|almari|almira|almirah|closet)\b/.test(s)) p.type='wardrobe';
    else if (/\b(shoe[ ]*(?:rack|cabinet)|shoe cupboard)\b/.test(s)) p.type='shoe_cabinet';
    else if (/\b(sideboard|credenza)\b/.test(s)) p.type='sideboard';
    else if (/\b(tv[ ]*(?:unit|stand|cabinet)|media unit|television unit)\b/.test(s)) p.type='tv_unit';
    else if (/\b(dresser|chest of drawers)\b/.test(s)) p.type='dresser';
    else if (/\b(bookcase|bookshelf|bookshelves|shelves|shelf|rack)\b/.test(s)) p.type='shelf';
    else if (/\b(cabinet|cupboard|cabenat|cabenet)\b/.test(s)) p.type='cabinet';
    else if (/\b(sofa|couch|settee)\b/.test(s)) p.type='sofa';
    else if (/\b(bench)\b/.test(s)) p.type='bench';
    else if (/\b(desk|study table|workstation)\b/.test(s)) p.type='desk';
    else if (/\b(table|dining|coffee table|mez)\b/.test(s)) p.type='table';
    else if (/\b(chair|stool|seat|kursi)\b/.test(s)) p.type='chair';
    else if (/\b(bed|palang|crib)\b/.test(s)) p.type='bed';
    if (p.type) p.found.push('type');
    if (/\b(walnut|akhrot|sheesham|shisham|sheesham|dark wood)\b/.test(s)) p.material='walnut';
    else if (/\b(pine|light wood|chilgoza)\b/.test(s)) p.material='pine';
    else if (/\b(teak|sagwan|saagwan)\b/.test(s)) p.material='teak';
    else if (/\b(oak|oakwood)\b/.test(s)) p.material='oak';
    if (/\b(steel|metal|iron)\b/.test(s)) p.material='steel';
    if (p.material) p.found.push('material');
    if (/industrial|metal frame|loft/.test(s)) p.style='industrial';
    else if (/classic|royal|traditional|antique|carved/.test(s)) p.style='classic';
    else if (/minimal|simple|japandi/.test(s)) p.style='minimal';
    else if (/modern|scandi|contemporary/.test(s)) p.style='modern';
    if(p.style)p.found.push('style');

    const dim=s.match(/(?:^|\s)(\d{1,3}(?:\.\d+)?)\s*(cm|centimeters?|mm|millimeters?|ft|feet|foot|in|inches?)?\s*(?:\*|×|x|by)\s*(\d{1,3}(?:\.\d+)?)\s*(cm|centimeters?|mm|millimeters?|ft|feet|foot|in|inches?)?(?:\s*(?:\*|×|x|by)\s*(\d{1,3}(?:\.\d+)?)\s*(cm|centimeters?|mm|millimeters?|ft|feet|foot|in|inches?)?)?/);
    if(dim){
      const values=[Number(dim[1]),Number(dim[3])]; if(dim[5])values.push(Number(dim[5]));
      const units=[dim[2]||'',dim[4]||'',dim[6]||''];
      const explicit=units.some(Boolean); const feet=!explicit&&values.every(v=>v<=15);
      if(!explicit&&feet)p.notes='Assumed dimensions are feet (width × height).'; const unit=units.find(Boolean)||'';
      const converted=values.map((v,i)=>toCm(v,units[i]||unit,feet));
      p.w=converted[0]; if(converted.length===2)p.h=converted[1]; else {p.d=converted[1];p.h=converted[2];}
      p.found.push('dimensions');
    } else {
      const one=s.match(/(\d{2,3})\s*(cm|centimeters?|mm|millimeters?|ft|feet|foot|in|inches?)\b/);
      if(one){const v=toCm(one[1],one[2],false);if(/tall|high|height/.test(s))p.h=v;else if(/deep|depth/.test(s))p.d=v;else p.w=v;p.found.push('dimension');}
    }
    const dc=s.match(/(\d{1,2})\s*(?:doors?|door panels?|darwaz(?:e|ay|a))/); if(dc)p.doors=Number(dc[1]);
    const dr=s.match(/(\d{1,2})\s*(?:drawers?|pull.?out drawers?)/); if(dr)p.drawers=Number(dr[1]);
    const sh=s.match(/(\d{1,2})\s*(?:shelves|shelf|shelfs)/); if(sh)p.shelves=Number(sh[1]);
    if(p.doors!=null)p.found.push('doors'); if(p.drawers!=null)p.found.push('drawers'); if(p.shelves!=null)p.found.push('shelves');
    if(/corner|l[ -]?shaped|in the corner|corner unit/.test(s)){p.corner=true;p.found.push('corner unit');}
    const cw=s.match(/(\d{1,3})\s*(?:cm|centimeters?)\s*(?:corner|return)/); if(cw)p.cornerWidth=Number(cw[1]);
    if(!p.type&&previous&&/\b(make|add|remove|change|switch|wider|taller|deeper|more|less|another)\b/.test(s))p.type=previous.type;
    return p;
  }
  function normalize(spec, previous) {
    spec=spec||{}; previous=previous||null;
    const type=canonicalType(spec.type)||((previous&&previous.type)||'table');
    const base=DEFAULTS[type]||DEFAULTS.table;
    const same=!!previous&&(!spec.type||type===previous.type);
    const d=Object.assign({},base,same?previous:{});
    d.type=type;
    const aliases={w:['w','width','widthCm','width_cm'],d:['d','depth','depthCm','depth_cm'],h:['h','height','heightCm','height_cm'],doors:['doors','doorCount','door_count'],drawers:['drawers','drawerCount','drawer_count'],shelves:['shelves','shelfCount','shelf_count'],cornerWidth:['cornerWidth','corner_width']};
    Object.keys(aliases).forEach(k=>{for(const a of aliases[k])if(spec[a]!==undefined&&spec[a]!==null&&spec[a]!==''){d[k]=spec[a];break;}});
    ['material','style'].forEach(k=>{if(spec[k])d[k]=String(spec[k]).toLowerCase();});
    if(spec.corner!==undefined&&spec.corner!==null)d.corner=!!spec.corner;
    else if(spec.cornerCabinet!==undefined)d.corner=!!spec.cornerCabinet;
    if(spec.notes)d.notes=String(spec.notes).slice(0,280);
    if(!['oak','walnut','pine','teak','steel'].includes(d.material))d.material=d.style==='industrial'?'steel':'walnut';
    if(!['modern','classic','industrial','minimal'].includes(d.style))d.style='modern';
    const num=(x,fallback,min,max)=>{const n=Number(x);return Number.isFinite(n)?clamp(n,min,max):fallback;};
    d.w=Math.round(num(d.w,base.w,30,400)); d.d=Math.round(num(d.d,base.d,20,250)); d.h=Math.round(num(d.h,base.h,30,300));
    d.doors=Math.round(num(d.doors,/^(wardrobe|cabinet|sideboard|tv_unit|shoe_cabinet)$/.test(type)?2:0,0,12));
    d.drawers=Math.round(num(d.drawers,0,0,12)); d.shelves=Math.round(num(d.shelves,type==='shelf'?4:0,0,12));
    d.corner=!!d.corner; d.cornerWidth=Math.round(num(d.cornerWidth,Math.min(55,d.d),25,150));
    d.found=Array.isArray(spec.found)?spec.found:[];
    return d;
  }
  function isStorage(d){return !!d&&['wardrobe','cabinet','dresser','sideboard','tv_unit','shoe_cabinet','shelf'].includes(d.type);}
  function drawStorage(d,CW,CH){
    const S=[], ink='#2a211a', fill=(MATERIAL_COLORS[d.material]||MATERIAL_COLORS.walnut)+'55';
    const rect=(a,b,c,e,filled)=>S.push({kind:'rectangle',closed:true,color:ink,size:3,brush:'brush',fill:filled?fill:undefined,pts:[{x:a,y:b},{x:c,y:b},{x:c,y:e},{x:a,y:e},{x:a,y:b}]});
    const line=(a,b,c,e)=>S.push({kind:'line',closed:false,color:ink,size:2,brush:'brush',pts:[{x:a,y:b},{x:c,y:e}]});
    const aspect=d.w/Math.max(d.h,1); let bw=CW*.58,bh=bw/aspect; if(bh>CH*.78){bh=CH*.78;bw=bh*aspect;}
    const x0=(CW-bw)/2,x1=x0+bw,y1=CH*.90,y0=y1-bh,drawerH=d.drawers?bh*.30:0,doorBottom=y1-drawerH;
    rect(x0,y0,x1,y1,false);
    if(d.doors){const gap=bw*.012,doorW=(bw-gap*(d.doors-1))/d.doors;for(let i=0;i<d.doors;i++){const a=x0+i*(doorW+gap);rect(a+1,y0+2,a+doorW-1,doorBottom-1,true);const hx=i<d.doors-1?a+doorW-bw*.025:a+bw*.025;line(hx, y0+bh*.30,hx, y0+bh*.43);}}
    else if(d.shelves){for(let i=1;i<=d.shelves;i++){const y=y0+i*bh/(d.shelves+1);line(x0+bw*.04,y,x1-bw*.04,y);}}
    if(d.drawers){for(let i=1;i<=d.drawers;i++){const y=y1-drawerH+i*drawerH/d.drawers;line(x0,y,x1,y);line((x0+x1)/2-bw*.025,y-drawerH/d.drawers*.5,(x0+x1)/2+bw*.025,y-drawerH/d.drawers*.5);}}
    if(d.corner){const wing=Math.min(bw*.22,Math.max(24,bw*d.cornerWidth/Math.max(d.w,1)));line(x1,y0+bh*.06,x1+wing*.65,y0+bh*.15);line(x1,y1-bh*.02,x1+wing*.65,y1-bh*.13);line(x1+wing*.65,y0+bh*.15,x1+wing*.65,y1-bh*.13);line(x1+wing*.65,y0+bh*.15,x1+wing,y0+bh*.21);line(x1+wing*.65,y1-bh*.13,x1+wing,y1-bh*.20);}
    return S;
  }
  function buildStorageModel(d,THREE){
    const root=new THREE.Group(); const color=MATERIAL_COLORS[d.material]||MATERIAL_COLORS.walnut;
    const bodyMat=new THREE.MeshStandardMaterial({color:color,roughness:.72});
    const frontMat=new THREE.MeshStandardMaterial({color:color,roughness:.55});
    const edgeMat=new THREE.MeshStandardMaterial({color:0x3b2a20,roughness:.65});
    const handleMat=new THREE.MeshStandardMaterial({color:d.material==='steel'?0xc9c9c9:0x60452f,metalness:.55,roughness:.38});
    function unit(w,h,depth,doors,drawers,shelves){
      const g=new THREE.Group(),t=Math.max(1.6,Math.min(3.2,w*.018)), gap=Math.max(1,Math.min(2,w*.008));
      function box(x,y,z,bw,bh,bd,mat){const m=new THREE.Mesh(new THREE.BoxGeometry(Math.max(.5,bw),Math.max(.5,bh),Math.max(.5,bd)),mat);m.position.set(x,y,z);g.add(m);return m;}
      // Full carcass: back, sides, top and bottom, raised slightly on a plinth.
      const plinth=Math.min(8,h*.07), insideW=w-2*t, insideD=depth-2*t;
      box(0,h/2,-depth/2+t/2,w-2*t,h-2*t,t,bodyMat);
      box(-w/2+t/2,h/2,0,t,h,depth,bodyMat); box(w/2-t/2,h/2,0,t,h,depth,bodyMat);
      box(0,h-t/2,0,w, t, depth, bodyMat); box(0,t/2,0,w,t,depth,bodyMat);
      box(0,plinth/2,depth*.03,w-2*t,plinth,depth*.78,edgeMat);
      const drawerZone=drawers?Math.min(h*.34,Math.max(18,drawers*18)):0;
      if(shelves>0){for(let i=1;i<=shelves;i++){const sy=drawerZone+(h-drawerZone)*i/(shelves+1);box(0,sy,-depth*.02,insideW,Math.max(1.4,t*.65),insideD,bodyMat);}}
      if(doors>0){const avail=insideW-gap*(doors-1),doorW=avail/doors,doorH=h-drawerZone-plinth-t;
        for(let i=0;i<doors;i++){const x=-insideW/2+doorW/2+i*(doorW+gap);box(x,drawerZone+plinth+doorH/2,depth/2+t*.48,doorW,doorH,t*.72,frontMat);
          const hx=x+(i<doors-1?doorW*.37:-doorW*.37);box(hx,drawerZone+plinth+doorH*.52,depth/2+t*1.05,1.4,11,2.2,handleMat);}
      }
      if(drawers>0){const faceW=insideW,faceH=drawerZone/drawers-gap*.5;for(let i=0;i<drawers;i++){const cy=plinth+faceH/2+i*drawerZone/drawers;box(0,cy,depth/2+t*.50,faceW,faceH,t*.75,frontMat);box(0,cy,depth/2+t*1.08,Math.min(14,faceW*.16),1.6,2.2,handleMat);}}
      return g;
    }
    root.add(unit(d.w,d.h,d.d,d.doors,d.drawers,d.shelves));
    if(d.corner){const rw=Math.max(30,Math.min(d.cornerWidth||d.d,d.d*1.25));const wing=unit(rw,d.h,Math.max(30,d.d*.82),Math.max(1,Math.min(2,d.doors||1)),0,Math.max(1,d.shelves));wing.rotation.y=Math.PI/2;wing.position.set(d.w/2+d.d*.32,0,-d.d*.18);root.add(wing);}
    const bounds=new THREE.Box3().setFromObject(root);root.position.x=-(bounds.min.x+bounds.max.x)/2;root.position.z=-(bounds.min.z+bounds.max.z)/2;root.position.y=-bounds.min.y;
    return root;
  }
  window.FurnitureAI={parse:parse,normalize:normalize,isStorage:isStorage,drawStorage:drawStorage,buildStorageModel:buildStorageModel};
})();
