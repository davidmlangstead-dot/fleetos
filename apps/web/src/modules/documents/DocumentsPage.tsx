import { FormEvent, useEffect, useMemo, useState } from "react";
import { FileSearch, Link2, Search, Upload } from "lucide-react";
import { api, ACTIVE_WORKSPACE_KEY } from "../../lib/api";
import { supabase } from "../../lib/supabase";

type Doc={id:string;name:string;type:string;storagePath:string;fileSize:number|null;mimeType:string|null;vehicleId:string|null;driverId:string|null;jobId:string|null;defectId:string|null;complianceId:string|null;maintenanceWorkOrderId:string|null;createdAt:string};
type Option={id:string;label:string};
type LinkOptions={vehicles:Option[];drivers:Option[];jobs:Option[];defects:Option[];compliance:Option[];workOrders:Option[]};
type LinkType="none"|"vehicleId"|"driverId"|"jobId"|"defectId"|"complianceId"|"maintenanceWorkOrderId";
const types=["OTHER","VEHICLE_DOCUMENT","DRIVER_DOCUMENT","POD","INVOICE","CERTIFICATE","SERVICE_RECORD"];
const emptyOptions:LinkOptions={vehicles:[],drivers:[],jobs:[],defects:[],compliance:[],workOrders:[]};
const linkMap:Record<Exclude<LinkType,"none">,keyof LinkOptions>={vehicleId:"vehicles",driverId:"drivers",jobId:"jobs",defectId:"defects",complianceId:"compliance",maintenanceWorkOrderId:"workOrders"};
const linkLabels:Record<LinkType,string>={none:"Company record only",vehicleId:"Vehicle",driverId:"Driver",jobId:"Job",defectId:"Defect",complianceId:"Compliance item",maintenanceWorkOrderId:"Workshop work order"};

function cleanFilename(name:string){const safe=name.normalize("NFKD").replace(/[^a-zA-Z0-9._-]+/g,"-").replace(/-+/g,"-").slice(-160);return safe||"document";}

export function DocumentsPage(){
  const [docs,setDocs]=useState<Doc[]>([]);const [options,setOptions]=useState<LinkOptions>(emptyOptions);const [file,setFile]=useState<File|null>(null);const [name,setName]=useState("");const [type,setType]=useState("OTHER");
  const [linkType,setLinkType]=useState<LinkType>("none");const [linkId,setLinkId]=useState("");const [search,setSearch]=useState("");const [filterType,setFilterType]=useState("ALL");const [busy,setBusy]=useState(false);const [error,setError]=useState("");
  async function load(){try{const [documents,links]=await Promise.all([api<Doc[]>("/documents"),api<LinkOptions>("/documents/link-options")]);setDocs(documents);setOptions(links);setError("");}catch(e){setError(e instanceof Error?e.message:"Could not load documents.");}}
  useEffect(()=>{void load();},[]);
  const selectedOptions=linkType==="none"?[]:options[linkMap[linkType]];
  const optionLookup=useMemo(()=>{const map=new Map<string,string>();Object.values(options).flat().forEach(item=>map.set(item.id,item.label));return map;},[options]);
  const filtered=useMemo(()=>docs.filter(doc=>(filterType==="ALL"||doc.type===filterType)&&`${doc.name} ${doc.type} ${linkedLabel(doc,optionLookup)}`.toLowerCase().includes(search.toLowerCase())),[docs,filterType,search,optionLookup]);

  async function upload(e:FormEvent){e.preventDefault();const companyId=localStorage.getItem(ACTIVE_WORKSPACE_KEY);if(!companyId)return setError("No active company workspace is selected.");if(!file)return setError("Choose a file first.");if(file.size>20*1024*1024)return setError("Files must be 20 MB or smaller.");if(linkType!=="none"&&!linkId)return setError(`Choose the ${linkLabels[linkType].toLowerCase()} this document belongs to.`);const displayName=name.trim()||file.name;const path=`${companyId}/${crypto.randomUUID()}-${cleanFilename(file.name)}`;setBusy(true);setError("");try{const {error:storageError}=await supabase.storage.from("fleet-documents").upload(path,file,{upsert:false,contentType:file.type||undefined});if(storageError)throw storageError;try{await api("/documents",{method:"POST",body:JSON.stringify({name:displayName,storagePath:path,type,fileSize:file.size,mimeType:file.type||undefined,...(linkType!=="none"?{[linkType]:linkId}:{})})});}catch(apiError){await supabase.storage.from("fleet-documents").remove([path]);throw apiError;}setFile(null);setName("");setType("OTHER");setLinkType("none");setLinkId("");const input=document.querySelector<HTMLInputElement>("#fleet-document-file");if(input)input.value="";await load();}catch(e){setError(e instanceof Error?e.message:"Could not upload document.");}finally{setBusy(false);}}
  async function openDoc(doc:Doc){setError("");const {data,error:signedError}=await supabase.storage.from("fleet-documents").createSignedUrl(doc.storagePath,60);if(signedError||!data?.signedUrl)return setError(signedError?.message||"Could not open document.");window.open(data.signedUrl,"_blank","noopener,noreferrer");}
  async function removeDoc(doc:Doc){if(!window.confirm(`Remove ${doc.name}?`))return;setBusy(true);setError("");try{const {error:storageError}=await supabase.storage.from("fleet-documents").remove([doc.storagePath]);if(storageError)throw storageError;await api(`/documents/${doc.id}`,{method:"DELETE"});await load();}catch(e){setError(e instanceof Error?e.message:"Could not remove document.");}finally{setBusy(false);}}

  return <section className="page">
    <div className="page-heading"><div><p className="eyebrow">Evidence & records</p><h1>Documents</h1><p className="subtle">Upload evidence once and attach it to the vehicle, driver, job, defect, compliance item or workshop order it proves.</p></div><div className="presence">{docs.length} company files</div></div>
    {error&&<p role="alert" className="form-message error">{error}</p>}
    <form className="panel" onSubmit={upload} style={{padding:18,marginBottom:20}}><div style={{display:"flex",gap:10,alignItems:"center",marginBottom:14}}><Upload size={20}/><h2>Add linked evidence</h2></div><div className="form-grid">
      <label>File *<input id="fleet-document-file" type="file" required onChange={e=>{const f=e.target.files?.[0]||null;setFile(f);if(f&&!name)setName(f.name);}}/></label>
      <label>Display name<input maxLength={240} value={name} onChange={e=>setName(e.target.value)}/></label>
      <label>Document type<select value={type} onChange={e=>setType(e.target.value)}>{types.map(v=><option key={v} value={v}>{v.replaceAll("_"," ")}</option>)}</select></label>
      <label>Link to<select value={linkType} onChange={e=>{setLinkType(e.target.value as LinkType);setLinkId("");}}>{Object.entries(linkLabels).map(([value,label])=><option key={value} value={value}>{label}</option>)}</select></label>
      {linkType!=="none"&&<label>FleetOS record *<select required value={linkId} onChange={e=>setLinkId(e.target.value)}><option value="">Choose {linkLabels[linkType].toLowerCase()}</option>{selectedOptions.map(item=><option key={item.id} value={item.id}>{item.label}</option>)}</select></label>}
    </div><p className="subtle">Private bucket · maximum 20 MB · signed links expire after 60 seconds.</p><button className="primary-button" disabled={busy}>{busy?"Uploading…":"Upload evidence"}</button></form>
    <section className="panel"><div className="panel-heading"><div><h2>Company evidence</h2><p>Search names, types and linked FleetOS records.</p></div></div><div style={{display:"flex",gap:10,padding:"0 16px 16px",flexWrap:"wrap"}}><div className="search" style={{flex:1,minWidth:240}}><Search size={18}/><input placeholder="Search documents…" value={search} onChange={e=>setSearch(e.target.value)}/></div><select value={filterType} onChange={e=>setFilterType(e.target.value)}><option value="ALL">All document types</option>{types.map(v=><option key={v} value={v}>{v.replaceAll("_"," ")}</option>)}</select></div><div style={{display:"grid",gap:10,padding:16,borderTop:"1px solid #edf0f4"}}>{filtered.length===0?<div className="empty-state" style={{margin:"40px auto"}}><FileSearch size={28}/><h2>No matching documents</h2><p>Upload evidence above or change the search.</p></div>:filtered.map(doc=><article key={doc.id} style={{display:"flex",justifyContent:"space-between",gap:14,alignItems:"center",border:"1px solid #e5e7eb",borderRadius:12,padding:14}}><div><strong>{doc.name}</strong><div className="subtle">{doc.type.replaceAll("_"," ")} · {new Date(doc.createdAt).toLocaleDateString("en-GB")}{doc.fileSize!=null?` · ${(doc.fileSize/1024/1024).toFixed(2)} MB`:""}</div><div style={{display:"flex",alignItems:"center",gap:6,marginTop:5,fontSize:13,color:"#526278"}}><Link2 size={14}/>{linkedLabel(doc,optionLookup)}</div></div><div style={{display:"flex",gap:8}}><button type="button" onClick={()=>void openDoc(doc)}>Open</button><button type="button" disabled={busy} onClick={()=>void removeDoc(doc)}>Remove</button></div></article>)}</div></section>
  </section>;
}

function linkedLabel(doc:Doc,lookup:Map<string,string>){const id=doc.maintenanceWorkOrderId||doc.vehicleId||doc.driverId||doc.jobId||doc.defectId||doc.complianceId;return id?lookup.get(id)||"Linked FleetOS record":"Company record only";}
