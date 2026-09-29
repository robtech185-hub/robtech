const $ = id => document.getElementById(id);
let lastZip = null;

function fill(text){ $("prompt").value = text; $("prompt").focus(); }

function log(text, cls=""){
  const el=document.createElement("div");
  el.className="log "+cls;
  el.textContent="> "+text;
  $("logs").appendChild(el);
  $("logs").scrollTop=$("logs").scrollHeight;
}

async function buildProject(){
  const prompt=$("prompt").value.trim();
  if(!prompt){ $("prompt").focus(); return; }
  $("build").disabled=true;
  $("zip").disabled=true;
  $("state").textContent="قيد التنفيذ";
  $("logs").innerHTML="";
  $("files").innerHTML='<div class="empty">الوكيل يعمل...</div>';

  try{
    const res=await fetch("/api/build",{
      method:"POST",
      headers:{"Content-Type":"application/json"},
      body:JSON.stringify({prompt})
    });
    const data=await res.json();
    (data.logs||[]).forEach(x=>log(x,x.startsWith("✓")?"ok":""));
    if(!res.ok) throw new Error(data.error||"حدث خطأ");
    $("state").textContent="اكتمل";
    renderFiles(data.files||[]);
    lastZip=data.zip;
    $("zip").disabled=!lastZip;
    log("تم إنشاء المشروع وتسليمه بنجاح","ok");
  }catch(e){
    log("ERROR: "+e.message);
    $("state").textContent="خطأ";
  }finally{
    $("build").disabled=false;
  }
}

function renderFiles(files){
  if(!files.length){$("files").innerHTML='<div class="empty">لم يتم إنشاء ملفات</div>';return}
  $("files").innerHTML=files.map(f=>`<div class="file">▣ ${escapeHtml(f)}<small>FILE</small></div>`).join("");
}

function downloadZip(){
  if(lastZip) window.location.href=lastZip;
}

async function health(){
  try{
    const d=await (await fetch("/api/health")).json();
    alert(`RobTech Phase ${d.phase}\\nAI API: ${d.aiConfigured?"متصل":"غير مضبوط"}`);
  }catch(e){alert("الخادم غير متاح")}
}

function escapeHtml(v){
  return String(v).replace(/[&<>"']/g,c=>({"&":"&amp;","<":"&lt;",">":"&gt;",'"':"&quot;","'":"&#039;"}[c]));
}
