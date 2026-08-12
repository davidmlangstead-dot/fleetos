import { FormEvent, useEffect, useState } from "react";
import { api, ACTIVE_WORKSPACE_KEY } from "../../lib/api";
import { supabase } from "../../lib/supabase";

type Doc = { id:string; name:string; type:string; storagePath:string; fileSize:number|null; mimeType:string|null; createdAt:string };
const types = ["OTHER","VEHICLE_DOCUMENT","DRIVER_DOCUMENT","POD","INVOICE","CERTIFICATE","SERVICE_RECORD"];

function cleanFilename(name:string) {
  const safe = name.normalize("NFKD").replace(/[^a-zA-Z0-9._-]+/g,"-").replace(/-+/g,"-").slice(-160);
  return safe || "document";
}

export function DocumentsPage() {
  const [docs,setDocs] = useState<Doc[]>([]);
  const [file,setFile] = useState<File|null>(null);
  const [name,setName] = useState("");
  const [type,setType] = useState("OTHER");
  const [busy,setBusy] = useState(false);
  const [error,setError] = useState("");

  async function load() {
    try { setDocs(await api<Doc[]>("/documents")); setError(""); }
    catch(e) { setError(e instanceof Error?e.message:"Could not load documents."); }
  }
  useEffect(()=>{ void load(); },[]);

  async function upload(e:FormEvent) {
    e.preventDefault();
    const companyId = localStorage.getItem(ACTIVE_WORKSPACE_KEY);
    if(!companyId) return setError("No active company workspace is selected.");
    if(!file) return setError("Choose a file first.");
    if(file.size > 20*1024*1024) return setError("Files must be 20 MB or smaller.");
    const displayName = name.trim() || file.name;
    const path = `${companyId}/${crypto.randomUUID()}-${cleanFilename(file.name)}`;
    setBusy(true); setError("");
    try {
      const { error:storageError } = await supabase.storage.from("fleet-documents").upload(path,file,{upsert:false,contentType:file.type||undefined});
      if(storageError) throw storageError;
      try {
        await api("/documents",{method:"POST",body:JSON.stringify({name:displayName,storagePath:path,type,fileSize:file.size,mimeType:file.type||undefined})});
      } catch(apiError) {
        await supabase.storage.from("fleet-documents").remove([path]);
        throw apiError;
      }
      setFile(null); setName(""); setType("OTHER");
      const input = document.querySelector<HTMLInputElement>("#fleet-document-file"); if(input) input.value="";
      await load();
    } catch(e) { setError(e instanceof Error?e.message:"Could not upload document."); }
    finally { setBusy(false); }
  }

  async function openDoc(doc:Doc) {
    setError("");
    const { data,error:signedError } = await supabase.storage.from("fleet-documents").createSignedUrl(doc.storagePath,60);
    if(signedError || !data?.signedUrl) return setError(signedError?.message||"Could not open document.");
    window.open(data.signedUrl,"_blank","noopener,noreferrer");
  }

  async function removeDoc(doc:Doc) {
    if(!window.confirm(`Remove ${doc.name}?`)) return;
    setBusy(true); setError("");
    try {
      const { error:storageError } = await supabase.storage.from("fleet-documents").remove([doc.storagePath]);
      if(storageError) throw storageError;
      await api(`/documents/${doc.id}`,{method:"DELETE"});
      await load();
    } catch(e) { setError(e instanceof Error?e.message:"Could not remove document."); }
    finally { setBusy(false); }
  }

  return <section className="page">
    <div className="page-heading"><div><p className="eyebrow">Evidence & records</p><h1>Documents</h1><p className="subtle">Private company files stored inside the selected FleetOS tenant. Access follows company membership.</p></div></div>
    {error && <div className="panel" style={{padding:14,marginBottom:16,borderColor:"#dc2626",color:"#991b1b"}}>{error}</div>}
    <form className="panel" onSubmit={upload} style={{padding:18,marginBottom:20}}><h2>Add document</h2><div className="form-grid">
      <label>File<input id="fleet-document-file" type="file" required onChange={e=>{const f=e.target.files?.[0]||null;setFile(f);if(f&&!name)setName(f.name);}}/></label>
      <label>Display name<input maxLength={240} value={name} onChange={e=>setName(e.target.value)}/></label>
      <label>Document type<select value={type} onChange={e=>setType(e.target.value)}>{types.map(v=><option key={v} value={v}>{v.replaceAll("_"," ")}</option>)}</select></label>
    </div><p className="subtle">Private bucket · maximum 20 MB · no public document URLs.</p><button className="primary-button" disabled={busy}>{busy?"Uploading…":"Upload document"}</button></form>
    <section className="panel"><div className="panel-heading"><div><h2>Company evidence</h2><p className="subtle">{docs.length} files in this workspace.</p></div></div><div style={{display:"grid",gap:10,padding:16}}>{docs.length===0?<p className="subtle">No documents yet.</p>:docs.map(doc=><article key={doc.id} style={{display:"flex",justifyContent:"space-between",gap:14,alignItems:"center",border:"1px solid #e5e7eb",borderRadius:12,padding:14}}><div><strong>{doc.name}</strong><div className="subtle">{doc.type.replaceAll("_"," ")} · {new Date(doc.createdAt).toLocaleDateString("en-GB")}{doc.fileSize!=null?` · ${(doc.fileSize/1024/1024).toFixed(2)} MB`:""}</div></div><div style={{display:"flex",gap:8}}><button type="button" onClick={()=>void openDoc(doc)}>Open</button><button type="button" disabled={busy} onClick={()=>void removeDoc(doc)}>Remove</button></div></article>)}</div></section>
  </section>;
}
