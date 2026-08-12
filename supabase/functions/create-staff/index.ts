import "jsr:@supabase/functions-js/edge-runtime.d.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
const cors = { "Access-Control-Allow-Origin": "*", "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type" };
const roleMap: Record<string,string> = { DRIVER:"DRIVER", OFFICE:"OFFICE_STAFF", WORKSHOP:"WORKSHOP_TECHNICIAN", SUPERVISOR:"TRANSPORT_PLANNER", MANAGER:"TRANSPORT_MANAGER", ADMIN:"COMPANY_ADMIN" };
Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: cors });
  try {
    const auth = req.headers.get("Authorization") ?? "";
    const url = Deno.env.get("SUPABASE_URL")!;
    const anon = Deno.env.get("SUPABASE_ANON_KEY")!;
    const service = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
    const callerClient = createClient(url, anon, { global: { headers: { Authorization: auth } } });
    const { data: { user: caller } } = await callerClient.auth.getUser();
    if (!caller) return new Response(JSON.stringify({error:"Unauthorised"}), {status:401,headers:{...cors,"Content-Type":"application/json"}});
    const admin = createClient(url, service);
    const { data: memberships } = await admin.from("CompanyMembership").select("companyId,role").eq("userId", caller.id);
    const membership = memberships?.find((m:any) => ["COMPANY_ADMIN","TRANSPORT_MANAGER","PLATFORM_ADMIN"].includes(m.role));
    if (!membership) return new Response(JSON.stringify({error:"You do not have permission to add staff"}), {status:403,headers:{...cors,"Content-Type":"application/json"}});
    const body = await req.json();
    const { firstName,lastName,email,phone,personType,accessRole,startDate,dateOfBirth,address,postcode,emergencyContact,emergencyPhone,licenceNumber,licenceExpiry,cpcExpiry,tachoCardNumber,tachoCardExpiry,medicalDue,inviteAccount } = body;
    if (!firstName?.trim() || !lastName?.trim() || !personType || !accessRole) return new Response(JSON.stringify({error:"Name, person type and access role are required"}), {status:400,headers:{...cors,"Content-Type":"application/json"}});
    if (!roleMap[accessRole]) return new Response(JSON.stringify({error:"Invalid access role"}), {status:400,headers:{...cors,"Content-Type":"application/json"}});
    if (inviteAccount && !email?.trim()) return new Response(JSON.stringify({error:"Email is required to create an account"}), {status:400,headers:{...cors,"Content-Type":"application/json"}});
    let userId: string | null = null; let invited = false;
    if (inviteAccount) {
      const { data, error } = await admin.auth.admin.inviteUserByEmail(email.trim(), { data:{firstName:firstName.trim(),lastName:lastName.trim(),personType,accessRole} });
      if (error) return new Response(JSON.stringify({error:error.message}), {status:400,headers:{...cors,"Content-Type":"application/json"}});
      userId = data.user?.id ?? null; invited = !!userId;
      if (userId) {
        await admin.from("User").upsert({id:userId,email:email.trim(),firstName:firstName.trim(),lastName:lastName.trim(),phone:phone?.trim()||null,updatedAt:new Date().toISOString()});
        const { error: membershipError } = await admin.from("CompanyMembership").insert({userId,companyId:membership.companyId,role:roleMap[accessRole]});
        if (membershipError) return new Response(JSON.stringify({error:membershipError.message}), {status:400,headers:{...cors,"Content-Type":"application/json"}});
      }
    }
    const { data: person, error: personError } = await admin.from("Person").insert({companyId:membership.companyId,userId,firstName:firstName.trim(),lastName:lastName.trim(),email:email?.trim()||null,phone:phone?.trim()||null,personType,accessRole,startDate:startDate||null,dateOfBirth:dateOfBirth||null,address:address?.trim()||null,postcode:postcode?.trim()||null,emergencyContact:emergencyContact?.trim()||null,emergencyPhone:emergencyPhone?.trim()||null,isActive:true}).select().single();
    if (personError) return new Response(JSON.stringify({error:personError.message}), {status:500,headers:{...cors,"Content-Type":"application/json"}});
    if (personType === "DRIVER") {
      const { error: driverError } = await admin.from("Driver").insert({id:person.id,companyId:membership.companyId,firstName:firstName.trim(),lastName:lastName.trim(),email:email?.trim()||null,phone:phone?.trim()||null,licenceNumber:licenceNumber?.trim()||null,licenceExpiry:licenceExpiry||null,cpcExpiry:cpcExpiry||null,tachoCardNumber:tachoCardNumber?.trim()||null,tachoCardExpiry:tachoCardExpiry||null,medicalDue:medicalDue||null,dateOfBirth:dateOfBirth||null,address:address?.trim()||null,postcode:postcode?.trim()||null,emergencyContact:emergencyContact?.trim()||null,emergencyPhone:emergencyPhone?.trim()||null,startDate:startDate||null,isActive:true});
      if (driverError) return new Response(JSON.stringify({error:driverError.message}), {status:500,headers:{...cors,"Content-Type":"application/json"}});
    }
    return new Response(JSON.stringify({ok:true,person,invited}), {status:201,headers:{...cors,"Content-Type":"application/json"}});
  } catch (e) { return new Response(JSON.stringify({error:e instanceof Error?e.message:"Unexpected error"}), {status:500,headers:{...cors,"Content-Type":"application/json"}}); }
});