import { MapPinOff } from "lucide-react";
import { AppState, HomeLink } from "@/components/ui/app-state";

export default function NotFound() {
  return <AppState eyebrow="404" title="This page is not on the floor plan" description="The address may have changed, or you may not have a link to this area yet." icon={<MapPinOff size={22} />} action={<HomeLink />} />;
}
