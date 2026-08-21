import { randomUUID } from "node:crypto";
import { Router } from "express";
import { asyncHandler } from "../../lib/asyncHandler.js";
import { prisma } from "../../lib/prisma.js";
import { writeAuditEvent } from "../../lib/audit.js";
import { requireAuth, requireRoles } from "../../middleware/auth.js";

type DepotRow = { id:string; companyId:string; name:string; address:string|null; postcode:string|null; phone:string|null; isActive:boolean; vehicleCount:bigint; peopleCount:bigint; openWorkCount:bigint; createdAt:Date; updatedAt:Date };
type AuditRow = { id:string; companyId:string; actorUserId:string|null; actorEmail:string|null; action:string; entityType:string; entityId:string|null; summary:string; metadata:unknown; createdAt:Date };
type StaffArchiveRow = { id:string; userId:string|null; firstName:string; lastName:string; isActive:boolean; ownerId:string };
const managers = requireRoles("TRANSPORT_MANAGER", "COMPANY_ADMIN", "PLATFORM_ADMIN");
const readers = requireRoles("WORKSHOP_TECHNICIAN", "TRANSPORT_PLANNER", "TRANSPORT_MANAGER", "OFFICE_STAFF", "COMPANY_ADMIN", "PLATFORM_ADMIN");

export const organisationRouter = Router();
organisationRouter.use(requireAuth);

organisationRouter.get("/depots", readers, asyncHandler(async (req, res) => {
  const rows = await prisma.$queryRaw<DepotRow[]>`
    SELECT d.id::text,d."companyId",d.name,d.address,d.postcode,d.phone,d."isActive",d."createdAt",d."updatedAt",
      (SELECT COUNT(*) FROM "Vehicle" v WHERE v."companyId"=d."companyId" AND v."depotId"=d.id AND v.status<>'ARCHIVED') AS "vehicleCount",
      (SELECT COUNT(*) FROM "Person" p WHERE p."companyId"=d."companyId" AND p."depotId"=d.id AND p."isActive"=true) AS "peopleCount",
      (SELECT COUNT(*) FROM "MaintenanceWorkOrder" w WHERE w."companyId"=d."companyId" AND w."depotId"=d.id AND w.status NOT IN ('COMPLETED','CANCELLED')) AS "openWorkCount"
    FROM "Depot" d WHERE d."companyId"=${req.user!.companyId}
    ORDER BY d."isActive" DESC,d.name ASC
  `;
  res.json(rows.map(r => ({ ...r, vehicleCount:Number(r.vehicleCount), peopleCount:Number(r.peopleCount), openWorkCount:Number(r.openWorkCount) })));
}));

organisationRouter.post("/depots", managers, asyncHandler(async (req, res) => {
  const name = typeof req.body?.name === "string" ? req.body.name.trim().slice(0,120) : "";
  const address = typeof req.body?.address === "string" ? req.body.address.trim().slice(0,240) : "";
  const postcode = typeof req.body?.postcode === "string" ? req.body.postcode.trim().slice(0,20) : "";
  const phone = typeof req.body?.phone === "string" ? req.body.phone.trim().slice(0,40) : "";
  if (!name) return res.status(400).json({ error:"Depot or site name is required" });
  const id = randomUUID();
  try {
    await prisma.$executeRaw`INSERT INTO "Depot" (id,"companyId",name,address,postcode,phone,"isActive","createdAt","updatedAt") VALUES (${id}::uuid,${req.user!.companyId},${name},${address||null},${postcode||null},${phone||null},true,NOW(),NOW())`;
  } catch (error) {
    if ((error instanceof Error ? error.message : "").includes("Depot_companyId_name_key")) return res.status(409).json({ error:"A depot or site with that name already exists" });
    throw error;
  }
  await writeAuditEvent({ companyId:req.user!.companyId,actorUserId:req.user!.id,actorEmail:req.user!.email,action:"CREATE",entityType:"DEPOT",entityId:id,summary:`Created depot/site ${name}` });
  res.status(201).json({ id,companyId:req.user!.companyId,name,address:address||null,postcode:postcode||null,phone:phone||null,isActive:true,vehicleCount:0,peopleCount:0,openWorkCount:0 });
}));

organisationRouter.patch("/depots/:id", managers, asyncHandler(async (req, res) => {
  const rows = await prisma.$queryRaw<DepotRow[]>`SELECT d.*,d.id::text,0::bigint AS "vehicleCount",0::bigint AS "peopleCount",0::bigint AS "openWorkCount" FROM "Depot" d WHERE d.id=${req.params.id}::uuid AND d."companyId"=${req.user!.companyId} LIMIT 1`;
  const current = rows[0];
  if (!current) return res.status(404).json({ error:"Depot or site not found" });
  const name = typeof req.body?.name === "string" ? req.body.name.trim().slice(0,120) : current.name;
  const address = typeof req.body?.address === "string" ? req.body.address.trim().slice(0,240) : current.address ?? "";
  const postcode = typeof req.body?.postcode === "string" ? req.body.postcode.trim().slice(0,20) : current.postcode ?? "";
  const phone = typeof req.body?.phone === "string" ? req.body.phone.trim().slice(0,40) : current.phone ?? "";
  const isActive = typeof req.body?.isActive === "boolean" ? req.body.isActive : current.isActive;
  if (!name) return res.status(400).json({ error:"Depot or site name is required" });
  await prisma.$executeRaw`UPDATE "Depot" SET name=${name},address=${address||null},postcode=${postcode||null},phone=${phone||null},"isActive"=${isActive},"updatedAt"=NOW() WHERE id=${req.params.id}::uuid AND "companyId"=${req.user!.companyId}`;
  await writeAuditEvent({ companyId:req.user!.companyId,actorUserId:req.user!.id,actorEmail:req.user!.email,action:"UPDATE",entityType:"DEPOT",entityId:req.params.id,summary:`${isActive?"Updated":"Archived"} depot/site ${name}`,metadata:{isActive} });
  res.json({ id:req.params.id,companyId:req.user!.companyId,name,address:address||null,postcode:postcode||null,phone:phone||null,isActive });
}));

organisationRouter.delete("/staff/:id", managers, asyncHandler(async (req, res) => {
  const rows = await prisma.$queryRaw<StaffArchiveRow[]>`
    SELECT p.id,p."userId",p."firstName",p."lastName",p."isActive",c."ownerId"
    FROM "Person" p
    JOIN "Company" c ON c.id=p."companyId"
    WHERE p.id=${req.params.id} AND p."companyId"=${req.user!.companyId}
    LIMIT 1
  `;
  const person = rows[0];
  if (!person) return res.status(404).json({ error:"Staff member not found" });
  if (!person.isActive) return res.status(204).end();
  if (person.userId === req.user!.id) return res.status(409).json({ error:"You cannot remove your own access. Ask another company administrator." });
  if (person.userId && person.userId === person.ownerId) return res.status(409).json({ error:"The company owner cannot be removed. Transfer ownership first." });

  const result = await prisma.$transaction(async (tx) => {
    await tx.$executeRaw`
      UPDATE "Person"
      SET "isActive"=false,"updatedAt"=NOW()
      WHERE id=${person.id} AND "companyId"=${req.user!.companyId}
    `;
    await tx.$executeRaw`
      UPDATE "Driver"
      SET "isActive"=false,"leftDate"=COALESCE("leftDate",NOW()),"updatedAt"=NOW()
      WHERE "companyId"=${req.user!.companyId} AND ("personId"=${person.id} OR id=${person.id})
    `;

    if (!person.userId) return { membershipRevoked:false };
    const otherActive = await tx.$queryRaw<Array<{ count:bigint }>>`
      SELECT COUNT(*)::bigint AS count FROM "Person"
      WHERE "companyId"=${req.user!.companyId} AND "userId"=${person.userId} AND id<>${person.id} AND "isActive"=true
    `;
    if (Number(otherActive[0]?.count ?? 0n) > 0) return { membershipRevoked:false };
    const deleted = await tx.$executeRaw`
      DELETE FROM "CompanyMembership" WHERE "companyId"=${req.user!.companyId} AND "userId"=${person.userId}
    `;
    return { membershipRevoked:deleted > 0 };
  });

  await writeAuditEvent({
    companyId:req.user!.companyId,actorUserId:req.user!.id,actorEmail:req.user!.email,
    action:"ARCHIVE",entityType:"PERSON",entityId:person.id,
    summary:`Removed staff member ${person.firstName} ${person.lastName}`,
    metadata:{membershipRevoked:result.membershipRevoked},
  });
  res.status(204).end();
}));


organisationRouter.delete("/staff/:id", managers, asyncHandler(async (req, res) => {
  const companyId = req.user!.companyId;
  const rows = await prisma.$queryRaw<Array<{ id:string; userId:string|null; firstName:string; lastName:string; isActive:boolean }>>`
    SELECT id,"userId","firstName","lastName","isActive"
    FROM "Person"
    WHERE id=${req.params.id} AND "companyId"=${companyId}
    LIMIT 1
  `;
  const person = rows[0];
  if (!person) return res.status(404).json({ error:"Staff member not found" });
  if (person.userId === req.user!.id) return res.status(409).json({ error:"You cannot remove your own staff access" });

  if (person.userId) {
    const membership = (await prisma.$queryRaw<Array<{ role:string }>>`
      SELECT role::text FROM "CompanyMembership"
      WHERE "companyId"=${companyId} AND "userId"=${person.userId}
      LIMIT 1
    `)[0];
    if (membership && ["COMPANY_ADMIN","PLATFORM_ADMIN"].includes(membership.role)) {
      const admins = await prisma.$queryRaw<Array<{ count:bigint }>>`
        SELECT count(*) FROM "CompanyMembership"
        WHERE "companyId"=${companyId} AND role IN ('COMPANY_ADMIN','PLATFORM_ADMIN')
      `;
      if (Number(admins[0]?.count ?? 0) <= 1) return res.status(409).json({ error:"Add another company administrator before removing the last administrator" });
    }
  }

  await prisma.$transaction(async tx => {
    await tx.$executeRaw`UPDATE "Person" SET "isActive"=false,"updatedAt"=NOW() WHERE id=${person.id} AND "companyId"=${companyId}`;
    await tx.$executeRaw`UPDATE "Driver" SET "isActive"=false,"leftDate"=COALESCE("leftDate",NOW()),"updatedAt"=NOW() WHERE id=${person.id} AND "companyId"=${companyId}`;
    if (person.userId) await tx.$executeRaw`DELETE FROM "CompanyMembership" WHERE "userId"=${person.userId} AND "companyId"=${companyId}`;
  });
  if (person.isActive) await writeAuditEvent({
    companyId, actorUserId:req.user!.id, actorEmail:req.user!.email,
    action:"ARCHIVE", entityType:"PERSON", entityId:person.id,
    summary:`Removed ${person.firstName} ${person.lastName} from active staff`,
    metadata:{ revokedUserId:person.userId },
  });
  res.status(204).send();
}));

organisationRouter.get("/audit", managers, asyncHandler(async (req, res) => {
  const limit = Math.min(200,Math.max(1,Number(req.query.limit)||100));
  const rows = await prisma.$queryRaw<AuditRow[]>`SELECT id::text,"companyId","actorUserId","actorEmail",action,"entityType","entityId",summary,metadata,"createdAt" FROM "AuditEvent" WHERE "companyId"=${req.user!.companyId} ORDER BY "createdAt" DESC LIMIT ${limit}`;
  res.json(rows);
}));
