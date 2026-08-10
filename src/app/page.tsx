import { ShieldX } from "lucide-react";
import { ReservationWorkspace } from "@/components/reservation-workspace";
import { AppState } from "@/components/ui/app-state";
import { getCurrentAccessContext } from "@/lib/access-context";

export default async function Home() {
  const accessContext = await getCurrentAccessContext();
  if (!accessContext) {
    return <AppState eyebrow="Membership required" title="Access is not assigned" description="Your login is valid, but an active Waterfront role has not been assigned. Ask a Superadmin to add you to a concept." icon={<ShieldX size={22} />} />;
  }
  return <ReservationWorkspace accessContext={accessContext} />;
}
