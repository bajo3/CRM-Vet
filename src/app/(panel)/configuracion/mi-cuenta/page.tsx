import { requireSession } from "@/lib/auth/session";
import { getPrisma } from "@/lib/prisma";
import { AccountPanel } from "../account-panel";

export default async function ConfiguracionMiCuentaPage() {
  const session = await requireSession();
  const user = await getPrisma().user.findUnique({ where: { id: session.userId }, select: { licenseNumber: true } });

  return (
    <div className="max-w-2xl">
      <AccountPanel licenseNumber={user?.licenseNumber ?? ""} />
    </div>
  );
}
