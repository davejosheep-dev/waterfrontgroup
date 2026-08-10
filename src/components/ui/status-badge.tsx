import { AlertTriangle, CheckCircle2, Clock3, Info, MinusCircle } from "lucide-react";
import { cx } from "@/components/ui/baseline";

type StatusTone = "success" | "warning" | "danger" | "info" | "neutral" | "vip";

const statusTone: Record<string, StatusTone> = {
  confirmed: "success",
  completed: "success",
  verified: "success",
  approved: "success",
  approved_converted: "success",
  active: "success",
  arrived: "info",
  seated: "success",
  submitted: "info",
  submitted_for_verification: "info",
  under_review: "info",
  in_review: "info",
  pending_confirmation: "info",
  sending: "info",
  temporary_hold: "warning",
  pending_deposit: "warning",
  pending: "warning",
  alternative_proposed: "warning",
  more_information_required: "warning",
  partially_refunded: "warning",
  paused: "warning",
  scheduled: "info",
  rejected: "danger",
  declined: "danger",
  failed: "danger",
  conflict: "danger",
  no_show: "danger",
  expired: "danger",
  voided: "neutral",
  cancelled: "neutral",
  draft: "neutral",
  inactive: "neutral",
  refunded: "vip",
  closed_duplicate: "neutral",
  withdrawn_by_guest: "neutral",
  expired_unresolved: "neutral",
};

const toneClass: Record<StatusTone, string> = {
  success: "border-success/20 bg-success-soft text-success",
  warning: "border-warning/20 bg-warning-soft text-warning",
  danger: "border-danger/20 bg-danger-soft text-danger",
  info: "border-info/20 bg-info-soft text-info",
  neutral: "border-neutral/20 bg-neutral-soft text-neutral",
  vip: "border-vip/20 bg-vip-soft text-vip",
};

const toneIcon = {
  success: CheckCircle2,
  warning: Clock3,
  danger: AlertTriangle,
  info: Info,
  neutral: MinusCircle,
  vip: CheckCircle2,
} satisfies Record<StatusTone, typeof CheckCircle2>;

export function StatusBadge({ status, label, className, showIcon = true }: { status: string; label?: string; className?: string; showIcon?: boolean }) {
  const tone = statusTone[status] ?? "neutral";
  const Icon = toneIcon[tone];
  return <span className={cx("inline-flex w-fit items-center gap-1.5 rounded-md border px-2 py-1 text-[11px] font-semibold capitalize leading-none", toneClass[tone], className)}>
    {showIcon ? <Icon size={12} strokeWidth={2} aria-hidden="true" /> : null}
    {label ?? status.replaceAll("_", " ")}
  </span>;
}
