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
    const { data: { user: caller } } = await callerClient.auth.getUser();
    if (!caller) return json({ error: "Unauthorised" }, 401);

    const admin = createClient(url, service);
    const { data: memberships } = await admin
      .from("CompanyMembership")
      .select("companyId,role")
      .eq("userId", caller.id);

    const membership = memberships?.find((m: any) =>
      ["COMPANY_ADMIN", "TRANSPORT_MANAGER", "PLATFORM_ADMIN"].includes(m.role)
    );
    if (!membership) return json({ error: "You do not have permission to add staff" }, 403);

    const body = await req.json();
    const {
      firstName, lastName, email, phone, personType, accessRole, startDate, dateOfBirth,
      address, postcode, emergencyContact, emergencyPhone, licenceNumber, licenceExpiry,
      cpcExpiry, tachoCardNumber, tachoCardExpiry, medicalDue, inviteAccount, onboardingKey,
    } = body;

    if (!firstName?.trim() || !lastName?.trim() || !personType || !accessRole) {
      return json({ error: "Name, person type and access role are required" }, 400);
    }
    if (!roleMap[accessRole]) return json({ error: "Invalid access role" }, 400);
    if (inviteAccount && !email?.trim()) return json({ error: "Email is required to create an account" }, 400);

    if (onboardingKey) {
      const { data: existing } = await admin
        .from("Person")
        .select("*")
        .eq("companyId", membership.companyId)
        .eq("onboardingKey", onboardingKey)
        .maybeSingle();
      if (existing) return json({ ok: true, person: existing, invited: !!existing.userId, resumed: true }, 200);
    }

    const { data: person, error: personError } = await admin
      .from("Person")
      .insert({
        companyId: membership.companyId,
        userId: null,
        onboardingKey: onboardingKey || null,
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

    if (personError) return json({ error: personError.message }, 500);

    let userId: string | null = null;
    let invited = false;

    try {
      if (inviteAccount) {
        const { data, error } = await admin.auth.admin.inviteUserByEmail(email.trim(), {
          data: { firstName: firstName.trim(), lastName: lastName.trim(), personType, accessRole },
        });
        if (error) throw error;

        userId = data.user?.id ?? null;
        invited = !!userId;

        if (userId) {
          const { error: userError } = await admin.from("User").upsert({
            id: userId,
            email: email.trim(),
            firstName: firstName.trim(),
            lastName: lastName.trim(),
            phone: phone?.trim() || null,
            updatedAt: new Date().toISOString(),
          });
          if (userError) throw userError;

          const { error: membershipError } = await admin.from("CompanyMembership").insert({
            userId,
            companyId: membership.companyId,
            role: roleMap[accessRole],
          });
          if (membershipError) throw membershipError;

          const { error: personUserError } = await admin
            .from("Person")
            .update({ userId })
            .eq("id", person.id);
          if (personUserError) throw personUserError;
        }
      }

      if (personType === "DRIVER") {
        const { error: driverError } = await admin.from("Driver").insert({
          id: person.id,
          companyId: membership.companyId,
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
        });
        if (driverError) throw driverError;
      }
    } catch (error) {
      if (userId) {
        await admin.from("CompanyMembership").delete().eq("userId", userId).eq("companyId", membership.companyId);
        await admin.from("User").delete().eq("id", userId);
        await admin.auth.admin.deleteUser(userId);
      }
      await admin.from("Driver").delete().eq("id", person.id);
      await admin.from("Person").delete().eq("id", person.id);
      return json({ error: error instanceof Error ? error.message : "Could not create staff record" }, 400);
    }

    return json({ ok: true, person: { ...person, userId }, invited }, 201);
  } catch (e) {
    return json({ error: e instanceof Error ? e.message : "Unexpected error" }, 500);
  }
});
