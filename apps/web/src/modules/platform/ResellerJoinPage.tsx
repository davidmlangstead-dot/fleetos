import { useMemo, useState } from "react";
import { api } from "../../lib/api";

export function ResellerJoinPage() {
  const token = useMemo(() => new URLSearchParams(window.location.search).get("token") ?? "", []);
  const [busy,setBusy]=useState(false);
  const [message,setMessage]=useState("");

  async function accept(){
    if(!token){setMessage("This reseller invitation link is missing its secure token.");return;}
    setBusy(true);setMessage("");
    try{
      await api("/resellers/invites/accept",{method:"POST",body:JSON.stringify({token})});
      window.location.href="/";
    }catch(e){setMessage(e instanceof Error?e.message:"Could not accept reseller invitation");setBusy(false);}
  }

  return <section className="page"><div className="panel" style={{maxWidth:680,margin:"40px auto",padding:28}}>
    <p className="eyebrow">Reseller invitation</p><h1>Join the FleetOS reseller network</h1>
    <p>This invitation gives your account access to the dedicated white-label portal. It does <strong>not</strong> give access to FleetOS manager control or unrelated reseller/customer accounts.</p>
    {message&&<p className="form-message error">{message}</p>}
    <button onClick={()=>void accept()} disabled={busy||!token}>{busy?"Accepting…":"Accept reseller invitation"}</button>
  </div></section>;
}