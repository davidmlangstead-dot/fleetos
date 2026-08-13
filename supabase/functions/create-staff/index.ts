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
};

function json(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...cors, "Content-Type": "application/json" },
  });
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
    } = body;

    if (typeof companyId !== "string" || !companyId.trim()) return json({ error: "Active company workspace is required" }, 400);
    if (!firstName?.trim() || !lastName?.trim() || !personType || !accessRole) {
      return json({ error: "Name, person type and access role are required" }, 400);
    }
    if (!roleMap[accessRole]) return json({ error: "Invalid access role" }, 400);
    if (inviteAccount && !email?.trim()) return json({ error: "Email is required to create an account" }, 400);

    const admin = createClient(url, service, { auth: { autoRefreshToken: false, persistSession: false } });

    const { data: appUser, error: appUserError } = await admin
      .from("User")
      .select("id,email")
      .ilike("email", caller.email)
      .maybeSingle();
    if (appUserError) return json({ error: "Could not resolve FleetOS identity" }, 500);

    const candidateUserIds = [...new Set([caller.id, appUser?.id].filter(Boolean) as string[])];
    const { data: memberships, error: membershipLookupError } = await admin
      .from("CompanyMembership")
      .select("companyId,role,userId")
      .eq("companyId", companyId)
      .in("userId", candidateUserIds);
    if (membershipLookupError) return json({ error: "Could not verify company permission" }, 500);

    const membership = memberships?.find((m: any) =>
      ["COMPANY_ADMIN", "TRANSPORT_MANAGER", "PLATFORM_ADMIN"].includes(m.role)
    );
    if (!membership) return json({ error: "You do not have permission to add staff to this company" }, 403);

    if (depotId) {
      const { data: depot, error: depotError } = await admin
        .from("Depot")
        .select("id")
        .eq("id", depotId)
        .eq("companyId", companyId)
        .eq("isActive", true)
        .maybeSingle();
      if (depotError || !depot) return json({ error: "Depot is not active in the selected company" }, 400);
    }

    if (onboardingKey) {
      const { data: existing } = await admin
        .from("Person")
        .select("*")
        .eq("companyId", companyId)
        .eq("onboardingKey", onboardingKey)
        .maybeSingle();
      if (existing) return json({ ok: true, person: existing, invited: !!existing.userId, resumed: true }, 200);
    }

    const { data: person, error: personError } = await admin
      .from("Person")
      .insert({
        companyId,
        userId: null,
        onboardingKey: onboardingKey || null,
        depotId: depotId || null,
        firstName: firstName.trim(),
        lastName: lastName.trim(),
        email: email?.trim() || null,
        phone: phone?.trim() || null,
        personType,
        accessRole,
        startDate: startDate || null,
        dateOfBirth: dateOfBirth || null,
        address: address?.trim() || null,
        postcode: postcode?.trim() || null,
        emergencyContact: emergencyContact?.trim() || null,
        emergencyPhone: emergencyPhone?.trim() || null,
        isActive: true,
      })
      .select()
      .single();

    if (personError) return json({ error: personError.message }, 400);

    let linkedUserId: string | null = null;
    let invited = false;
    let inviteWarning: string | null = null;

    try {
      if (inviteAccount) {
        const normalizedEmail = email.trim().toLowerCase();
        const { data: existingFleetUser } = await admin
          .from("User")
          .select("id,email")
          .ilike("email", normalizedEmail)
          .maybeSingle();

        if (existingFleetUser?.id) {
          linkedUserId = existingFleetUser.id;
        } else {
          const { data: inviteData, error: inviteError } = await admin.auth.admin.inviteUserByEmail(normalizedEmail, {
            data: { firstName: firstName.trim(), lastName: lastName.trim(), personType, accessRole },
            redirectTo: "https://fleetos-orpin-one.vercel.app",
          });

          if (inviteError) {
            const { data: usersPage, error: listError } = await admin.auth.admin.listUsers({ page: 1, perPage: 1000 });
            if (listError) throw inviteError;
            const existingAuth = usersPage.users.find((u) => u.email?.toLowerCase() === normalizedEmail);
            if (!existingAuth) inviteWarning = inviteError.message;
            else linkedUserId = existingAuth.id;
          } else {
            linkedUserId = inviteData.user?.id ?? null;
            invited = !!linkedUserId;
          }
        }

        if (linkedUserId) {
          const { error: userError } = await admin.from("User").upsert({
            id: linkedUserId,
            email: normalizedEmail,
            firstName: firstName.trim(),
            lastName: lastName.trim(),
            phone: phone?.trim() || null,
            updatedAt: new Date().toISOString(),
          }, { onConflict: "email" });
          if (userError) throw userError;

          const { data: existingMembership } = await admin
            .from("CompanyMembership")
            .select("id,role")
            .eq("userId", linkedUserId)
            .eq("companyId", companyId)
            .maybeSingle();

          if (!existingMembership) {
            const { error: membershipError } = await admin.from("CompanyMembership").insert({
              id: crypto.randomUUID(),
              userId: linkedUserId,
              companyId,
              role: roleMap[accessRole],
              updatedAt: new Date().toISOString(),
            });
            if (membershipError) throw membershipError;
          }

          const { error: personUserError } = await admin
            .from("Person")
            .update({ userId: linkedUserId })
            .eq("id", person.id)
            .eq("companyId", companyId);
          if (personUserError) throw personUserError;
        }
      }

      if (personType === "DRIVER") {
        const { error: driverError } = await admin.from("Driver").insert({
          id: person.id,
          personId: person.id,
          companyId,
          depotId: depotId || null,
          firstName: firstName.trim(),
          lastName: lastName.trim(),
          email: email?.trim() || null,
          phone: phone?.trim() || null,
          licenceNumber: licenceNumber?.trim() || null,
          licenceExpiry: licenceExpiry || null,
          cpcExpiry: cpcExpiry || null,
          tachoCardNumber: tachoCardNumber?.trim() || null,
          tachoCardExpiry: tachoCardExpiry || null,
          medicalDue: medicalDue || null,
          dateOfBirth: dateOfBirth || null,
          address: address?.trim() || null,
          postcode: postcode?.trim() || null,
          emergencyContact: emergencyContact?.trim() || null,
          emergencyPhone: emergencyPhone?.trim() || null,
          startDate: startDate || null,
          isActive: true,
          updatedAt: new Date().toISOString(),
        });
        if (driverError) throw driverError;
      }
    } catch (error) {
      console.error("create-staff transaction failed", {
        companyId,
        personId: person.id,
        personType,
        inviteAccount: !!inviteAccount,
        error: error instanceof Error ? error.message : String(error),
      });
      await admin.from("Driver").delete().eq("id", person.id).eq("companyId", companyId);
      await admin.from("Person").delete().eq("id", person.id).eq("companyId", companyId);
      return json({ error: error instanceof Error ? error.message : "Could not create staff record" }, 400);
    }

    return json({ ok: true, person: { ...person, userId: linkedUserId }, invited, inviteWarning }, 201);
  } catch (e) {
    console.error("create-staff failed", e);
    return json({ error: "Unexpected error creating staff record" }, 500);
  }
});

