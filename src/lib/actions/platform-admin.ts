"use server";

import { revalidatePath } from "next/cache";
import { getPrisma } from "../prisma";
import { getSession } from "../auth/session";
import { approveClinicSchema, rejectClinicSchema, type ApproveClinicInput, type RejectClinicInput } from "../validation/platform-admin";
import type { ActionResult } from "./types";

const NOT_AUTHORIZED: ActionResult = { ok: false, message: "No tenés permisos para administrar clínicas." };

async function requireSuperAdminSession() {
  const session = await getSession();
  return session?.superAdmin ? session : null;
}

export type ApproveClinicResult = ActionResult;

/** Aprueba una clínica (o revierte un rechazo anterior). Solo superadmin. */
export async function approveClinic(input: ApproveClinicInput): Promise<ApproveClinicResult> {
  if (!(await requireSuperAdminSession())) return NOT_AUTHORIZED;

  const parsed = approveClinicSchema.safeParse(input);
  if (!parsed.success) return { ok: false, message: "Revisá los datos ingresados." };

  await getPrisma().clinic.update({
    where: { id: parsed.data.clinicId },
    data: { status: "APPROVED", statusReason: null },
  });
  revalidatePath("/admin/clinicas");
  return { ok: true };
}

export type RejectClinicResult = ActionResult;

/** Rechaza una clínica (no la borra: solo marca el estado, para poder revertir con approveClinic). Solo superadmin. */
export async function rejectClinic(input: RejectClinicInput): Promise<RejectClinicResult> {
  if (!(await requireSuperAdminSession())) return NOT_AUTHORIZED;

  const parsed = rejectClinicSchema.safeParse(input);
  if (!parsed.success) return { ok: false, message: "Revisá los datos ingresados." };

  await getPrisma().clinic.update({
    where: { id: parsed.data.clinicId },
    data: { status: "REJECTED", statusReason: parsed.data.reason || null },
  });
  revalidatePath("/admin/clinicas");
  return { ok: true };
}
