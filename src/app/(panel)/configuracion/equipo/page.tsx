import { requireSession } from "@/lib/auth/session";
import { getPrisma } from "@/lib/prisma";
import { TEAM_MANAGE_ROLES } from "@/lib/auth/roles";
import { TeamPanel } from "../team-panel";

export default async function ConfiguracionEquipoPage() {
  const session = await requireSession();
  const members = await getPrisma().clinicMember.findMany({
    where: { clinicId: session.clinicId },
    select: { id: true, userId: true, role: true, active: true, user: { select: { name: true, email: true } } },
    orderBy: [{ active: "desc" }, { role: "asc" }, { user: { name: "asc" } }],
  });

  return <TeamPanel members={members} canManage={TEAM_MANAGE_ROLES.includes(session.role)} currentUserId={session.userId} />;
}
