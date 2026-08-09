import { Prisma } from "@prisma/client";
import { Router } from "express";
import { prisma } from "../../lib/prisma.js";
import { asyncHandler } from "../../lib/asyncHandler.js";
import { requireIdentity } from "../../middleware/auth.js";

function slugify(name: string) {
  return name
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-|-$/g, "")
    .slice(0, 50);
}

function cleanString(value: unknown): string {
  return typeof value === "string" ? value.trim() : "";
}

export const onboardingRouter = Router();

onboardingRouter.use(requireIdentity);

onboardingRouter.post(
  "/company",
  asyncHandler(async (req, res) => {
    const companyName = cleanString(req.body?.companyName);

    if (!companyName) {
      return res.status(400).json({
        error: "Company name is required",
      });
    }

    const ownerId = res.locals.identity.id;

    const existing = await prisma.company.findFirst({
      where: { ownerId },
    });

    if (existing) {
      await prisma.companyMembership.upsert({
        where: {
          userId_companyId: {
            userId: ownerId,
            companyId: existing.id,
          },
        },
        update: {
          role: "COMPANY_ADMIN",
        },
        create: {
          userId: ownerId,
          companyId: existing.id,
          role: "COMPANY_ADMIN",
        },
      });

      return res.status(409).json({
        ok: true,
        duplicate: true,
        company: existing,
      });
    }

    const baseSlug = slugify(companyName) || "company";

    let slug = baseSlug;

    for (let suffix = 2; ; suffix += 1) {
      const existingSlug = await prisma.company.findUnique({
        where: { slug },
      });

      if (!existingSlug) {
        break;
      }

      slug = `${baseSlug}-${suffix}`.slice(0, 50);
    }

    const vehicleRegistration = cleanString(
      req.body?.vehicle?.registration
    ).toUpperCase();

    const vehicleType = cleanString(req.body?.vehicle?.type);

    const validVehicleTypes = [
      "TRUCK",
      "VAN",
      "TRAILER",
      "CAR",
      "OTHER",
    ] as const;

    const selectedVehicleType = validVehicleTypes.includes(
      vehicleType as (typeof validVehicleTypes)[number]
    )
      ? (vehicleType as (typeof validVehicleTypes)[number])
      : "TRUCK";

    const result = await prisma.$transaction(
      async (tx: Prisma.TransactionClient) => {
        const company = await tx.company.create({
          data: {
            name: companyName,
            slug,
            vatNumber: "",
            ownerId,
          },
        });

        await tx.companyMembership.create({
          data: {
            userId: ownerId,
            companyId: company.id,
            role: "COMPANY_ADMIN",
          },
        });

        if (vehicleRegistration) {
          await tx.vehicle.create({
            data: {
              companyId: company.id,
              registration: vehicleRegistration,
              type: selectedVehicleType,
              status: "ACTIVE",
            },
          });
        }

        return company;
      }
    );

    return res.status(201).json({
      ok: true,
      company: result,
    });
  })
);