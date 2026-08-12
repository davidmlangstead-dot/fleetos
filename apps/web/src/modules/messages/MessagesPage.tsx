import { FormEvent, useEffect, useState } from "react";
import { api } from "../../lib/api";

type Member = { id:string; email:string; firstName:string|null; lastName:string|null; role:string };
type Conversation = { id:string; title:string; lastMessage:string|null; lastMessageAt:string|null; memberCount:number };
type Message = { id:string; body:string; createdAt:string; senderUserId:string; senderEmail:string|null; senderFirstName:string|null; senderLastName:string|null };

function displayMember(member: Member) {
  const name = [member.firstName,member.lastName].filter(Boolean).join(" ");
  return name || member.email;
}
function displaySender(message: Message) {
  const name = [message.senderFirstName,message.senderLastName].filter(Boolean).join(" ");
  return name || message.senderEmail || "FleetOS user";
}

export function MessagesPage() {
  const [members,setMembers] = useState<Member[]>([]);
  const [conversations,setConversations] = useState<Conversation[]>([]);
  const [active,setActive] = useState<Conversation|null>(null);
  const [messages,setMessages] = useState<Message[]>([]);
  const [newTitle,setNewTitle] = useState("");
  const [selectedMembers,setSelectedMembers] = useState<string[]>([]);
  const [body,setBody] = useState("");
  const [error,setError] = useState("");
  const [busy,setBusy] = useState(false);

  async function loadConversations() {
    const [m,c] = await Promise.all([api<Member[]>("/messages/members"),api<Conversation[]>("/messages")]);
    setMembers(m); setConversations(c);
    if (active) setActive(c.find(x=>x.id===active.id) ?? null);
  }
  async function openConversation(conversation: Conversation) {
    setActive(conversation); setError("");
    try { setMessages(await api<Message[]>(`/messages/${conversation.id}`)); }
    catch(e) { setError(e instanceof Error ? e.message : "Could not load messages."); }
  }
  useEffect(()=>{ void loadConversations().catch(e=>setError(e instanceof Error?e.message:"Could not load conversations.")); },[]);

  async function createConversation(e:FormEvent) {
    e.preventDefault();
    if(!newTitle.trim()) return setError("Conversation title is required.");
    setBusy(true); setError("");
    try {
      const created = await api<Conversation>("/messages",{method:"POST",body:JSON.stringify({title:newTitle.trim(),memberUserIds:selectedMembers})});
      setNewTitle(""); setSelectedMembers([]); await loadConversations(); await openConversation(created);
    } catch(e) { setError(e instanceof Error?e.message:"Could not create conversation."); }
    finally { setBusy(false); }
  }

  async function send(e:FormEvent) {
    e.preventDefault();
    if(!active || !body.trim()) return;
    setBusy(true); setError("");
    try { await api(`/messages/${active.id}`,{method:"POST",body:JSON.stringify({body:body.trim()})}); setBody(""); await openConversation(active); await loadConversations(); }
    catch(e) { setError(e instanceof Error?e.message:"Could not send message."); }
    finally { setBusy(false); }
  }

  function toggleMember(id:string) { setSelectedMembers(v=>v.includes(id)?v.filter(x=>x!==id):[...v,id]); }

  return <section className="page">
    <div className="page-heading"><div><p className="eyebrow">Company messaging</p><h1>Messages</h1><p className="subtle">Private workspace conversations. Only selected participants from this company can open each thread.</p></div></div>
    {error && <div className="panel" style={{padding:14,marginBottom:16,borderColor:"#dc2626",color:"#991b1b"}}>{error}</div>}
    <div style={{display:"grid",gridTemplateColumns:"minmax(280px,360px) minmax(0,1fr)",gap:18,alignItems:"start"}}>
      <div style={{display:"grid",gap:16}}>
        <form className="panel" onSubmit={createConversation} style={{padding:16}}>
          <h2>New conversation</h2>
          <label>Title<input required maxLength={120} value={newTitle} onChange={e=>setNewTitle(e.target.value)} placeholder="Workshop / office / job team"/></label>
          <div style={{display:"grid",gap:6,marginTop:12,maxHeight:220,overflow:"auto"}}>{members.map(member=><label key={member.id} style={{display:"flex",gap:8,alignItems:"center"}}><input type="checkbox" checked={selectedMembers.includes(member.id)} onChange={()=>toggleMember(member.id)}/><span>{displayMember(member)} <small className="subtle">· {member.role.replaceAll("_"," ")}</small></span></label>)}</div>
          <button className="primary-button" disabled={busy} style={{marginTop:14}}>{busy?"Creating…":"Create conversation"}</button>
        </form>
        <section className="panel"><div className="panel-heading"><h2>Conversations</h2></div><div style={{display:"grid",gap:8,padding:12}}>{conversations.length===0?<p className="subtle">No conversations yet.</p>:conversations.map(c=><button key={c.id} type="button" onClick={()=>void openConversation(c)} style={{textAlign:"left",padding:12,borderRadius:10,border:active?.id===c.id?"2px solid #2563eb":"1px solid #e5e7eb",background:"white"}}><strong>{c.title}</strong><div className="subtle">{c.lastMessage || `${c.memberCount} participants`}</div></button>)}</div></section>
      </div>
      <section className="panel" style={{minHeight:560}}>{!active?<div className="empty-state" style={{padding:40}}><h2>Select a conversation</h2><p className="subtle">Create a company thread or open one you already belong to.</p></div>:<>
        <div className="panel-heading"><div><h2>{active.title}</h2><p className="subtle">{active.memberCount} participants</p></div></div>
        <div style={{display:"grid",gap:10,padding:16,maxHeight:420,overflow:"auto"}}>{messages.length===0?<p className="subtle">No messages yet.</p>:messages.map(m=><article key={m.id} style={{padding:12,borderRadius:12,background:"#f8fafc"}}><div style={{display:"flex",justifyContent:"space-between",gap:10}}><strong>{displaySender(m)}</strong><small className="subtle">{new Date(m.createdAt).toLocaleString("en-GB")}</small></div><p style={{whiteSpace:"pre-wrap",marginBottom:0}}>{m.body}</p></article>)}</div>
        <form onSubmit={send} style={{display:"flex",gap:10,padding:16,borderTop:"1px solid #e5e7eb"}}><input style={{flex:1}} maxLength={5000} value={body} onChange={e=>setBody(e.target.value)} placeholder="Write a message…"/><button className="primary-button" disabled={busy||!body.trim()}>Send</button></form>
      </>}</section>
    </div>
  </section>;
}
