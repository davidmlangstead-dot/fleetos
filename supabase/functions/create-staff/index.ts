import "jsr:@supabase/functions-js/edge-runtime.d.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const cors = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

const roleMap: Record<string, string> = {
  DRIVER: "DRIVER",
  OFFICE: "OFFICE_STAFF",
  WORKSHOP: "WORKSHOP_TECHNICIAN",
  SUPERVISOR: "TRANSPORT_PLANNER",
  MANAGER: "TRANSPORT_MANAGER",
  ADMIN: "COMPANY_ADMIN",
  FINANCE: "FINANCE",
};

const personTypes = new Set([
  "DRIVER", "ENGINEER", "TECHNICIAN", "OPERATIVE", "SUBCONTRACTOR", "CONTRACTOR",
  "OFFICE", "WORKSHOP", "SUPERVISOR", "MANAGER", "ADMIN",
]);
const driverCapableTypes = new Set(["DRIVER", "SUPERVISOR", "MANAGER", "WORKSHOP", "CONTRACTOR"]);

function json(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), { status, headers: { ...cors, "Content-Type": "application/json" } });
}

function escapeHtml(value: string) {
  return value.replace(/[&<>"']/g, (char) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#039;" }[char] ?? char));
}

async function sendBrandedInvite(params: {
  to: string; firstName: string; companyName: string; brandName: string; inviterEmail: string; roleLabel: string; actionLink: string;
}) {
  const apiKey = Deno.env.get("RESEND_API_KEY");
  const fromAddress = Deno.env.get("RIVETWAY_INVITE_FROM");
  if (!apiKey || !fromAddress) return { sent: false, reason: "Professional email sender is not configured" };

  const firstName = escapeHtml(params.firstName);
  const companyName = escapeHtml(params.companyName);
  const brandName = escapeHtml(params.brandName);
  const roleLabel = escapeHtml(params.roleLabel);
  const actionLink = params.actionLink;
  const html = `<!doctype html><html><body style="margin:0;background:#f4f7f8;font-family:Arial,sans-serif;color:#17212b"><div style="max-width:620px;margin:32px auto;background:#fff;border-radius:14px;overflow:hidden;border:1px solid #e5eaed"><div style="padding:26px 30px;background:#0e1b2c;color:#fff"><div style="font-size:22px;font-weight:700">${brandName}</div><div style="opacity:.8;margin-top:4px">Staff invitation</div></div><div style="padding:30px"><h1 style="font-size:22px;margin:0 0 18px">Hi ${firstName},</h1><p style="line-height:1.6;margin:0 0 14px"><strong>${companyName}</strong> has added you to ${brandName} as <strong>${roleLabel}</strong>.</p><p style="line-height:1.6;margin:0 0 24px">Use the button below to securely set up your account. This invitation is unique to you.</p><p style="margin:0 0 26px"><a href="${actionLink}" style="display:inline-block;background:#197b58;color:#fff;text-decoration:none;padding:13px 20px;border-radius:9px;font-weight:700">Set up your account</a></p><p style="font-size:13px;line-height:1.6;color:#64748b;margin:0">If you were not expecting this invitation, reply to this email and it will go back to the office user who added you.</p></div><div style="padding:18px 30px;border-top:1px solid #edf1f3;font-size:12px;color:#7b8794">Sent securely by ${brandName} for ${companyName}</div></div></body></html>`;

  const response = await fetch("https://api.resend.com/emails", {
    method: "POST",
    headers: { "Content-Type": "application/json", Authorization: `Bearer ${apiKey}` },
    body: JSON.stringify({
      from: fromAddress,
      to: [params.to],
      reply_to: params.inviterEmail,
      subject: `${params.companyName} invited you to ${params.brandName}`,
      html,
    }),
  });
  if (!response.ok) return { sent: false, reason: `Mail provider returned ${response.status}` };
  const data = await response.json().catch(() => ({}));
  return { sent: true, id: data?.id ?? null };
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: cors });

  try {
    const auth = req.headers.get("Authorization") ?? "";
    const url = Deno.env.get("SUPABASE_URL")!;
    const anon = Deno.env.get("SUPABASE_ANON_KEY")!;
    const service = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
    const callerClient = createClient(url, anon, { global: { headers: { Authorization: auth } } });
    const { data: { user: caller }, error: callerError } = await callerClient.auth.getUser();
    if (callerError || !caller?.email) return json({ error: "Unauthorised" }, 401);

    const body = await req.json();
    const {
      companyId, firstName, lastName, email, phone, personType, accessRole, startDate, dateOfBirth,
      address, postcode, emergencyContact, emergencyPhone, licenceNumber, licenceExpiry,
      cpcExpiry, tachoCardNumber, tachoCardExpiry, medicalDue, inviteAccount, onboardingKey, depotId,
      skills,
    } = body;

    if (typeof companyId !== "string" || !companyId.trim()) return json({ error: "Active company workspace is required" }, 400);
    if (!firstName?.trim() || !lastName?.trim() || !personType || !accessRole) return json({ error: "Name, person type and access role are required" }, 400);
    if (!roleMap[accessRole]) return json({ error: "Invalid access role" }, 400);
    if (!personTypes.has(personType)) return json({ error: "Invalid person type" }, 400);
    if (inviteAccount && !email?.trim()) return json({ error: "Email is required to create an account" }, 400);

    const cleanSkills = Array.isArray(skills)
      ? skills.filter((skill): skill is string => typeof skill === "string").map((skill) => skill.trim()).filter(Boolean).slice(0, 30)
      : [];
    const admin = createClient(url, service, { auth: { autoRefreshToken: false, persistSession: false } });

    const { data: appUser, error: appUserError } = await admin.from("User").select("id,email").ilike("email", caller.email).maybeSingle();
    if (appUserError) return json({ error: "Could not resolve app identity" }, 500);
    const candidateUserIds = [...new Set([caller.id, appUser?.id].filter(Boolean) as string[])];
    const { data: memberships, error: membershipLookupError } = await admin.from("CompanyMembership").select("companyId,role,userId").eq("companyId", companyId).in("userId", candidateUserIds);
    if (membershipLookupError) return json({ error: "Could not verify company permission" }, 500);
    const membership = memberships?.find((m: any) => ["COMPANY_ADMIN", "TRANSPORT_MANAGER", "PLATFORM_ADMIN"].includes(m.role));
    if (!membership) return json({ error: "You do not have permission to add staff to this company" }, 403);

    const [{ data: company }, { data: branding }] = await Promise.all([
      admin.from("Company").select("slug,name").eq("id", companyId).maybeSingle(),
      admin.from("CompanyControl").select("brandName").eq("companyId", companyId).maybeSingle(),
    ]);
    if (!company?.slug) return json({ error: "Company workspace could not be resolved" }, 400);
    const inviteBrandName = branding?.brandName?.trim() || "Rivetway";
    const companyName = company.name?.trim() || "Your company";
    const inviteRedirect = `https://fleetos-orpin-one.vercel.app/staff-invite?company=${encodeURIComponent(company.slug)}`;

    if (depotId) {
      const { data: depot, error: depotError } = await admin.from("Depot").select("id").eq("id", depotId).eq("companyId", companyId).eq("isActive", true).maybeSingle();
      if (depotError || !depot) return json({ error: "Depot is not active in the selected company" }, 400);
    }

    if (onboardingKey) {
      const { data: existing } = await admin.from("Person").select("*").eq("companyId", companyId).eq("onboardingKey", onboardingKey).maybeSingle();
      if (existing) return json({ ok: true, person: existing, invited: !!existing.userId, resumed: true }, 200);
    }

    const { data: person, error: personError } = await admin.from("Person").insert({
      companyId, userId: null, onboardingKey: onboardingKey || null, depotId: depotId || null,
      firstName: firstName.trim(), lastName: lastName.trim(), email: email?.trim() || null, phone: phone?.trim() || null,
      personType, accessRole, skills: cleanSkills, startDate: startDate || null, dateOfBirth: dateOfBirth || null,
      address: address?.trim() || null, postcode: postcode?.trim() || null,
      emergencyContact: emergencyContact?.trim() || null, emergencyPhone: emergencyPhone?.trim() || null, isActive: true,
    }).select().single();
    if (personError) return json({ error: personError.message }, 400);

    let linkedUserId: string | null = null;
    let invited = false;
    let inviteWarning: string | null = null;
    let inviteDelivery = "NOT_REQUESTED";
    let createdMembershipId: string | null = null;
    let createdAuthUserId: string | null = null;

    try {
      if (inviteAccount) {
        const normalizedEmail = email.trim().toLowerCase();
        const { data: existingFleetUser } = await admin.from("User").select("id,email").ilike("email", normalizedEmail).maybeSingle();

        if (existingFleetUser?.id) {
          linkedUserId = existingFleetUser.id;
          inviteDelivery = "EXISTING_ACCOUNT";
        } else {
          const metadata = { firstName: firstName.trim(), lastName: lastName.trim(), personType, accessRole, brandName: inviteBrandName, companySlug: company.slug };
          const hasBrandedSender = Boolean(Deno.env.get("RESEND_API_KEY") && Deno.env.get("RIVETWAY_INVITE_FROM"));
          if (hasBrandedSender) {
            const { data: linkData, error: linkError } = await admin.auth.admin.generateLink({
              type: "invite",
              email: normalizedEmail,
              options: { redirectTo: inviteRedirect, data: metadata },
            });
            if (linkError || !linkData?.user?.id || !linkData?.properties?.action_link) throw new Error(linkError?.message ?? "Could not create the staff invitation link");
            linkedUserId = linkData.user.id;
            createdAuthUserId = linkData.user.id;
            const delivery = await sendBrandedInvite({
              to: normalizedEmail,
              firstName: firstName.trim(),
              companyName,
              brandName: inviteBrandName,
              inviterEmail: caller.email,
              roleLabel: personType.replaceAll("_", " ").toLowerCase().replace(/\b\w/g, (c: string) => c.toUpperCase()),
              actionLink: linkData.properties.action_link,
            });
            if (!delivery.sent) {
              await admin.auth.admin.deleteUser(createdAuthUserId);
              createdAuthUserId = null;
              linkedUserId = null;
              throw new Error(delivery.reason ?? "Professional email could not be sent");
            }
            invited = true;
            inviteDelivery = "BRANDED_EMAIL";
          } else {
            const { data: fallbackInvite, error: fallbackError } = await admin.auth.admin.inviteUserByEmail(normalizedEmail, {
              data: metadata,
              redirectTo: inviteRedirect,
            });
            if (fallbackError || !fallbackInvite.user?.id) throw new Error(fallbackError?.message ?? "The staff invitation could not be sent");
            linkedUserId = fallbackInvite.user.id;
            createdAuthUserId = fallbackInvite.user.id;
            invited = true;
            inviteDelivery = "SUPABASE_EMAIL";
          }
        }

        if (linkedUserId) {
          const { error: userError } = await admin.from("User").upsert({
            id: linkedUserId, email: normalizedEmail, firstName: firstName.trim(), lastName: lastName.trim(), phone: phone?.trim() || null, updatedAt: new Date().toISOString(),
          }, { onConflict: "email" });
          if (userError) throw userError;
          const { data: existingMembership } = await admin.from("CompanyMembership").select("id,role").eq("userId", linkedUserId).eq("companyId", companyId).maybeSingle();
          if (!existingMembership) {
            const { data: createdMembership, error: membershipError } = await admin.from("CompanyMembership").insert({
              id: crypto.randomUUID(), userId: linkedUserId, companyId, role: roleMap[accessRole], updatedAt: new Date().toISOString(),
            }).select("id").single();
            if (membershipError) throw membershipError;
            createdMembershipId = createdMembership.id;
          }
          const { error: personUserError } = await admin.from("Person").update({ userId: linkedUserId }).eq("id", person.id).eq("companyId", companyId);
          if (personUserError) throw personUserError;
        }
      }

      if (driverCapableTypes.has(personType)) {
        const { error: driverError } = await admin.from("Driver").insert({
          id: person.id, personId: person.id, companyId, depotId: depotId || null,
          firstName: firstName.trim(), lastName: lastName.trim(), email: email?.trim() || null, phone: phone?.trim() || null,
          licenceNumber: licenceNumber?.trim() || null, licenceExpiry: licenceExpiry || null, cpcExpiry: cpcExpiry || null,
          tachoCardNumber: tachoCardNumber?.trim() || null, tachoCardExpiry: tachoCardExpiry || null, medicalDue: medicalDue || null,
          dateOfBirth: dateOfBirth || null, address: address?.trim() || null, postcode: postcode?.trim() || null,
          emergencyContact: emergencyContact?.trim() || null, emergencyPhone: emergencyPhone?.trim() || null,
          startDate: startDate || null, isActive: true, updatedAt: new Date().toISOString(),
        });
        if (driverError) throw driverError;
      }
    } catch (error) {
      console.error("create-staff transaction failed", { companyId, personId: person.id, error: error instanceof Error ? error.message : String(error) });
      if (createdMembershipId) await admin.from("CompanyMembership").delete().eq("id", createdMembershipId).eq("companyId", companyId);
      await admin.from("Driver").delete().eq("id", person.id).eq("companyId", companyId);
      await admin.from("Person").delete().eq("id", person.id).eq("companyId", companyId);
      if (createdAuthUserId) await admin.auth.admin.deleteUser(createdAuthUserId);
      return json({ error: error instanceof Error ? error.message : "Could not create staff record" }, 400);
    }

    return json({ ok: true, person: { ...person, userId: linkedUserId }, invited, inviteWarning, inviteDelivery }, 201);
  } catch (e) {
    console.error("create-staff failed", e);
    return json({ error: "Unexpected error creating staff record" }, 500);
  }
});

