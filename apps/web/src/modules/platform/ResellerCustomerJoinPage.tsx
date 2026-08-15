import { FormEvent, useMemo, useState } from "react";
import { api, ACTIVE_WORKSPACE_KEY } from "../../lib/api";

type Workspace={id:string;name:string;slug:string;role:string};

export function ResellerCustomerJoinPage(){
  const token=useMemo(()=>new URLSearchParams(window.location.search).get("reseller")??"",[]);
  const [name,setName]=useState("");
  const [busy,setBusy]=useState(false);
  const [message,setMessage]=useState("");

  async function create(event:FormEvent){
    event.preventDefault();
    if(!token){setMessage("This customer invitation link is missing its secure token.");return;}
    setBusy(true);setMessage("");
    try{
      const company=await api<Workspace>("/company/workspaces",{method:"POST",body:JSON.stringify({name:name.trim()})});
      await api("/resellers/customer-invites/claim",{method:"POST",body:JSON.stringify({token,companyId:company.id})});
      localStorage.setItem(ACTIVE_WORKSPACE_KEY,company.id);
      window.location.href="/";
    }catch(e){setMessage(e instanceof Error?e.message:"Could not create the customer workspace");setBusy(false);}
  }

  return <section className="page"><div className="panel" style={{maxWidth:680,margin:"40px auto",padding:28}}>
    <p className="eyebrow">FleetOS customer invitation</p><h1>Create your company workspace</h1>
    <p>Your company will get its own isolated FleetOS workspace and will be linked to the reseller who issued this invitation. You will not receive reseller or FleetOS owner permissions.</p>
    {message&&<p className="form-message error">{message}</p>}
    <form onSubmit={create} style={{display:"grid",gap:14}}><label>Company / fleet name<input required minLength={2} value={name} onChange={e=>setName(e.target.value)} placeholder="Your company name"/></label><button disabled={busy||!token}>{busy?"Creating workspace…":"Create FleetOS workspace"}</button></form>
  </div></section>;
}
