import { useEffect, useState } from "react";
import { api } from "../../lib/api";

type Summary = {
  generatedAt:string;
  fleet:{total:number;active:number;offRoad:number};
  people:{activeDrivers:number};
  jobs:Record<string,number>;
  exceptions:{openDefects:number;overdueCompliance:number};
  documents:number;
  registers:Record<string,number>;
  spend:{monthPence:number};
};

function Card({label,value,sub}:{label:string;value:string|number;sub?:string}) {
  return <div className="panel" style={{padding:18}}><div className="subtle">{label}</div><div style={{fontSize:30,fontWeight:800,marginTop:4}}>{value}</div>{sub&&<div className="subtle" style={{marginTop:4}}>{sub}</div>}</div>;
}

export function ReportsPage() {
  const [data,setData] = useState<Summary|null>(null);
  const [error,setError] = useState("");
  async function load(){try{setData(await api<Summary>("/reports/summary"));setError("");}catch(e){setError(e instanceof Error?e.message:"Could not load reporting data.");}}
  useEffect(()=>{void load();},[]);
  const openJobs = data ? Object.entries(data.jobs).filter(([k])=>!['DELIVERED','CANCELLED'].includes(k)).reduce((s,[,v])=>s+v,0) : 0;
  return <section className="page">
    <div className="page-heading"><div><p className="eyebrow">Tenant reporting</p><h1>Reports</h1><p className="subtle">Live operational summary for the selected company only.</p></div><button onClick={()=>void load()}>Refresh</button></div>
    {error&&<div className="panel" style={{padding:14,marginBottom:16,borderColor:"#dc2626",color:"#991b1b"}}>{error}</div>}
    {!data?<div className="panel" style={{padding:24}}>Loading report…</div>:<>
      <div style={{display:"grid",gridTemplateColumns:"repeat(auto-fit,minmax(180px,1fr))",gap:14,marginBottom:18}}>
        <Card label="Fleet" value={data.fleet.total} sub={`${data.fleet.active} active · ${data.fleet.offRoad} off road`}/>
        <Card label="Active drivers" value={data.people.activeDrivers}/>
        <Card label="Open jobs" value={openJobs}/>
        <Card label="Open defects" value={data.exceptions.openDefects}/>
        <Card label="Overdue compliance" value={data.exceptions.overdueCompliance}/>
        <Card label="Documents" value={data.documents}/>
        <Card label="Recorded spend this month" value={`£${(data.spend.monthPence/100).toFixed(2)}`}/>
      </div>
      <div style={{display:"grid",gridTemplateColumns:"repeat(auto-fit,minmax(280px,1fr))",gap:18}}>
        <section className="panel"><div className="panel-heading"><h2>Jobs by status</h2></div><div style={{padding:16,display:"grid",gap:8}}>{Object.keys(data.jobs).length===0?<p className="subtle">No jobs yet.</p>:Object.entries(data.jobs).map(([k,v])=><div key={k} style={{display:"flex",justifyContent:"space-between"}}><span>{k.replaceAll("_"," ")}</span><strong>{v}</strong></div>)}</div></section>
        <section className="panel"><div className="panel-heading"><h2>Register coverage</h2></div><div style={{padding:16,display:"grid",gap:8}}>{Object.keys(data.registers).length===0?<p className="subtle">No register records yet.</p>:Object.entries(data.registers).sort((a,b)=>a[0].localeCompare(b[0])).map(([k,v])=><div key={k} style={{display:"flex",justifyContent:"space-between"}}><span>{k.replaceAll("_"," ")}</span><strong>{v}</strong></div>)}</div></section>
      </div>
      <p className="subtle" style={{marginTop:16}}>Generated {new Date(data.generatedAt).toLocaleString("en-GB")}.</p>
    </>}
  </section>;
}
