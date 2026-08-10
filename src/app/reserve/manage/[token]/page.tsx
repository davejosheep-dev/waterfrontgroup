import type { Metadata } from "next";
import { PublicManageRequest } from "@/components/public-manage-request";

export const metadata: Metadata = {
  title: "Manage Waterfront Request",
  robots: { index: false, follow: false, nocache: true },
  referrer: "no-referrer",
};

export default async function ManageWaterfrontRequestPage({ params }: { params: Promise<{ token: string }> }) {
  const { token } = await params;
  return <PublicManageRequest token={token} />;
}
