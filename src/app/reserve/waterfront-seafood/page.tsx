import type { Metadata } from "next";
import { PublicBookingFlow } from "@/components/public-booking-flow";

export const metadata: Metadata = {
  title: "Request a Table | Waterfront Seafood & Cocktails",
  description: "Send a dining, VIP Room, or private-event request to Waterfront Seafood & Cocktails in Iloilo City.",
  robots: { index: false, follow: false },
  referrer: "no-referrer",
};

export default function WaterfrontPublicBookingPage() {
  return <PublicBookingFlow />;
}
