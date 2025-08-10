
// Molecule Maker v21 - clean, no try/catch blocks
const $ = (s,el=document)=>el.querySelector(s);
const $$ = (s,el=document)=>[...el.querySelectorAll(s)];

let ELEMENTS = [];
let MOLECULE = {};
let lastStack = [];
let FACTS = {};

let PC_TIMER=null;
let CURRENT_CIDS = [];
let CURRENT_CID_INDEX = 0;
let VIEW3D=null;

function pcStatus(){ return document.getElementById("pcStatus"); }

document.addEventListener("DOMContentLoaded", init);

function init(){
  document.addEventListener("contextmenu", (e)=> e.preventDefault());

  fetch("elements.json")
    .then(r=>r.json())
    .then(data=>{ ELEMENTS=data; return fetch("facts_db.json"); })
    .then(r=> r.ok ? r.json() : {})
    .then(facts=>{ FACTS=facts||{}; buildPeriodic(); hookControls(); updateAll(); if("serviceWorker" in navigator){ navigator.serviceWorker.register("./sw.js"); } })
    .catch(e=>{
      const d = document.getElementById("diag");
      if(d){ d.style.display="block"; d.textContent = "Could not load elements.json: " + e; }
    });
}

function hookControls(){
  $("#clear").addEventListener("click", clearMolecule);
  $("#back").addEventListener("click", () => addLast(-1));
  $("#suggest").addEventListener("click", suggestExamples);
  $("#check").addEventListener("click", updateAll);
  $("#ionic").addEventListener("change", updateAll);
}

function buildPeriodic(){
  const grid = $("#grid");
  grid.innerHTML = "";
  const cols = 18;
  const rows = 9; // include f-block rows
  const slots = Array.from({length: rows}, ()=>Array.from({length: cols}, ()=>null));
  for(const e of ELEMENTS){
    if(e.period>0 && e.group>0){
      const r = e.period-1;
      const c = e.group-1;
      if(slots[r] && slots[r][c]===null) slots[r][c] = e;
    }
  }
  grid.style.gridTemplateColumns = `repeat(${cols}, minmax(2.4rem,1fr))`;

  // placeholders for f-block
  const laPl = document.createElement("div"); laPl.className="tile disabled"; laPl.innerHTML='<div class="sym">La–Lu</div>';
  const acPl = document.createElement("div"); acPl.className="tile disabled"; acPl.innerHTML='<div class="sym">Ac–Lr</div>';

  for(let r=0;r<slots.length;r++){
    for(let c=0;c<cols;c++){
      if(r===5 && c===2){ grid.appendChild(laPl.cloneNode(true)); continue; }
      if(r===6 && c===2){ grid.appendChild(acPl.cloneNode(true)); continue; }
      const e = slots[r][c];
      const div = document.createElement("button");
      div.className = "tile";
      if(!e){ div.classList.add("disabled"); grid.appendChild(div); continue; }
      if(["nonmetal","halogen","alkali metal","alkaline earth metal","metalloid","noble gas","post-transition metal","transition metal","lanthanide","actinide"].includes(e.category)){
        div.classList.add("kid");
      }
      div.innerHTML = `<div class="num">${e.atomicNumber}</div><div class="sym">${e.symbol}</div>`;
      div.addEventListener("click", () => addAtom(e.symbol, 1));
      let pressTimer=null;
      div.addEventListener("touchstart", (ev)=>{ ev.preventDefault(); pressTimer=setTimeout(()=> showFact(e), 600); }, {passive:false});
      const cancel=(ev)=>{ if(ev) ev.preventDefault(); if(pressTimer){ clearTimeout(pressTimer); pressTimer=null; } };
      div.addEventListener("touchend", cancel, {passive:false});
      div.addEventListener("touchmove", cancel, {passive:false});
      div.addEventListener("touchcancel", cancel, {passive:false});
      div.addEventListener("contextmenu", (ev)=>{ev.preventDefault(); showFact(e);});
      grid.appendChild(div);
    }
  }
}

function addAtom(sym, n=1){
  if(!MOLECULE[sym]) MOLECULE[sym]=0;
  MOLECULE[sym]+=n;
  if(MOLECULE[sym]<=0) delete MOLECULE[sym];
  lastStack.push([sym,n]);
  if(lastStack.length>100) lastStack.shift();
  updateAll();
}
function addLast(sign){
  const last = lastStack.pop();
  if(!last) return;
  const [sym,n]=last;
  addAtom(sym, sign*n);
}
function clearMolecule(){ MOLECULE={}; updateAll(); }

function renderBuilder(){
  const b=$("#builderList");
  b.innerHTML="";
  const entries = Object.entries(MOLECULE).sort((a,b)=> a[0].localeCompare(b[0]));
  if(entries.length===0){
    b.innerHTML = `<div style="opacity:.7">Tap elements to add them here. Long-press tiles for a quick fact!</div>`;
    return;
  }
  for(const [sym,count] of entries){
    const row=document.createElement("div");
    row.className="row";
    row.innerHTML = `
      <span class="badge" style="min-width:4.5rem;display:inline-flex;justify-content:space-between">
        <strong>${sym}</strong> <span>&times; ${count}</span>
      </span>
      <button class="pill" aria-label="add ${sym}">+1</button>
      <button class="pill" aria-label="remove ${sym}">-1</button>
    `;
    const btns = row.querySelectorAll("button");
    const addBtn = btns[0], subBtn = btns[1];
    if(addBtn) addBtn.addEventListener("click", ()=> addAtom(sym, 1));
    if(subBtn) subBtn.addEventListener("click", ()=> addAtom(sym, -1));
    b.appendChild(row);
  }
}

function formatFormula(obj){
  const entries = Object.entries(obj);
  entries.sort((a,b)=>{
    const order=(s)=> s==="C"?0: s==="H"?1: 2;
    const oa=order(a[0]), ob=order(b[0]);
    if(oa!==ob) return oa-ob;
    return a[0].localeCompare(b[0]);
  });
  return entries.map(([sym,n]) => sym + (n>1? `<span class="sub">${n}</span>`:"")).join("");
}
function canonicalFormula(obj){
  const entries = Object.entries(obj);
  entries.sort((a,b)=>{
    const order=(s)=> s==="C"?0: s==="H"?1: 2;
    const oa=order(a[0]), ob=order(b[0]);
    if(oa!==ob) return oa-ob;
    return a[0].localeCompare(b[0]);
  });
  return entries.map(([sym,n]) => sym + (n>1? String(n):"")).join("");
}
function molarMass(obj){
  let sum=0;
  for(const [sym,n] of Object.entries(obj)){
    const e = ELEMENTS.find(e=>e.symbol===sym);
    if(e && e.atomicMass) sum += e.atomicMass * n;
  }
  return sum;
}
function valencePlausibility(obj, ionic=false){
  const metals = ["alkali metal","alkaline earth metal","post-transition metal","transition metal"];
  const nonmetals = ["nonmetal","halogen","metalloid","noble gas"];
  const parts = Object.entries(obj).map(([sym,n])=>({e:ELEMENTS.find(e=>e.symbol===sym), n})).filter(p=>p.e);
  if(ionic){
    let charge=0;
    for(const {e,n} of parts){
      const v=Math.max(0,e.typicalValence||0);
      if(metals.includes(e.category)) charge += v*n; else if(nonmetals.includes(e.category)) charge -= v*n;
    }
    return {ok: charge===0, message: charge===0? "Ion counts balance to neutral." : "Ionic charges don't balance yet."};
  }else{
    let demand=0;
    for(const {e,n} of parts){ if((e.typicalValence||0)===0) continue; demand += (e.typicalValence||0)*n; }
    const ok = (demand%2===0) && demand>0;
    return {ok, message: ok? "Looks bondable (rough check)." : "This combo may not form simple covalent bonds."};
  }
}

function updateAll(){
  renderBuilder();
  $("#formula").innerHTML = formatFormula(MOLECULE) || "—";
  const mass = molarMass(MOLECULE);
  $("#mass").textContent = mass ? mass.toFixed(3) + " g/mol" : "—";
  const ionic = $("#ionic").checked;
  $("#plaus").textContent = valencePlausibility(MOLECULE, ionic).message;

  $("#back").disabled = (lastStack.length===0);
  $("#clear").disabled = (Object.keys(MOLECULE).length===0);

  const form = canonicalFormula(MOLECULE);
  renderFacts(form);
  debouncePubChem(form);
}

// Facts
function renderFacts(formula){
  const box = document.getElementById("molfacts");
  if(!box) return;
  box.innerHTML = "";
  const f = FACTS[formula];
  if(!f){ box.textContent = "No facts yet for " + (formula||"—") + "."; return; }
  const title = document.createElement("div"); title.style.fontWeight="800"; title.textContent = f.name + " ("+formula+")";
  box.appendChild(title);
  if(f.kid_facts){
    const ul = document.createElement("ul");
    for(const s of f.kid_facts){ const li=document.createElement("li"); li.textContent = s; ul.appendChild(li); }
    box.appendChild(ul);
  }
  if(f.example_uses){ const p=document.createElement("div"); p.innerHTML = "<strong>Uses:</strong> "+f.example_uses.join(", "); box.appendChild(p); }
  if(f.safety){ const p=document.createElement("div"); p.innerHTML = "<strong>Safety:</strong> "+f.safety; box.appendChild(p); }
}

// PubChem
function debouncePubChem(formula){
  if(PC_TIMER) clearTimeout(PC_TIMER);
  PC_TIMER = setTimeout(()=> fetchFromPubChem(formula), 300);
}

function fetchFromPubChem(formula){
  const status = pcStatus();
  const imgDiv = document.getElementById("pubchem2d");
  const img = document.getElementById("pubchem2dimg");
  const v3d = document.getElementById("viewer3d");
  const toggle = document.getElementById("toggle3d");

  if(!formula){
    if(status) status.textContent="";
    imgDiv.style.display="none"; v3d.style.display="none"; toggle.style.display="none";
    return;
  }

  if(status) status.textContent = "Searching PubChem…";
  const urlCids = `https://pubchem.ncbi.nlm.nih.gov/rest/pug/compound/fastformula/${encodeURIComponent(formula)}/cids/JSON`;

  // Fetch CIDs with simple 202 backoff
  function getCIDs(attempt){
    return fetch(urlCids, {mode:"cors", headers: {"Accept":"application/json"}}).then(resp=>{
      if(resp.status===202 && attempt<5){
        return new Promise(res=>setTimeout(res, 400*(attempt+1))).then(()=> getCIDs(attempt+1));
      }
      if(!resp.ok) throw new Error("CID HTTP "+resp.status);
      return resp.json();
    });
  }

  getCIDs(0).then(cidJson=>{
    const cids = (cidJson.IdentifierList && cidJson.IdentifierList.CID) || [];
    CURRENT_CIDS = cids; CURRENT_CID_INDEX = 0;
    if(cids.length===0){
      if(status) status.textContent = "No PubChem match for formula. (0 CIDs)";
      imgDiv.style.display="none"; v3d.style.display="none"; toggle.style.display="none";
      const nextIso=$("#nextIso"); if(nextIso) nextIso.style.display="none";
      return;
    }
    showCID(cids[0]);
    const nextIso = $("#nextIso");
    if(nextIso){
      nextIso.style.display = (cids.length>1) ? "inline-block" : "none";
      nextIso.onclick = ()=>{
        if(CURRENT_CIDS.length<=1) return;
        CURRENT_CID_INDEX = (CURRENT_CID_INDEX + 1) % CURRENT_CIDS.length;
        showCID(CURRENT_CIDS[CURRENT_CID_INDEX]);
      };
    }
  }).catch(e=>{
    if(status) status.textContent = "PubChem lookup failed.";
    imgDiv.style.display="none"; v3d.style.display="none"; toggle.style.display="none";
    const nextIso=$("#nextIso"); if(nextIso) nextIso.style.display="none";
    console.log("[PC] lookup failed", e);
  });
}

function showCID(cid){
  const status = pcStatus();
  const imgDiv = document.getElementById("pubchem2d");
  const img = document.getElementById("pubchem2dimg");
  const v3d = document.getElementById("viewer3d");
  const toggle = document.getElementById("toggle3d");

  const url2d = `https://pubchem.ncbi.nlm.nih.gov/rest/pug/compound/cid/${cid}/PNG?image_size=large`;
  img.src = url2d;
  imgDiv.style.display="block";

  // 3D
  let sdfText=null; let has3d=false;
  fetch(`https://pubchem.ncbi.nlm.nih.gov/rest/pug/compound/cid/${cid}/SDF?record_type=3d`, {mode:"cors"})
    .then(r=> r.ok ? r.text() : "")
    .then(sdf=>{ sdfText=sdf; has3d = !!(sdfText && sdfText.length>40);
      toggle.style.display = has3d ? "inline-block" : "none";
      v3d.style.display = "none";
      toggle.textContent = "Show 3D";
      toggle.onclick = ()=>{
        if(v3d.style.display==="none"){
          document.getElementById("pubchem2d").style.display="none";
          v3d.style.display="block";
          toggle.textContent="Show 2D";
          if(typeof $3Dmol !== "undefined"){
            if(!VIEW3D){ VIEW3D = $3Dmol.createViewer("viewer3d", {backgroundColor:"#ffffff"}); } else { VIEW3D.clear(); }
            if(sdfText){ VIEW3D.addModel(sdfText, "sdf"); }
            VIEW3D.setStyle({}, {stick:{}}); VIEW3D.zoomTo(); VIEW3D.render();
            window._mm_resize3d = ()=>{ if(VIEW3D){ VIEW3D.resize(); VIEW3D.render(); } };
            window.addEventListener("resize", window._mm_resize3d);
          }
        }else{
          v3d.style.display="none"; document.getElementById("pubchem2d").style.display="block"; toggle.textContent="Show 3D";
        }
      };
    });

  // Properties
  fetch(`https://pubchem.ncbi.nlm.nih.gov/rest/pug/compound/cid/${cid}/property/Title,IUPACName,MolecularWeight/JSON`, {mode:"cors", headers: {"Accept":"application/json"}})
    .then(r=> r.ok ? r.json() : null)
    .then(j=>{
      if(!j) { if(status) status.textContent = "Loaded from PubChem (CID "+cid+")"; return; }
      const prop = j.PropertyTable && j.PropertyTable.Properties && j.PropertyTable.Properties[0];
      if(prop && status){
        const title = prop.Title || "";
        const iupac = prop.IUPACName || "";
        status.textContent = (title? title+" – ": "") + (iupac? iupac: "") + "  (PubChem CID " + cid + ")" + (CURRENT_CIDS.length>1? `  [${CURRENT_CID_INDEX+1}/${CURRENT_CIDS.length}]` : "");
      }else if(status){ status.textContent = "Loaded from PubChem (CID "+cid+")"; }
    })
    .catch(e=>{ if(status) status.textContent = "Loaded 2D image from PubChem (CID "+cid+")"; });
}

// Facts by element long-press
function showFact(e){
  const facts = {
    "H":"Hydrogen is the most common element in the universe.",
    "He":"Helium makes balloons float!",
    "Li":"Lithium is used in batteries.",
    "Be":"Beryllium helps make emeralds sparkle (as beryl).",
    "B":"Boron helps make borax and tough glass.",
    "C":"Carbon makes up diamonds, graphite, and you!",
    "N":"Nitrogen is most of the air you breathe (78%).",
    "O":"Oxygen helps you breathe and fuels fires.",
    "F":"Fluorine is used in toothpaste (as fluoride).",
    "Ne":"Neon makes bright signs glow.",
    "Na":"Sodium + Chlorine = table salt (NaCl).",
    "Mg":"Magnesium burns with a bright white light.",
    "Al":"Aluminium is light and used in planes.",
    "Si":"Silicon is used to make computer chips.",
    "P":"Phosphorus glows faintly in the dark.",
    "S":"Sulfur smells like rotten eggs when burned.",
    "Cl":"Chlorine helps keep pools clean.",
    "Ar":"Argon is used in light bulbs to protect filaments.",
    "K":"Potassium is important for nerves.",
    "Ca":"Calcium helps build strong bones and teeth.",
    "Fe":"Iron carries oxygen in your blood.",
    "Ni":"Nickel is in many coins.",
    "Cu":"Copper wires carry electricity.",
    "Zn":"Zinc helps your immune system.",
    "Br":"Bromine is a red-brown liquid at room temperature.",
    "Kr":"Krypton is used in some camera flashes.",
    "I":"Iodine helps your thyroid; iodized salt contains it.",
    "Xe":"Xenon is used in bright car headlights."
  };
  const f = $("#facts");
  if(f) f.textContent = facts[e.symbol] || (e.name + " is an element.");
}

// Examples
function suggestExamples(){
  const examples = [
    {"H":2}, {"O":2}, {"N":2},
    {"H":2, "O":1},
    {"C":1, "O":2},
    {"C":1, "H":4},
    {"N":1, "H":3},
    {"H":2, "O":2},
    {"Na":1,"Cl":1},
    {"Ca":1,"Cl":2},
    {"C":2,"H":6},
    {"C":2,"H":4},
    {"C":2,"H":2},
  ];
  const pick = examples[Math.floor(Math.random()*examples.length)];
  MOLECULE = {...pick};
  updateAll();
}
