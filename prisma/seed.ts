// prisma/seed.ts
// Seeds houses and one admin account for first-time setup. The admin
// password is generated randomly and printed ONCE - it is never
// hardcoded, never committed, and must be rotated via the portal on
// first login (see deployment checklist item "rotate seed credentials").
//
// NOTE: this script hashes with argon2id DIRECTLY (same parameters as
// lib/auth.ts's ARGON2_OPTS) instead of importing hashPassword() -
// importing lib/auth pulls in next/headers, which only loads inside the
// Next.js server runtime and would break `tsx prisma/seed.ts`.

import { PrismaClient } from "@prisma/client";
import argon2 from "argon2";
import crypto from "node:crypto";

const prisma = new PrismaClient();

// Keep in sync with ARGON2_OPTS in lib/auth.ts.
const ARGON2_OPTS: argon2.Options = {
  type: argon2.argon2id,
  memoryCost: 19456,
  timeCost: 2,
  parallelism: 1,
};

async function main() {
  const houses = [
    { name: "Tiger", colorHex: "#DC2626" }, // red
    { name: "Lion", colorHex: "#EAB308" }, // yellow
    { name: "Leopard", colorHex: "#16A34A" }, // green
    { name: "Panther", colorHex: "#2563EB" }, // blue
  ];

  for (const h of houses) {
    await prisma.house.upsert({ where: { name: h.name }, update: {}, create: h });
  }

  const adminEmail = (process.env.SEED_ADMIN_EMAIL ?? "admin@snseventsportal.example")
    .trim()
    .toLowerCase();
  // Optional env-driven credential (e.g. Vercel project env). When set, every
  // deploy converges the admin account to this password: created on first
  // run, rotated on later runs. Never printed - check deploy logs only for
  // which path was taken, never the secret itself.
  const envPassword = process.env.SEED_ADMIN_PASSWORD ?? "";
  if (envPassword && (envPassword.length < 12 || envPassword.length > 200)) {
    throw new Error("SEED_ADMIN_PASSWORD must be 12-200 characters when set.");
  }
  const existing = await prisma.user.findUnique({ where: { email: adminEmail } });

  if (!existing) {
    if (envPassword) {
      const passwordHash = await argon2.hash(envPassword, ARGON2_OPTS);
      await prisma.user.create({
        data: {
          email: adminEmail,
          name: "Site Administrator",
          passwordHash,
          role: "ADMIN",
        },
      });
      console.log(`Seed admin "${adminEmail}" created with password from SEED_ADMIN_PASSWORD.`);
    } else {
      const tempPassword = crypto.randomBytes(12).toString("base64url");
      const passwordHash = await argon2.hash(tempPassword, ARGON2_OPTS);

      await prisma.user.create({
        data: {
          email: adminEmail,
          name: "Site Administrator",
          passwordHash,
          role: "ADMIN",
        },
      });

      console.log("============================================================");
      console.log(" Seed admin account created:");
      console.log(` Email:    ${adminEmail}`);
      console.log(` Password: ${tempPassword}`);
      console.log(" This password is shown ONLY here. Log in and change it, or");
      console.log(" rotate it via the admin panel, before deploying to students.");
      console.log("============================================================");
    }
  } else if (envPassword) {
    const passwordHash = await argon2.hash(envPassword, ARGON2_OPTS);
    await prisma.user.update({
      where: { email: adminEmail },
      data: {
        passwordHash,
        role: "ADMIN",
        isActive: true,
        failedLogins: 0,
        lockedUntil: null,
      },
    });
    console.log(`Seed admin "${adminEmail}" already exists - password rotated from SEED_ADMIN_PASSWORD.`);
  } else {
    console.log(`Seed admin "${adminEmail}" already exists - skipping.`);
  }
}

main()
  .catch((e) => {
    console.error(e);
    process.exit(1);
  })
  .finally(() => prisma.$disconnect());
