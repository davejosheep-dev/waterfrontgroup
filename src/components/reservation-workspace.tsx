"use client";

import Image from "next/image";
import dynamic from "next/dynamic";
import { useEffect, useMemo, useRef, useState, type FormEvent, type PointerEvent as ReactPointerEvent, type ReactNode } from "react";
import {
  Bell, CalendarDays, Check, ChevronDown, ChevronLeft, ChevronRight, CircleDollarSign,
  Clock3, Filter, LayoutDashboard, Menu, MoreHorizontal, Plus, Search, Settings,
  SlidersHorizontal, Sparkles, TableProperties, Users, Utensils, X, ChartNoAxesCombined,
  MapPin, Phone, Mail, ShieldCheck, AlertTriangle, UserRound, CheckCircle2, MessageSquare, Inbox, WalletCards, Megaphone,
  CircleHelp, PanelLeftClose, PanelLeftOpen, Command as CommandIcon,
} from "lucide-react";
import { demoReservations, inquirySources, statusLabel } from "@/lib/demo-data";
import { determineDepositRules, normalizePhilippineMobile, type BookingType, type Reservation } from "@/lib/domain";
import { PublicRequestsWorkspace } from "@/components/public-requests-workspace";
import { PaymentControlAnalyticsPanel, Phase2PolicyPanel, PublicRequestAnalyticsPanel } from "@/components/phase2-operational-panels";
import { PaymentOperationsWorkspace } from "@/components/payment-operations-workspace";
import { CrmWorkspace, MarketingWorkspace } from "@/components/crm-marketing-workspaces";
import { ProfileWorkspace } from "@/components/profile-workspace";
import { PageHeader } from "@/components/ui/baseline";
import { StatusBadge } from "@/components/ui/status-badge";
import { canAccessScreen, hasPermission, initials, roleDetails, type AccessContext, type AppScreen } from "@/lib/access-control";

const TeamAccessWorkspace = dynamic(() => import("@/components/team-access-workspace").then((module) => module.TeamAccessWorkspace), { ssr: false });

type Screen = AppScreen;
type Modal = "new" | "availability" | null;
type NavGroupId = "operations" | "guests" | "finance" | "marketing" | "insights" | "administration";
type NavItem = { id: Exclude<Screen, "profile">; label: string; icon: typeof LayoutDashboard; count?: number; group: NavGroupId };

const nav: NavItem[] = [
  { id: "today", label: "Today", icon: LayoutDashboard, group: "operations" },
  { id: "requests", label: "Public Requests", icon: Inbox, count: 1, group: "operations" },
  { id: "floor", label: "Floor plan", icon: TableProperties, group: "operations" },
  { id: "calendar", label: "Calendar", icon: CalendarDays, group: "operations" },
  { id: "guests", label: "Guest directory", icon: Users, group: "guests" },
  { id: "payments", label: "Payments", icon: WalletCards, count: 2, group: "finance" },
  { id: "marketing", label: "Marketing", icon: Megaphone, group: "marketing" },
  { id: "reports", label: "Reports", icon: ChartNoAxesCombined, group: "insights" },
  { id: "settings", label: "Configuration", icon: Settings, group: "administration" },
  { id: "team", label: "Team access", icon: ShieldCheck, group: "administration" },
];

const navGroups: Array<{ id: NavGroupId; label: string }> = [
  { id: "operations", label: "Operations" },
  { id: "guests", label: "Guests" },
  { id: "finance", label: "Finance" },
  { id: "marketing", label: "Marketing" },
  { id: "insights", label: "Insights" },
  { id: "administration", label: "Administration" },
];

const depositStyles: Record<string, string> = {
  paid: "text-emerald-700", pending: "text-amber-700", partially_paid: "text-blue-700",
  waived: "text-slate-600", not_required: "text-slate-400",
};

function cx(...classes: Array<string | false | null | undefined>) {
  return classes.filter(Boolean).join(" ");
}

function Button({ children, variant = "primary", className, type = "button", onClick, disabled }: {
  children: ReactNode; variant?: "primary" | "secondary" | "ghost" | "outline"; className?: string;
  type?: "button" | "submit"; onClick?: () => void; disabled?: boolean;
}) {
  const styles = {
    primary: "border border-transparent bg-primary text-primary-foreground hover:bg-primary-strong",
    secondary: "border border-transparent bg-secondary-foreground text-white hover:bg-foreground",
    ghost: "border border-transparent text-muted-foreground hover:bg-secondary hover:text-foreground",
    outline: "border border-border bg-card text-secondary-foreground hover:bg-secondary",
  };
  return <button type={type} disabled={disabled} onClick={onClick} className={cx("inline-flex min-h-10 items-center justify-center gap-2 rounded-md px-4 text-sm font-semibold transition disabled:pointer-events-none disabled:opacity-50", styles[variant], className)}>{children}</button>;
}

function Pill({ status }: { status: string }) {
  return <StatusBadge status={status} label={statusLabel[status]} />;
}

export function ReservationWorkspace({ accessContext }: { accessContext: AccessContext }) {
  const [screen, setScreen] = useState<Screen>("today");
  const [modal, setModal] = useState<Modal>(null);
  const [mobileNav, setMobileNav] = useState(false);
  const [sidebarCollapsed, setSidebarCollapsed] = useState(false);
  const [commandOpen, setCommandOpen] = useState(false);
  const [commandQuery, setCommandQuery] = useState("");
  const [reservations, setReservations] = useState(demoReservations);
  const [selected, setSelected] = useState<Reservation | null>(null);
  const [toast, setToast] = useState<string | null>(null);
  const venueOptions = accessContext.accessibleConcepts?.length
    ? accessContext.accessibleConcepts
    : [{ id: accessContext.conceptId ?? "current", name: accessContext.conceptName, timezone: "Asia/Manila" }];
  const [currentVenueId, setCurrentVenueId] = useState(accessContext.conceptId ?? venueOptions[0]?.id ?? "current");
  const currentVenue = venueOptions.find((venue) => venue.id === currentVenueId) ?? venueOptions[0];
  const visibleNav = nav.filter((item) => canAccessScreen(accessContext.role, item.id));
  const groupedNav = navGroups.map((group) => ({
    ...group,
    items: visibleNav.filter((item) => item.group === group.id),
  }));
  const currentScreenLabel = screen === "profile" ? "Profile & security" : screen === "notifications" ? "Notifications" : nav.find((item) => item.id === screen)?.label ?? "Waterfront operations";
  const normalizedCommandQuery = commandQuery.trim().toLowerCase();
  const commandNavigation = visibleNav.filter((item) => !normalizedCommandQuery || item.label.toLowerCase().includes(normalizedCommandQuery));
  const commandReservations = reservations.filter((reservation) => {
    if (!normalizedCommandQuery) return true;
    return [reservation.guestName, reservation.code, reservation.mobile, reservation.area].some((value) => value?.toLowerCase().includes(normalizedCommandQuery));
  });
  const showProfileCommand = !normalizedCommandQuery || ["profile", "security", "account", accessContext.fullName].some((value) => value.toLowerCase().includes(normalizedCommandQuery));
  const canOperate = hasPermission(accessContext.role, "operate_reservations");
  const canConfigure = hasPermission(accessContext.role, "manage_configuration");

  useEffect(() => {
    const frame = window.requestAnimationFrame(() => {
      setSidebarCollapsed(window.localStorage.getItem("wf-sidebar-collapsed") === "true");
    });
    function onKeyDown(event: KeyboardEvent) {
      if ((event.metaKey || event.ctrlKey) && event.key.toLowerCase() === "k") {
        event.preventDefault();
        setCommandOpen((open) => !open);
      }
      if (event.key === "Escape") setCommandOpen(false);
    }
    window.addEventListener("keydown", onKeyDown);
    return () => {
      window.cancelAnimationFrame(frame);
      window.removeEventListener("keydown", onKeyDown);
    };
  }, []);

  function openScreen(nextScreen: Screen) {
    setScreen(nextScreen);
    setCommandOpen(false);
    setCommandQuery("");
    setMobileNav(false);
    const behavior = window.matchMedia("(prefers-reduced-motion: reduce)").matches ? "auto" : "smooth";
    window.scrollTo({ top: 0, behavior });
  }

  function toggleSidebar() {
    setSidebarCollapsed((collapsed) => {
      const next = !collapsed;
      window.localStorage.setItem("wf-sidebar-collapsed", String(next));
      return next;
    });
  }

  function notify(message: string) {
    setToast(message);
    window.setTimeout(() => setToast(null), 3200);
  }

  return <div className="min-h-screen bg-background text-foreground">
    <aside className={cx("fixed bottom-0 left-0 top-0 z-40 w-[280px] border-r border-border bg-card transition-[width,transform] duration-200 lg:translate-x-0", sidebarCollapsed ? "lg:w-[72px]" : "lg:w-[248px]", mobileNav ? "translate-x-0" : "-translate-x-full")}>
      <div className="flex h-full flex-col">
        <div className={cx("flex h-[76px] items-center border-b border-border px-4", sidebarCollapsed ? "lg:justify-center" : "justify-between")}>
          <Image src="/waterfront-logo.png" alt="Waterfront Seafood & Cocktails" width={150} height={95} priority className={cx("h-auto w-[132px]", sidebarCollapsed && "lg:hidden")} />
          <span aria-hidden="true" className={cx("hidden h-9 w-9 items-center justify-center rounded-lg bg-primary text-base font-semibold text-primary-foreground", sidebarCollapsed && "lg:flex")}>W</span>
          <button aria-label="Close navigation" onClick={() => setMobileNav(false)} className="rounded-md p-2 text-muted-foreground hover:bg-secondary lg:hidden"><X size={18} /></button>
        </div>
        <div className="px-3 py-3">
          <div title={sidebarCollapsed ? currentVenue?.name : undefined} className={cx("relative flex min-h-10 w-full items-center rounded-md border border-border bg-card text-left", sidebarCollapsed ? "lg:justify-center lg:px-0" : "justify-between px-3")}>
            <MapPin size={16} className={cx("shrink-0 text-primary", !sidebarCollapsed && "hidden")} />
            <label className={cx("min-w-0 flex-1", sidebarCollapsed && "lg:sr-only")}><span className="block text-[10px] font-medium text-muted-foreground">Current venue</span><select aria-label="Switch venue" value={currentVenueId} onChange={(event) => { setCurrentVenueId(event.target.value); notify(`Venue context changed to ${venueOptions.find((venue) => venue.id === event.target.value)?.name ?? "the selected venue"}.`); }} className="block w-full appearance-none truncate bg-transparent pr-5 text-xs font-semibold text-foreground outline-none">{venueOptions.map((venue) => <option key={venue.id} value={venue.id}>{venue.name}</option>)}</select></label><ChevronDown size={14} className={cx("pointer-events-none text-muted-foreground", sidebarCollapsed && "lg:hidden")} />
          </div>
        </div>
        <nav className="min-h-0 flex-1 space-y-3 overflow-y-auto px-3 pb-3 scrollbar-thin" aria-label="Main navigation">
          {groupedNav.map((group) => group.items.length > 0 && <div key={group.id} className="space-y-1">
            <div className={cx("px-3 pb-1 pt-1 text-[10px] font-medium uppercase tracking-[.06em] text-muted-foreground", sidebarCollapsed && "lg:sr-only")}>{group.label}</div>
            {group.items.map((item) => <button key={item.id} aria-label={item.id === "guests" ? "Guests" : undefined} title={sidebarCollapsed ? item.label : undefined} aria-current={screen === item.id ? "page" : undefined} onClick={() => openScreen(item.id)} className={cx("group relative flex h-10 w-full items-center gap-3 rounded-md px-3 text-sm font-medium transition", sidebarCollapsed && "lg:justify-center lg:px-0", screen === item.id ? "bg-primary-soft text-primary-strong before:absolute before:left-0 before:h-5 before:w-0.5 before:rounded-r before:bg-primary" : "text-muted-foreground hover:bg-secondary hover:text-foreground")}>
              <item.icon size={17} strokeWidth={screen === item.id ? 2.2 : 1.8} /><span className={cx("flex-1 text-left", sidebarCollapsed && "lg:sr-only")}>{item.label}</span>{item.count ? <span className={cx("rounded-md bg-accent-soft px-1.5 py-0.5 text-[10px] font-semibold text-accent-strong", sidebarCollapsed && "lg:absolute lg:right-0 lg:top-0 lg:px-1")}>{item.count}</span> : null}
            </button>)}
          </div>)}
        </nav>
        <div className="border-t border-border px-3 pb-3 pt-2">
          <div className={cx("px-2 pb-1.5 text-[10px] font-medium uppercase tracking-[.06em] text-muted-foreground", sidebarCollapsed && "lg:sr-only")}>Operator console</div>
          <button aria-label="Open profile" title={sidebarCollapsed ? "Profile & security" : undefined} onClick={() => openScreen("profile")} className={cx("flex min-h-11 w-full items-center gap-3 rounded-md border border-transparent p-2 text-left transition hover:bg-secondary", sidebarCollapsed && "lg:justify-center")}>
            <div className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-accent text-xs font-semibold text-accent-foreground">{initials(accessContext.fullName)}</div>
            <div className={cx("min-w-0 flex-1", sidebarCollapsed && "lg:sr-only")}><div className="truncate text-xs font-semibold text-foreground">{accessContext.fullName}</div><div className="truncate text-[11px] text-muted-foreground">{roleDetails[accessContext.role].label} · {accessContext.conceptName}</div></div><MoreHorizontal size={16} className={cx("text-muted-foreground", sidebarCollapsed && "lg:hidden")} />
          </button>
          <button aria-label={sidebarCollapsed ? "Expand navigation" : "Collapse navigation"} onClick={toggleSidebar} className="mt-1 hidden h-9 w-full items-center justify-center gap-2 rounded-md text-xs font-medium text-muted-foreground hover:bg-secondary hover:text-foreground lg:flex">{sidebarCollapsed ? <PanelLeftOpen size={16} /> : <><PanelLeftClose size={16} /><span>Collapse</span></>}</button>
        </div>
      </div>
    </aside>

    <div className={cx("transition-[padding] duration-200", sidebarCollapsed ? "lg:pl-[72px]" : "lg:pl-[248px]")}>
      <header className="sticky top-0 z-30 flex h-[60px] items-center gap-3 border-b border-border bg-background/95 px-4 backdrop-blur md:px-6">
        <div className="flex min-w-0 items-center gap-3"><button aria-label="Open navigation" onClick={() => setMobileNav(true)} className="rounded-md border border-border bg-card p-2.5 lg:hidden"><Menu size={18} /></button><div className="hidden min-w-0 items-center gap-2 text-xs text-muted-foreground sm:flex"><span className="truncate">{currentVenue?.name}</span><ChevronRight size={13} /><span className="truncate font-medium text-foreground">{currentScreenLabel}</span></div></div>
        <button aria-label="Open global search" onClick={() => setCommandOpen(true)} className="mx-auto flex h-10 min-w-10 max-w-lg flex-1 items-center gap-2 rounded-md border border-border bg-card px-3 text-left text-sm text-muted-foreground hover:bg-secondary"><Search size={16} /><span className="hidden flex-1 sm:inline">Search guests, reservations, and settings</span><kbd className="hidden rounded border border-border bg-secondary px-1.5 py-0.5 text-[10px] font-medium md:inline">⌘K</kbd></button>
        <div className="flex shrink-0 items-center gap-1.5">
          <span className="mr-1 hidden rounded-md border border-border bg-card px-2 py-1 text-[10px] font-medium text-muted-foreground xl:inline">{accessContext.isDemo ? "Demo data" : "Secure"} · {currentVenue?.timezone}</span>
          <button aria-label="Help" title="Help" className="hidden rounded-md p-2.5 text-muted-foreground hover:bg-secondary hover:text-foreground md:inline-flex"><CircleHelp size={18} /></button>
          <button aria-label="Notifications" onClick={() => openScreen("notifications")} className="relative rounded-md p-2.5 text-muted-foreground hover:bg-secondary hover:text-foreground"><Bell size={18} /><span className="absolute right-2 top-2 h-2 w-2 rounded-full border-2 border-background bg-accent" /></button>
          {canOperate && <Button variant="outline" className="hidden sm:inline-flex" onClick={() => setModal("availability")}><Search size={16} />Check availability</Button>}
          {canOperate && <Button onClick={() => setModal("new")}><Plus size={17} /><span className="hidden sm:inline">New reservation</span><span className="sr-only sm:hidden">New reservation</span></Button>}
        </div>
      </header>

      <main className="min-h-[calc(100vh-60px)]">
        {screen === "today" && <TodayScreen reservations={reservations} onSelect={setSelected} onNew={() => setModal("new")} onAvailability={() => setModal("availability")} />}
        {screen === "requests" && <PublicRequestsWorkspace onConverted={(reservation) => setReservations((previous) => [...previous, reservation])} notify={notify} />}
        {screen === "payments" && <PaymentOperationsWorkspace notify={notify} />}
        {screen === "floor" && <FloorPlanScreen reservations={reservations} onSelect={setSelected} notify={notify} canConfigure={canConfigure} canOperate={canOperate} />}
        {screen === "calendar" && <CalendarScreen reservations={reservations} onSelect={setSelected} />}
        {screen === "guests" && <CrmWorkspace notify={notify} />}
        {screen === "marketing" && <MarketingWorkspace notify={notify} />}
        {screen === "notifications" && <NotificationsScreen onSelect={() => setSelected(reservations[1])} notify={notify} />}
        {screen === "reports" && <><ReportsScreen reservations={reservations} /><PaymentControlAnalyticsPanel /><PublicRequestAnalyticsPanel /></>}
        {screen === "settings" && <><SettingsScreen notify={notify} /><Phase2PolicyPanel notify={notify} /></>}
        {screen === "team" && <TeamAccessWorkspace actor={accessContext} notify={notify} />}
        {screen === "profile" && <ProfileWorkspace accessContext={accessContext} />}
      </main>
    </div>

    {mobileNav && <button aria-label="Close navigation overlay" className="fixed inset-0 z-30 bg-black/25 lg:hidden" onClick={() => setMobileNav(false)} />}
    {commandOpen && <div className="fixed inset-0 z-[90] flex items-start justify-center px-4 pt-[10vh] sm:pt-[14vh]"><button aria-label="Close global search" className="absolute inset-0 bg-foreground/25 backdrop-blur-[2px]" onClick={() => setCommandOpen(false)} /><section role="dialog" aria-modal="true" aria-label="Global search" className="relative w-full max-w-2xl overflow-hidden rounded-lg border border-border bg-popover shadow-2xl"><div className="flex items-center gap-3 border-b border-border px-4"><Search size={18} className="text-muted-foreground" /><input autoFocus aria-label="Global search" value={commandQuery} onChange={(event) => setCommandQuery(event.target.value)} placeholder="Search guest, reservation code, mobile, or workspace…" className="h-14 min-w-0 flex-1 bg-transparent text-sm outline-none placeholder:text-muted-foreground" /><button aria-label="Close" onClick={() => setCommandOpen(false)} className="rounded-md p-2 text-muted-foreground hover:bg-secondary"><X size={17} /></button></div><div className="max-h-[55vh] overflow-y-auto p-2 scrollbar-thin">
      {commandNavigation.length > 0 ? <div><div className="px-2 py-2 text-[11px] font-medium text-muted-foreground">Workspace</div>{commandNavigation.map((item) => <button key={item.id} onClick={() => openScreen(item.id)} className="flex min-h-11 w-full items-center gap-3 rounded-md px-3 text-left text-sm hover:bg-secondary"><item.icon size={16} className="text-primary" /><span className="flex-1">{item.label}</span><span className="text-xs text-muted-foreground">Open</span></button>)}</div> : null}
      {commandReservations.length > 0 ? <div className="mt-1 border-t border-border pt-1"><div className="px-2 py-2 text-[11px] font-medium text-muted-foreground">Reservations</div>{commandReservations.slice(0, 6).map((reservation) => <button key={reservation.id} onClick={() => { setSelected(reservation); openScreen("today"); }} className="flex min-h-12 w-full items-center gap-3 rounded-md px-3 text-left hover:bg-secondary"><CalendarDays size={16} className="text-primary" /><span className="min-w-0 flex-1"><span className="block truncate text-sm font-medium">{reservation.guestName}</span><span className="block truncate text-xs text-muted-foreground">{reservation.code} · {formatTime(reservation.start)} · {reservation.guestCount} guests</span></span></button>)}</div> : null}
      {showProfileCommand ? <div className="mt-1 border-t border-border pt-1"><button onClick={() => openScreen("profile")} className="flex min-h-11 w-full items-center gap-3 rounded-md px-3 text-left text-sm hover:bg-secondary"><UserRound size={16} className="text-primary" /><span className="flex-1">Profile & security</span></button></div> : null}
      {commandNavigation.length === 0 && commandReservations.length === 0 && !showProfileCommand ? <div className="px-4 py-10 text-center"><CommandIcon size={24} className="mx-auto text-muted-foreground" /><p className="mt-3 text-sm font-medium">No matching results</p><p className="mt-1 text-xs text-muted-foreground">Try a guest name, reservation code, mobile number, or workspace.</p></div> : null}
    </div><div className="flex items-center justify-between border-t border-border bg-secondary/60 px-4 py-2 text-[11px] text-muted-foreground"><span>Results respect your role and outlet access.</span><span>Esc to close</span></div></section></div>}
    {modal === "new" && <NewReservationModal onClose={() => setModal(null)} onCreate={(reservation) => { setReservations((prev) => [...prev, reservation]); setModal(null); notify(`${reservation.code} created and inventory rechecked.`); }} />}
    {modal === "availability" && <AvailabilityModal reservations={reservations} onClose={() => setModal(null)} onContinue={() => setModal("new")} />}
    {selected && <ReservationDrawer reservation={selected} canOperate={canOperate} onClose={() => setSelected(null)} onUpdate={(next) => { if (selected.status === "pending_deposit" && next.status === "confirmed" && !["paid", "waived"].includes(selected.deposit)) { notify("Confirmation blocked: the required deposit must be independently verified first."); return; } setReservations((prev) => prev.map((r) => r.id === next.id ? next : r)); setSelected(next); notify(`${next.code} updated.`); }} />}
    {toast && <div role="status" className="fixed bottom-5 right-5 z-[80] flex max-w-sm items-center gap-3 rounded-lg bg-primary px-4 py-3 text-sm font-medium text-primary-foreground shadow-lg"><CheckCircle2 size={18} />{toast}</div>}
  </div>;
}

type FloorTableState = "available" | "reserved" | "seated" | "hold" | "cleaning";
type FloorTableKind = "T1" | "T2" | "T3";
type FloorTable = {
  id: string; label: string; seats: number; x: number; y: number; width: number; height: number;
  kind: FloorTableKind; rotation: number; state: FloorTableState; guest?: string; time?: string; reservationId?: string;
};
type TableCombination = { id: string; name: string; tableIds: string[]; capacity: number };

const tableKindConfig: Record<FloorTableKind, { seats: number; width: number; height: number; description: string }> = {
  T1: { seats: 2, width: 6.5, height: 9, description: "70 × 80 · tulip stand" },
  T2: { seats: 4, width: 8, height: 13, description: "80 × 120 · normal stand" },
  T3: { seats: 4, width: 7.5, height: 10, description: "80 × 80 · tulip stand" },
};

function createReferenceTables(): FloorTable[] {
  const definitions: Array<[FloorTableKind, number, number, number]> = [
    ["T1", 11, 16, 0], ["T1", 22, 16, 0], ["T1", 33, 16, 0], ["T1", 43, 16, 0],
    ["T1", 19, 33, 0], ["T1", 29, 33, 0], ["T1", 19, 50, 0], ["T1", 29, 50, 0], ["T1", 43, 39, 90],
    ["T2", 11, 32, 0], ["T2", 11, 48, 0], ["T2", 11, 65, 0], ["T2", 35, 32, 0], ["T2", 35, 48, 0], ["T2", 35, 65, 0],
    ["T2", 51, 25, 0], ["T2", 62, 25, 0], ["T2", 51, 44, 0], ["T2", 62, 44, 0], ["T2", 51, 64, 0], ["T2", 62, 64, 0],
    ["T2", 75, 55, 90], ["T2", 84, 55, 90], ["T2", 92, 55, 90], ["T2", 75, 76, 0], ["T2", 84, 76, 0], ["T2", 93, 76, 0],
    ["T3", 74, 20, 45], ["T3", 85, 20, 45], ["T3", 74, 36, 45], ["T3", 85, 36, 45],
  ];
  const counts: Record<FloorTableKind, number> = { T1: 0, T2: 0, T3: 0 };
  return definitions.map(([kind, x, y, rotation], index) => {
    counts[kind] += 1;
    const config = tableKindConfig[kind];
    const reservation = index < 5 ? ["1", "2", "4", "5", undefined][index] : undefined;
    const guests = index < 5 ? ["C. Santos", "A. Lim", "L. Robles", "G. Ong", undefined][index] : undefined;
    const times = index < 5 ? ["11:30", "13:00", "18:30", "19:30", undefined][index] : undefined;
    return { id: `${kind}-${String(counts[kind]).padStart(2, "0")}`, label: `${kind}-${counts[kind]}`, kind, seats: config.seats, x, y, width: config.width, height: config.height, rotation, state: index === 6 ? "seated" : index === 10 ? "cleaning" : reservation ? "reserved" : "available", guest: guests, time: times, reservationId: reservation };
  });
}

const waterfrontReferenceTables = createReferenceTables();
const initialCombinations: TableCombination[] = [{ id: "combo-1", name: "T1-5 + T1-6", tableIds: ["T1-05", "T1-06"], capacity: 4 }];

const floorStateStyle: Record<FloorTableState, string> = {
  available: "border-white/25 bg-[var(--primary-soft)] text-[#273a37] shadow-[0_5px_0_#aab8b4]",
  reserved: "border-[#8ed7c5] bg-[var(--primary)] text-white shadow-[0_5px_0_#165b4d]",
  seated: "border-[#ffc77c] bg-[var(--primary)] text-white shadow-[0_5px_0_#a65200]",
  hold: "border-[#d3b9ef] bg-[#8763ad] text-white shadow-[0_5px_0_#5e3e82]",
  cleaning: "border-[#9aa7ad] bg-[#58666e] text-white shadow-[0_5px_0_#39454b]",
};

function FloorPlanScreen({ reservations, onSelect, notify, canConfigure, canOperate }: { reservations: Reservation[]; onSelect: (r: Reservation) => void; notify: (message: string) => void; canConfigure: boolean; canOperate: boolean }) {
  const [layoutTables, setLayoutTables] = useState<FloorTable[]>(waterfrontReferenceTables);
  const [combinations, setCombinations] = useState<TableCombination[]>(initialCombinations);
  const [selectedTable, setSelectedTable] = useState<FloorTable | null>(waterfrontReferenceTables[0]);
  const [isEditing, setIsEditing] = useState(false);
  const [mergeMode, setMergeMode] = useState(false);
  const [selectedIds, setSelectedIds] = useState<string[]>([]);
  const [queueFilter, setQueueFilter] = useState<"all" | "arriving" | "seated">("all");
  const [query, setQuery] = useState("");
  const canvasRef = useRef<HTMLDivElement>(null);
  const dragRef = useRef<{ pointerId: number; startX: number; startY: number; origins: Array<{ id: string; x: number; y: number }> } | null>(null);

  useEffect(() => {
    const timer = window.setTimeout(() => {
      try {
        const saved = window.localStorage.getItem("waterfront-floor-layout-v1");
        if (saved) {
          const parsed = JSON.parse(saved) as { tables?: FloorTable[]; combinations?: TableCombination[] };
          if (parsed.tables?.length) setLayoutTables(parsed.tables);
          if (parsed.combinations) setCombinations(parsed.combinations);
        }
      } catch { /* A malformed local demo layout falls back to the supplied Waterfront reference. */ }
    }, 0);
    return () => window.clearTimeout(timer);
  }, []);

  const queue = reservations.filter((r) => r.guestName.toLowerCase().includes(query.toLowerCase())).filter((r) => queueFilter === "all" || (queueFilter === "seated" ? r.status === "seated" : r.status !== "seated"));
  const selectedReservation = selectedTable?.reservationId ? reservations.find((r) => r.id === selectedTable.reservationId) : undefined;
  const occupiedCovers = layoutTables.filter((t) => t.state === "seated").reduce((sum, t) => sum + t.seats, 0);
  const reservedCovers = layoutTables.filter((t) => ["reserved", "hold"].includes(t.state)).reduce((sum, t) => sum + t.seats, 0);
  const combinationBounds = useMemo(() => combinations.map((combination) => {
    const members = layoutTables.filter((table) => combination.tableIds.includes(table.id));
    const left = Math.min(...members.map((table) => table.x));
    const top = Math.min(...members.map((table) => table.y));
    const right = Math.max(...members.map((table) => table.x + table.width));
    const bottom = Math.max(...members.map((table) => table.y + table.height));
    return { ...combination, left, top, width: right - left, height: bottom - top };
  }).filter((combination) => Number.isFinite(combination.left)), [combinations, layoutTables]);

  function handleTablePointerDown(event: ReactPointerEvent<HTMLButtonElement>, table: FloorTable) {
    if (!isEditing || mergeMode) return;
    event.preventDefault();
    event.currentTarget.setPointerCapture(event.pointerId);
    const combination = combinations.find((item) => item.tableIds.includes(table.id));
    const dragIds = combination?.tableIds ?? [table.id];
    setSelectedIds(dragIds);
    setSelectedTable(table);
    dragRef.current = { pointerId: event.pointerId, startX: event.clientX, startY: event.clientY, origins: layoutTables.filter((item) => dragIds.includes(item.id)).map((item) => ({ id: item.id, x: item.x, y: item.y })) };
  }

  function handleCanvasPointerMove(event: ReactPointerEvent<HTMLDivElement>) {
    const drag = dragRef.current;
    const bounds = canvasRef.current?.getBoundingClientRect();
    if (!drag || !bounds || event.pointerId !== drag.pointerId) return;
    const deltaX = ((event.clientX - drag.startX) / bounds.width) * 100;
    const deltaY = ((event.clientY - drag.startY) / bounds.height) * 100;
    setLayoutTables((tables) => tables.map((table) => {
      const origin = drag.origins.find((item) => item.id === table.id);
      if (!origin) return table;
      return { ...table, x: Math.max(1, Math.min(98 - table.width, origin.x + deltaX)), y: Math.max(5, Math.min(88 - table.height, origin.y + deltaY)) };
    }));
  }

  function handleCanvasPointerUp(event: ReactPointerEvent<HTMLDivElement>) {
    if (dragRef.current?.pointerId === event.pointerId) dragRef.current = null;
  }

  function handleTableClick(table: FloorTable) {
    if (isEditing && mergeMode) {
      setSelectedIds((ids) => ids.includes(table.id) ? ids.filter((id) => id !== table.id) : [...ids, table.id]);
      return;
    }
    setSelectedTable(table);
  }

  function addTable(kind: FloorTableKind) {
    const config = tableKindConfig[kind];
    const sequence = layoutTables.filter((table) => table.kind === kind).length + 1;
    const table: FloorTable = { id: `${kind}-${String(sequence).padStart(2, "0")}-${crypto.randomUUID()}`, label: `${kind}-${sequence}`, kind, seats: config.seats, x: 45, y: 42, width: config.width, height: config.height, rotation: 0, state: "available" };
    setLayoutTables((tables) => [...tables, table]);
    setSelectedTable(table);
    setSelectedIds([table.id]);
    notify(`${table.label} added. Drag it into position.`);
  }

  function createCombination() {
    if (selectedIds.length < 2) return notify("Select at least two tables to create a combination.");
    const alreadyCombined = selectedIds.some((id) => combinations.some((combination) => combination.tableIds.includes(id)));
    if (alreadyCombined) return notify("Remove the existing combination before merging those tables again.");
    const members = layoutTables.filter((table) => selectedIds.includes(table.id));
    const combination: TableCombination = { id: `combo-${crypto.randomUUID()}`, name: members.map((table) => table.label).join(" + "), tableIds: selectedIds, capacity: members.reduce((sum, table) => sum + table.seats, 0) };
    setCombinations((items) => [...items, combination]);
    setMergeMode(false);
    notify(`${combination.name} created as a ${combination.capacity}-seat combination.`);
  }

  function removeCombination(combination: TableCombination) {
    setCombinations((items) => items.filter((item) => item.id !== combination.id));
    setSelectedIds([]);
    notify(`${combination.name} separated into individual tables.`);
  }

  function saveLayout() {
    window.localStorage.setItem("waterfront-floor-layout-v1", JSON.stringify({ tables: layoutTables, combinations }));
    notify("Floor layout and table combinations saved locally for this demo.");
  }

  function resetLayout() {
    setLayoutTables(waterfrontReferenceTables);
    setCombinations(initialCombinations);
    setSelectedIds([]);
    window.localStorage.removeItem("waterfront-floor-layout-v1");
    notify("Waterfront reference layout restored.");
  }

  function rotateSelection() {
    const ids = selectedIds.length ? selectedIds : selectedTable ? [selectedTable.id] : [];
    if (!ids.length) return notify("Select a table to rotate.");
    setLayoutTables((tables) => tables.map((table) => ids.includes(table.id) ? { ...table, rotation: (table.rotation + 45) % 360 } : table));
    if (selectedTable && ids.includes(selectedTable.id)) setSelectedTable({ ...selectedTable, rotation: (selectedTable.rotation + 45) % 360 });
    notify(`${ids.length > 1 ? "Selected tables" : selectedTable?.label} rotated 45°.`);
  }

  function removeSelectedTable() {
    if (!selectedTable) return notify("Select a table to remove.");
    if (selectedTable.state !== "available" || selectedTable.reservationId) return notify("A table with an active booking cannot be removed.");
    if (combinations.some((combination) => combination.tableIds.includes(selectedTable.id))) return notify("Separate this table combination before removing a member.");
    setLayoutTables((tables) => tables.filter((table) => table.id !== selectedTable.id));
    setSelectedIds([]);
    setSelectedTable(null);
    notify(`${selectedTable.label} removed from the draft layout.`);
  }

  return <div className="animate-rise px-4 py-5 md:px-6">
    <div className="mb-4 flex flex-col gap-4 xl:flex-row xl:items-center xl:justify-between">
      <div><div className="text-[10px] font-bold uppercase tracking-[.16em] text-[var(--accent-strong)]">Live restaurant management</div><h1 className="font-display mt-1 text-3xl text-[var(--foreground)]">Main Dining floor</h1></div>
      <div className="flex flex-wrap items-center gap-2">
        <div className="flex h-10 items-center rounded-lg border border-[var(--input)] bg-card p-1 shadow-sm"><button aria-label="Previous day" className="rounded-lg p-2 text-[var(--muted-foreground)]"><ChevronLeft size={15} /></button><button className="px-3 text-xs font-bold text-[#3c4e4a]">Fri, 07 Aug</button><button aria-label="Next day" className="rounded-lg p-2 text-[var(--muted-foreground)]"><ChevronRight size={15} /></button></div>
        <div className="flex h-10 items-center rounded-lg border border-[var(--input)] bg-card p-1 shadow-sm"><button className="rounded-lg px-3 py-1.5 text-xs font-semibold text-[#73807d]">Lunch</button><button className="rounded-lg bg-[var(--primary-strong)] px-3 py-1.5 text-xs font-bold text-white">Dinner</button></div>
        {isEditing ? <><Button variant="outline" onClick={() => { setIsEditing(false); setMergeMode(false); setSelectedIds([]); }}>Exit editor</Button><Button onClick={saveLayout}><Check size={16} />Save layout</Button></> : <>{canConfigure && <Button variant="outline" onClick={() => setIsEditing(true)}><TableProperties size={16} />Edit layout</Button>}<Button onClick={() => notify("Floor plan refreshed from live inventory.")}><Sparkles size={16} />Sync floor</Button></>}
      </div>
    </div>

    <div className="grid min-h-[720px] overflow-hidden rounded-lg border border-[#dbe0db] bg-card shadow-soft lg:grid-cols-[300px_1fr]">
      <aside className="border-b border-[var(--border)] bg-[#fbfaf6] lg:border-b-0 lg:border-r">
        {isEditing && <div className="flex h-full flex-col">
          <div className="border-b border-[var(--border)] p-4"><div className="flex items-start justify-between"><div><div className="text-[9px] font-bold uppercase tracking-[.14em] text-[var(--accent-strong)]">Configuration mode</div><h2 className="font-display mt-1 text-xl text-[#243c39]">Floor setup</h2></div><span className="rounded-full bg-emerald-100 px-2 py-1 text-[9px] font-bold uppercase text-emerald-700">Draft</span></div><p className="mt-2 text-[11px] leading-5 text-[var(--muted-foreground)]">Seeded from Waterfront’s supplied plan: 9 T1, 18 T2 and 4 T3 tables. Drag changes stay in this demo until saved.</p></div>
          <div className="flex-1 overflow-y-auto p-4 scrollbar-thin">
            <EditorLabel>Editing tool</EditorLabel>
            <div className="grid grid-cols-2 rounded-lg bg-[var(--secondary)] p-1"><button onClick={() => { setMergeMode(false); setSelectedIds([]); }} className={cx("rounded-lg px-3 py-2 text-[10px] font-bold uppercase tracking-wide", !mergeMode ? "bg-card text-[#24554b] shadow-sm" : "text-[var(--muted-foreground)]")}>Move tables</button><button onClick={() => { setMergeMode(true); setSelectedIds([]); }} className={cx("rounded-lg px-3 py-2 text-[10px] font-bold uppercase tracking-wide", mergeMode ? "bg-card text-[#8a5b13] shadow-sm" : "text-[var(--muted-foreground)]")}>Merge tables</button></div>
            <div className="mt-3 rounded-lg border border-[var(--border)] bg-card p-3 text-[10px] leading-5 text-[var(--muted-foreground)]">{mergeMode ? "Tap two or more tables, then create a combination. Existing combinations move together." : "Drag any table. Tables in a combination move as one group."}</div>
            {!mergeMode && selectedTable && <div className="mt-3 rounded-lg border border-[var(--border)] bg-card p-3"><div className="flex items-center justify-between"><span className="text-[10px] font-bold text-[var(--secondary-foreground)]">{selectedTable.label} selected</span><span className="text-[9px] text-[var(--muted-foreground)]">{selectedTable.rotation}°</span></div><div className="mt-3 grid grid-cols-2 gap-2"><button onClick={rotateSelection} className="rounded-lg border border-[var(--input)] px-2 py-2 text-[9px] font-bold uppercase tracking-wide text-[#586763]">Rotate 45°</button><button onClick={removeSelectedTable} className="rounded-lg border border-red-100 px-2 py-2 text-[9px] font-bold uppercase tracking-wide text-red-600">Remove</button></div></div>}

            <EditorLabel className="mt-5">Add a table</EditorLabel>
            <div className="space-y-2">{(["T1", "T2", "T3"] as FloorTableKind[]).map((kind) => <button key={kind} onClick={() => addTable(kind)} className="flex w-full items-center justify-between rounded-lg border border-[var(--border)] bg-card px-3 py-2.5 text-left hover:border-[#e29a45]"><span><b className="block text-xs text-[var(--secondary-foreground)]">+ {kind}</b><span className="text-[9px] text-[var(--muted-foreground)]">{tableKindConfig[kind].description}</span></span><span className="rounded-lg bg-[#f2f3ef] px-2 py-1 text-[9px] font-bold text-[#65716e]">{tableKindConfig[kind].seats} seats</span></button>)}</div>

            {mergeMode && <><EditorLabel className="mt-5">Selection</EditorLabel><div className="rounded-lg border border-dashed border-[#d7c09d] bg-[#fff8ed] p-3"><div className="text-xs font-bold text-[#6d501f]">{selectedIds.length} tables selected</div><div className="mt-1 min-h-4 text-[9px] text-[#91764a]">{layoutTables.filter((table) => selectedIds.includes(table.id)).map((table) => table.label).join(" + ") || "Choose tables on the plan"}</div><Button className="mt-3 h-9 w-full" disabled={selectedIds.length < 2} onClick={createCombination}>Create combination</Button></div></>}

            <EditorLabel className="mt-5">Active combinations</EditorLabel>
            <div className="space-y-2">{combinations.length ? combinations.map((combination) => <div key={combination.id} className="rounded-lg border border-[var(--border)] bg-card p-3"><div className="flex items-start justify-between gap-2"><div><div className="text-[10px] font-bold text-[var(--secondary-foreground)]">{combination.name}</div><div className="mt-1 text-[9px] text-[var(--muted-foreground)]">{combination.capacity} seats · moves together</div></div><button aria-label={`Separate ${combination.name}`} onClick={() => removeCombination(combination)} className="rounded-lg p-1.5 text-[#a06a21] hover:bg-orange-50"><X size={13} /></button></div></div>) : <div className="rounded-lg bg-[var(--secondary)] p-3 text-[10px] text-[var(--muted-foreground)]">No merged table combinations.</div>}</div>
          </div>
          <div className="border-t border-[var(--border)] p-4"><Button variant="outline" className="w-full" onClick={resetLayout}>Restore reference layout</Button></div>
        </div>}
        <div className={cx("border-b border-[var(--border)] p-4", isEditing && "hidden")}>
          <div className="flex items-center justify-between"><div><h2 className="font-display text-xl text-[#243c39]">Reservation queue</h2><p className="mt-1 text-[10px] uppercase tracking-[.08em] text-[var(--muted-foreground)]">{queue.length} bookings · 32 covers</p></div><button className="rounded-lg border border-[var(--input)] bg-card p-2 text-[#64716e]"><Filter size={15} /></button></div>
          <div className="mt-4 flex h-10 items-center gap-2 rounded-lg border border-[var(--input)] bg-card px-3"><Search size={15} className="text-[var(--muted-foreground)]" /><input aria-label="Search reservation queue" value={query} onChange={(e) => setQuery(e.target.value)} placeholder="Guest, table or time…" className="w-full border-0 bg-transparent text-xs outline-none" /></div>
          <div className="mt-3 grid grid-cols-3 rounded-lg bg-[var(--secondary)] p-1 text-[10px] font-bold uppercase tracking-[.05em]">{(["all", "arriving", "seated"] as const).map((filter) => <button key={filter} onClick={() => setQueueFilter(filter)} className={cx("rounded-lg px-2 py-2 capitalize transition", queueFilter === filter ? "bg-card text-[#24554b] shadow-sm" : "text-[var(--muted-foreground)]")}>{filter}</button>)}</div>
        </div>
        <div className={cx("max-h-[535px] overflow-y-auto p-2 scrollbar-thin", isEditing && "hidden")}>
          <QueueSectionLabel label="Upcoming" count={queue.length} />
          {queue.map((r) => <button key={r.id} onClick={() => onSelect(r)} className="group mb-1 grid w-full grid-cols-[52px_1fr_34px] items-center gap-2 rounded-lg border border-transparent px-2 py-3 text-left transition hover:border-[#e4d4bc] hover:bg-[#fff8ed]">
            <div className="font-display whitespace-pre-line text-sm font-bold leading-tight text-[#293f3b]">{formatTime(r.start).replace(" ", "\n")}</div>
            <div className="min-w-0"><div className="truncate text-xs font-bold text-[#334642]">{r.guestName}</div><div className="mt-1 flex items-center gap-1.5 text-[10px] text-[var(--muted-foreground)]"><Users size={11} /><span>{r.guestCount}</span><span>·</span><span>{r.table ?? "Unassigned"}</span></div></div>
            <span className={cx("flex h-7 w-7 items-center justify-center rounded-full text-[10px] font-bold", r.status === "temporary_hold" ? "bg-violet-100 text-violet-700" : r.deposit === "pending" ? "bg-amber-100 text-amber-700" : "bg-emerald-100 text-emerald-700")}>{r.guestCount}</span>
          </button>)}
          <QueueSectionLabel label="Walk-ins & waitlist" count={2} />
          <div className="m-2 rounded-lg border border-dashed border-[#d7dcd7] bg-card p-3 text-center"><p className="text-[11px] font-semibold text-[var(--muted-foreground)]">No active waitlist</p><button className="mt-2 text-[10px] font-bold uppercase tracking-wide text-[#c66c05]">+ Add walk-in</button></div>
        </div>
        {canOperate && <div className={cx("border-t border-[var(--border)] p-4", isEditing && "hidden")}><Button variant="secondary" className="w-full"><Plus size={15} />Add reservation</Button></div>}
      </aside>

      <section className="relative flex min-w-0 flex-col bg-[var(--foreground)]">
        <div className="flex flex-wrap items-center justify-between gap-3 border-b border-white/10 bg-[#202a2f] px-4 py-3 text-white">
          <div className="flex items-center gap-5"><FloorStat label="Seated" value={`${occupiedCovers}`} color="bg-[var(--primary)]" /><FloorStat label="Reserved" value={`${reservedCovers}`} color="bg-[var(--primary)]" /><FloorStat label="Available" value={`${layoutTables.filter((t) => t.state === "available").length} tables`} color="bg-[var(--primary-soft)]" dark /></div>
          <div className="flex items-center gap-2">{isEditing && <span className="rounded-lg bg-[var(--primary)] px-3 py-2 text-[9px] font-black uppercase tracking-[.12em] text-white">Layout editor</span>}<button className="rounded-lg border border-white/10 bg-card/5 px-3 py-2 text-[10px] font-bold uppercase tracking-wide text-white/75">Main Dining</button>{!isEditing && <button className="rounded-lg px-3 py-2 text-[10px] font-semibold text-white/45">VIP Room</button>}<button aria-label="Floor options" className="rounded-lg border border-white/10 p-2 text-white/70"><MoreHorizontal size={16} /></button></div>
        </div>
        <div ref={canvasRef} onPointerMove={handleCanvasPointerMove} onPointerUp={handleCanvasPointerUp} onPointerCancel={handleCanvasPointerUp} className={cx("relative min-h-[620px] flex-1 overflow-hidden grid-fade", isEditing && "touch-none cursor-crosshair")}>
          <div className="absolute left-[5%] right-[5%] top-3 flex items-center gap-3 text-[9px] font-bold uppercase tracking-[.18em] text-[#8f9da1]"><span>River windows</span><span className="h-px flex-1 bg-card/10" /></div>
          <div className="absolute bottom-[13%] left-[5%] top-[25%] w-px bg-card/10" /><div className="absolute bottom-[13%] right-[5%] top-[25%] w-px bg-card/10" />
          <div className="absolute bottom-[4%] left-[7%] h-[10%] w-[31%] rounded-t-[28px] border border-white/10 bg-[#1c2529] text-center text-[9px] font-bold uppercase tracking-[.15em] text-white/35"><span className="relative top-4">Cocktail bar · 8 stools</span></div>
          <div className="absolute bottom-[3%] left-[45%] rounded-lg border border-white/10 bg-black/10 px-3 py-2 text-[9px] font-bold uppercase tracking-[.12em] text-white/40">Entrance</div>
          <button className="absolute bottom-[3%] right-[7%] rounded-lg border border-[#8ed7c5]/30 bg-[var(--primary)]/15 px-3 py-2 text-[9px] font-bold uppercase tracking-[.12em] text-[#9edbcf]">VIP Room →</button>

          {combinationBounds.map((combination) => <div key={combination.id} className="pointer-events-none absolute z-[2] rounded-lg border-2 border-dashed border-[#f3aa4f] bg-[var(--primary)]/5" style={{ left: `${combination.left - 1}%`, top: `${combination.top - 1}%`, width: `${combination.width + 2}%`, height: `${combination.height + 2}%` }}><span className="absolute -top-5 left-0 rounded bg-[var(--primary)] px-1.5 py-0.5 text-[7px] font-black uppercase tracking-wide text-white">{combination.capacity}-seat combination</span></div>)}

          {layoutTables.map((table) => <button key={table.id} aria-label={`${table.label}, ${table.seats} seats, ${table.state}`} onPointerDown={(event) => handleTablePointerDown(event, table)} onClick={() => handleTableClick(table)} className={cx("absolute flex items-center justify-center border-2 transition hover:brightness-110", floorStateStyle[table.state], table.kind === "T1" && "rounded-lg", table.kind === "T2" && "rounded-lg", table.kind === "T3" && "rounded-lg", isEditing && !mergeMode && "cursor-grab active:cursor-grabbing", selectedTable?.id === table.id && !isEditing && "z-10 ring-4 ring-white/80 ring-offset-2 ring-offset-[var(--foreground)]", selectedIds.includes(table.id) && "z-10 ring-4 ring-[#ffc16f] ring-offset-2 ring-offset-[var(--foreground)]")} style={{ left: `${table.x}%`, top: `${table.y}%`, width: `${table.width}%`, height: `${table.height}%`, transform: `rotate(${table.rotation}deg)` }}>
            <span className="flex max-w-full flex-col items-center justify-center" style={{ transform: `rotate(${-table.rotation}deg)` }}><span className="text-[7px] font-black uppercase tracking-wide">{table.label}</span><span className="mt-0.5 flex items-center gap-0.5 text-[7px] opacity-75"><Users size={7} />{table.seats}</span>{table.guest && <span className="mt-0.5 max-w-[90%] truncate text-[6px] font-semibold opacity-90">{table.time} · {table.guest}</span>}</span>
          </button>)}

          <div className="absolute bottom-3 left-1/2 flex -translate-x-1/2 items-center gap-3 rounded-full border border-white/10 bg-[#172024]/90 px-4 py-2 text-[9px] text-white/65 shadow-xl"><FloorLegend color="bg-[var(--primary-soft)]" label="Available" /><FloorLegend color="bg-[var(--primary)]" label="Reserved" /><FloorLegend color="bg-[var(--primary)]" label="Seated" /><FloorLegend color="bg-[#8763ad]" label="Hold" /><FloorLegend color="bg-[#58666e]" label="Cleaning" /></div>
        </div>

        {isEditing ? <div className="flex flex-col gap-3 border-t border-white/10 bg-[#1d272b] px-4 py-3 text-white sm:flex-row sm:items-center sm:justify-between"><div><div className="text-xs font-bold">{mergeMode ? `${selectedIds.length} tables selected for merging` : selectedIds.length > 1 ? `${selectedIds.length} combined tables selected` : selectedTable ? `${selectedTable.label} · drag to reposition` : "Select a table"}</div><div className="mt-1 text-[9px] uppercase tracking-[.1em] text-white/40">{layoutTables.length} physical tables · {combinations.length} combinations · 60 guest area limit</div></div><div className="flex gap-2">{mergeMode && <button disabled={selectedIds.length < 2} onClick={createCombination} className="rounded-lg border border-white/15 px-3 py-2 text-[10px] font-bold uppercase tracking-wide text-white/75 disabled:opacity-40">Merge selected</button>}<button onClick={saveLayout} className="rounded-lg bg-[var(--primary)] px-3 py-2 text-[10px] font-bold uppercase tracking-wide text-white">Save setup</button></div></div> : selectedTable && <div className="flex flex-col gap-3 border-t border-white/10 bg-[#1d272b] px-4 py-3 text-white sm:flex-row sm:items-center sm:justify-between"><div className="flex items-center gap-3"><div className={cx("flex h-10 w-10 items-center justify-center rounded-lg border text-xs font-black", floorStateStyle[selectedTable.state])}>{selectedTable.label}</div><div><div className="text-xs font-bold">{selectedTable.guest ?? `${selectedTable.seats}-seat table available`}</div><div className="mt-0.5 text-[10px] text-white/45">{selectedTable.time ? `${selectedTable.time} · ` : ""}{selectedTable.seats} seats · <span className="capitalize">{selectedTable.state}</span></div></div></div><div className="flex gap-2">{selectedReservation && <button onClick={() => onSelect(selectedReservation)} className="rounded-lg border border-white/15 px-3 py-2 text-[10px] font-bold uppercase tracking-wide text-white/75">View booking</button>}<button onClick={() => notify(selectedTable.state === "available" ? `${selectedTable.label} is ready for assignment.` : `${selectedTable.label} service actions opened.`)} className="rounded-lg bg-[var(--primary)] px-3 py-2 text-[10px] font-bold uppercase tracking-wide text-white">{selectedTable.state === "available" ? "Assign table" : "Service actions"}</button></div></div>}
      </section>
    </div>
  </div>;
}

function QueueSectionLabel({ label, count }: { label: string; count: number }) { return <div className="flex items-center gap-2 px-3 py-3 text-[9px] font-bold uppercase tracking-[.13em] text-[var(--muted-foreground)]"><span>{label}</span><span className="rounded-full bg-[var(--secondary)] px-2 py-0.5">{count}</span><span className="h-px flex-1 bg-[var(--border)]" /></div>; }
function FloorStat({ label, value, color, dark }: { label: string; value: string; color: string; dark?: boolean }) { return <div className="flex items-center gap-2"><span className={cx("h-2.5 w-2.5 rounded-full", color, dark && "border border-white/40")} /><span><b className="block text-[11px] leading-none">{value}</b><span className="text-[8px] uppercase tracking-[.1em] text-white/40">{label}</span></span></div>; }
function FloorLegend({ color, label }: { color: string; label: string }) { return <span className="flex items-center gap-1.5 whitespace-nowrap"><span className={cx("h-2 w-2 rounded-full", color)} />{label}</span>; }
function EditorLabel({ children, className }: { children: ReactNode; className?: string }) { return <div className={cx("mb-2 text-[9px] font-bold uppercase tracking-[.13em] text-[var(--muted-foreground)]", className)}>{children}</div>; }

function TodayScreen({ reservations, onSelect, onNew, onAvailability }: { reservations: Reservation[]; onSelect: (r: Reservation) => void; onNew: () => void; onAvailability: () => void }) {
  const covers = reservations.filter((r) => r.area === "Main Dining").reduce((sum, r) => sum + r.guestCount, 0);
  return <div className="animate-rise">
    <PageHeader eyebrow="Friday · 07 August 2026" title="Today’s reservations" description="A clear view of service, confirmations, and deposits for Waterfront Seafood & Cocktails.">
      <Button variant="outline" onClick={onAvailability}><Search size={16} />Availability</Button><Button onClick={onNew}><Plus size={16} />Add booking</Button>
    </PageHeader>
    <div className="grid gap-4 px-5 py-6 md:grid-cols-2 md:px-8 xl:grid-cols-4">
      <Metric label="Reservations" value={reservations.length.toString().padStart(2, "0")} note="Across lunch & dinner" icon={<CalendarDays size={18} />} />
      <Metric label="Expected covers" value={reservations.reduce((s, r) => s + r.guestCount, 0).toString()} note="Main dining + VIP" icon={<Users size={18} />} />
      <Metric label="Main dining" value={`${Math.min(covers, 60)}/60`} note="Peak committed capacity" icon={<Utensils size={18} />} />
      <Metric label="Needs attention" value="03" note="2 holds · 1 deposit" icon={<Bell size={18} />} accent />
    </div>
    <div className="px-5 pb-10 md:px-8">
      <div className="overflow-hidden rounded-lg border border-[var(--border)] bg-[var(--card)] shadow-soft">
        <div className="flex flex-col gap-3 border-b border-[#e4e7e2] px-5 py-4 sm:flex-row sm:items-center sm:justify-between">
          <div className="flex items-center gap-2"><h2 className="font-display text-xl text-[#1e3734]">Service list</h2><span className="rounded-full bg-[var(--secondary)] px-2 py-0.5 text-[10px] font-bold text-[#65716f]">{reservations.length}</span></div>
          <div className="flex gap-2"><button className="inline-flex h-9 items-center gap-2 rounded-lg border border-[var(--border)] bg-card px-3 text-xs font-semibold text-[var(--muted-foreground)]"><Filter size={14} />Filters</button><button className="inline-flex h-9 items-center gap-2 rounded-lg border border-[var(--border)] bg-card px-3 text-xs font-semibold text-[var(--muted-foreground)]"><Clock3 size={14} />All day</button></div>
        </div>
        <div className="hidden grid-cols-[90px_1.5fr_100px_1.15fr_130px_140px_38px] gap-3 border-b border-[var(--border)] bg-[#f8f7f2] px-5 py-3 text-[10px] font-bold uppercase tracking-[.11em] text-[#87918f] lg:grid"><span>Time</span><span>Guest</span><span>Pax</span><span>Area & table</span><span>Deposit</span><span>Status</span><span /></div>
        <div className="divide-y divide-[var(--border)]">
          {reservations.map((r) => <button key={r.id} onClick={() => onSelect(r)} className="grid w-full gap-3 px-5 py-4 text-left transition hover:bg-[#fffaf2] lg:grid-cols-[90px_1.5fr_100px_1.15fr_130px_140px_38px] lg:items-center">
            <div><div className="font-display text-lg font-bold text-[var(--foreground)]">{formatTime(r.start)}</div><div className="text-[10px] text-[#8a9492]">{r.durationMinutes / 60} hr{r.durationMinutes > 60 ? "s" : ""}</div></div>
            <div className="min-w-0"><div className="truncate text-sm font-bold text-[#263b38]">{r.guestName}</div><div className="mt-0.5 flex items-center gap-1.5 truncate text-[11px] text-[var(--muted-foreground)]"><span>{r.code}</span>{r.occasion && <><span>·</span><span>{r.occasion}</span></>}</div></div>
            <div className="flex items-center gap-2 text-sm font-semibold"><Users size={14} className="text-[#c9791b]" />{r.guestCount}</div>
            <div><div className="text-xs font-semibold text-[var(--secondary-foreground)]">{r.area}</div><div className="mt-0.5 text-[11px] text-[var(--muted-foreground)]">{r.table ?? "General seating"}</div></div>
            <div className={cx("flex items-center gap-1.5 text-xs font-semibold capitalize", depositStyles[r.deposit])}><CircleDollarSign size={15} />{r.deposit.replaceAll("_", " ")}</div>
            <div><Pill status={r.status} /></div><MoreHorizontal size={17} className="hidden text-[#a0aaa8] lg:block" />
          </button>)}
        </div>
      </div>
    </div>
  </div>;
}

function Metric({ label, value, note, icon, accent }: { label: string; value: string; note: string; icon: ReactNode; accent?: boolean }) {
  return <div className={cx("relative overflow-hidden rounded-lg border bg-[var(--card)] p-5 shadow-soft", accent ? "border-[#edc98f]" : "border-[var(--border)]")}>
    {accent && <div className="absolute right-0 top-0 h-full w-1 bg-[var(--primary)]" />}<div className="flex items-start justify-between"><div className="text-[10px] font-bold uppercase tracking-[.12em] text-[#85908d]">{label}</div><div className={cx("rounded-lg p-2", accent ? "bg-orange-50 text-[var(--accent-strong)]" : "bg-[#eef2ed] text-[#49605b]")}>{icon}</div></div><div className="font-display mt-1 text-[30px] font-bold text-[#1e3734]">{value}</div><div className="mt-1 text-[11px] text-[#7c8885]">{note}</div>
  </div>;
}

function CalendarScreen({ reservations, onSelect }: { reservations: Reservation[]; onSelect: (r: Reservation) => void }) {
  const days = ["Mon 03", "Tue 04", "Wed 05", "Thu 06", "Fri 07", "Sat 08", "Sun 09"];
  return <div className="animate-rise"><PageHeader eyebrow="Operations calendar" title="Week at a glance" description="Bookings by service time and area. All times shown in Asia/Manila."><Button variant="outline"><ChevronLeft size={16} /></Button><Button variant="outline">This week</Button><Button variant="outline"><ChevronRight size={16} /></Button></PageHeader>
    <div className="px-5 py-6 md:px-8"><div className="overflow-x-auto rounded-lg border border-[var(--border)] bg-card shadow-soft scrollbar-thin"><div className="min-w-[900px]"><div className="grid grid-cols-[70px_repeat(7,1fr)] border-b border-[var(--border)] bg-[#faf9f5]"><div /><>{days.map((d) => <div key={d} className={cx("border-l border-[#e6e8e3] px-3 py-4 text-center text-xs font-bold", d === "Fri 07" && "bg-[#fff4e5] text-[#b85e00]")}>{d}</div>)}</></div>
      <div className="relative grid h-[600px] grid-cols-[70px_repeat(7,1fr)] grid-rows-[repeat(12,50px)] grid-fade">{Array.from({ length: 12 }, (_, i) => <div key={i} className="col-start-1 row-span-1 border-r border-[var(--border)] pr-3 pt-1 text-right text-[10px] text-[var(--muted-foreground)]" style={{ gridRowStart: i + 1 }}>{`${10 + i}:00`}</div>)}
        {reservations.map((r, index) => { const hour = Number(r.start.split(":")[0]); const minute = Number(r.start.split(":")[1]); return <button key={r.id} onClick={() => onSelect(r)} className={cx("z-10 mx-1 overflow-hidden rounded-lg border-l-[3px] p-2 text-left shadow-sm", r.area === "VIP Room" ? "border-l-[#5b7c99] bg-[#eef5fa]" : "border-l-[var(--primary)] bg-[#fff6e8]")} style={{ gridColumnStart: 6, gridRowStart: hour - 9, height: Math.max(42, r.durationMinutes / 2), marginTop: minute / 1.2 + index * 2 }}><div className="text-[10px] font-bold text-[#344844]">{r.start} · {r.guestName}</div><div className="mt-1 text-[9px] text-[#778380]">{r.guestCount} pax · {r.area}</div></button>; })}
      </div></div></div></div></div>;
}

export function GuestsScreen({ reservations }: { reservations: Reservation[] }) {
  return <div className="animate-rise"><PageHeader eyebrow="Guest directory" title="Know your guests" description="Duplicate suggestions prioritize normalized Philippine mobile number, then email."><Button><Plus size={16} />Add guest</Button></PageHeader>
    <div className="px-5 py-6 md:px-8"><div className="mb-4 flex max-w-lg items-center gap-2 rounded-lg border border-[var(--input)] bg-card px-3 py-2.5"><Search size={17} className="text-slate-400" /><input aria-label="Search guests" placeholder="Search name, mobile or email…" className="w-full border-0 bg-transparent text-sm outline-none" /></div>
      <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-3">{reservations.map((r, i) => <div key={r.id} className="rounded-lg border border-[var(--border)] bg-[var(--card)] p-5 shadow-soft"><div className="flex items-start justify-between"><div className="flex items-center gap-3"><div className="flex h-11 w-11 items-center justify-center rounded-full bg-[#edf1eb] font-display font-bold text-[#31564f]">{r.guestName.split(" ").map((n) => n[0]).slice(0, 2).join("")}</div><div><h3 className="font-display text-lg text-[var(--foreground)]">{r.guestName}</h3><p className="text-[10px] uppercase tracking-[.08em] text-[var(--muted-foreground)]">Guest since 2026</p></div></div><MoreHorizontal size={17} className="text-slate-400" /></div><div className="mt-5 space-y-2 text-xs text-[#64716e]"><div className="flex items-center gap-2"><Phone size={14} />{r.mobile}</div><div className="flex items-center gap-2"><Mail size={14} />{r.email ?? "No email recorded"}</div></div><div className="mt-5 grid grid-cols-3 divide-x divide-[var(--border)] border-t border-[var(--border)] pt-4 text-center"><GuestStat label="Bookings" value={i + 2} /><GuestStat label="Completed" value={i + 1} /><GuestStat label="No-show" value={0} /></div></div>)}</div>
    </div></div>;
}

function GuestStat({ label, value }: { label: string; value: number }) { return <div><div className="font-display text-lg font-bold text-[#263d3a]">{value}</div><div className="text-[9px] uppercase tracking-[.08em] text-[var(--muted-foreground)]">{label}</div></div>; }

function NotificationsScreen({ onSelect, notify }: { onSelect: () => void; notify: (message: string) => void }) {
  const items = [
    { title: "Deposit still pending", body: "Adrian Lim · 12 pax · Today at 1:00 PM", tone: "amber", when: "42 min ago" },
    { title: "Pencil booking overdue", body: "Luis & Mara Robles · Today at 6:30 PM", tone: "orange", when: "1 hr ago" },
    { title: "VIP confirmation due", body: "Isabel Villanueva · Today at 6:00 PM", tone: "blue", when: "3 hrs ago" },
  ];
  return <div className="animate-rise"><PageHeader eyebrow="Action centre" title="Notifications" description="Internal reminders only. Staff contacts guests through their original inquiry channel."><Button variant="outline" onClick={() => notify("All visible reminders marked read.")}><Check size={16} />Mark all read</Button></PageHeader><div className="mx-auto max-w-4xl px-5 py-6 md:px-8"><div className="overflow-hidden rounded-lg border border-[var(--border)] bg-card shadow-soft">{items.map((n, i) => <div key={n.title} className="flex gap-4 border-b border-[#e8eae6] p-5 last:border-0"><div className={cx("mt-1 flex h-10 w-10 shrink-0 items-center justify-center rounded-full", n.tone === "amber" ? "bg-amber-50 text-amber-700" : n.tone === "orange" ? "bg-orange-50 text-orange-700" : "bg-blue-50 text-blue-700")}><Bell size={17} /></div><div className="min-w-0 flex-1"><div className="flex items-start justify-between gap-3"><h3 className="text-sm font-bold text-[#2b3e3b]">{n.title}</h3><span className="shrink-0 text-[10px] text-[#939c9a]">{n.when}</span></div><p className="mt-1 text-xs text-[var(--muted-foreground)]">{n.body}</p><div className="mt-3 flex gap-2"><button onClick={onSelect} className="text-xs font-bold text-[#c66c05]">Open reservation</button><span className="text-slate-300">·</span><button onClick={() => notify(`Reminder ${i + 1} resolved.`)} className="text-xs font-semibold text-[#63706d]">Resolve</button></div></div><span className="mt-2 h-2 w-2 rounded-full bg-[var(--primary)]" /></div>)}</div></div></div>;
}

function ReportsScreen({ reservations }: { reservations: Reservation[] }) {
  const total = reservations.reduce((s, r) => s + r.guestCount, 0);
  const sources = ["Instagram", "Facebook", "Phone", "WhatsApp", "Viber"];
  const values = [78, 62, 48, 35, 28];
  return <div className="animate-rise"><PageHeader eyebrow="Operational reporting" title="Reservation overview" description="Service activity and conversion signals. This is not financial accounting."><Button variant="outline"><CalendarDays size={16} />01–07 Aug 2026</Button><Button variant="outline">Export CSV</Button></PageHeader><div className="grid gap-5 px-5 py-6 md:grid-cols-2 md:px-8 xl:grid-cols-4"><Metric label="Total bookings" value={reservations.length.toString()} note="This selected period" icon={<CalendarDays size={18} />} /><Metric label="Booked covers" value={total.toString()} note="Across all resources" icon={<Users size={18} />} /><Metric label="Confirmed" value="80%" note="4 of 5 bookings" icon={<CheckCircle2 size={18} />} /><Metric label="Deposits paid" value="₱8.5k" note="Manually recorded" icon={<CircleDollarSign size={18} />} /></div><div className="grid gap-5 px-5 pb-10 md:px-8 xl:grid-cols-2"><div className="rounded-lg border border-[var(--border)] bg-card p-6 shadow-soft"><h2 className="font-display text-xl text-[var(--foreground)]">Inquiry sources</h2><p className="mt-1 text-xs text-[var(--muted-foreground)]">Share of reservations received per channel</p><div className="mt-6 space-y-4">{sources.map((s, i) => <div key={s}><div className="mb-1.5 flex justify-between text-xs"><span className="font-semibold text-[#455552]">{s}</span><span className="text-[#89928f]">{values[i]}%</span></div><div className="h-2 overflow-hidden rounded-full bg-[#edf0eb]"><div className="h-full rounded-full bg-[#e88a19]" style={{ width: `${values[i]}%` }} /></div></div>)}</div></div><div className="rounded-lg border border-[var(--border)] bg-card p-6 shadow-soft"><h2 className="font-display text-xl text-[var(--foreground)]">Booking mix</h2><p className="mt-1 text-xs text-[var(--muted-foreground)]">Reservations and covers by resource</p><div className="mt-7 flex items-center justify-center gap-10"><div className="relative flex h-44 w-44 items-center justify-center rounded-full" style={{ background: "conic-gradient(var(--primary) 0 62%, #2d6d60 62% 82%, #9db5b0 82% 100%)" }}><div className="flex h-28 w-28 flex-col items-center justify-center rounded-full bg-card"><span className="font-display text-3xl font-bold text-[var(--foreground)]">{total}</span><span className="text-[9px] uppercase tracking-[.1em] text-[#89928f]">covers</span></div></div><div className="space-y-3 text-xs"><Legend color="var(--primary)" label="Main dining" value="62%" /><Legend color="#2d6d60" label="VIP Room" value="20%" /><Legend color="#9db5b0" label="Large party" value="18%" /></div></div></div></div></div>;
}

function Legend({ color, label, value }: { color: string; label: string; value: string }) { return <div className="flex items-center gap-2"><span className="h-2.5 w-2.5 rounded-full" style={{ background: color }} /><span className="min-w-20 text-[#5f6c69]">{label}</span><b className="text-[#2e413e]">{value}</b></div>; }

function SettingsScreen({ notify }: { notify: (message: string) => void }) {
  return <div className="animate-rise"><PageHeader eyebrow="Outlet configuration" title="Policies & resources" description="Changes are audited. Placeholder values must be confirmed before production."><Button onClick={() => notify("Configuration saved with an audit event.")}><Check size={16} />Save changes</Button></PageHeader><div className="grid gap-5 px-5 py-6 md:px-8 xl:grid-cols-[1.15fr_.85fr]"><div className="space-y-5"><ConfigCard title="Capacity & booking policy" icon={<SlidersHorizontal size={18} />}><div className="grid gap-4 sm:grid-cols-2"><Field label="Main Dining capacity"><input type="number" defaultValue="60" /></Field><Field label="Large-party threshold"><input type="number" defaultValue="10" /></Field><Field label="Default dining duration"><select defaultValue="120"><option value="120">2 hours</option><option value="150">2.5 hours</option></select></Field><Field label="Reset buffer"><select defaultValue="10"><option value="10">10 minutes</option><option value="5">5 minutes</option></select></Field></div><div className="mt-4 flex items-start gap-2 rounded-lg border border-amber-200 bg-amber-50 p-3 text-xs leading-5 text-amber-900"><AlertTriangle size={16} className="mt-0.5 shrink-0" /><span><b>Production checklist:</b> the 10-person threshold and table inventory are development placeholders pending management confirmation.</span></div></ConfigCard><ConfigCard title="VIP Room" icon={<Sparkles size={18} />}><div className="grid gap-4 sm:grid-cols-2"><Field label="Maximum guests"><input type="number" defaultValue="24" /></Field><Field label="Minimum duration"><select defaultValue="180"><option value="180">3 hours</option></select></Field><Field label="Default duration"><select defaultValue="240"><option value="240">4 hours</option></select></Field><Field label="Cleaning buffer"><select defaultValue="10"><option value="10">10 minutes</option></select></Field></div></ConfigCard></div><div className="space-y-5"><ConfigCard title="Operating hours" icon={<Clock3 size={18} />}><div className="space-y-3">{["Monday", "Tuesday", "Wednesday", "Thursday", "Friday", "Saturday", "Sunday"].map((d) => <div key={d} className="grid grid-cols-[1fr_80px_10px_80px] items-center gap-2 text-xs"><span className="font-semibold text-[#4d5e5a]">{d}</span><span className="rounded-lg border border-[var(--border)] bg-[var(--background)] px-2 py-2 text-center">10:00</span><span>–</span><span className="rounded-lg border border-[var(--border)] bg-[var(--background)] px-2 py-2 text-center">22:00</span></div>)}</div></ConfigCard><ConfigCard title="Development tables" icon={<TableProperties size={18} />}><div className="space-y-2">{[["M1", "2–4"], ["M2", "2–4"], ["M3", "4–6"], ["M4 · Window", "2–4"], ["M1 + M2", "6–10"]].map((t) => <div key={t[0]} className="flex items-center justify-between rounded-lg bg-[#f7f7f2] px-3 py-2.5 text-xs"><span className="font-semibold text-[#42534f]">{t[0]}</span><span className="text-[var(--muted-foreground)]">{t[1]} guests</span></div>)}</div><Button variant="outline" className="mt-4 w-full"><Plus size={15} />Add resource</Button></ConfigCard></div></div></div>;
}

function ConfigCard({ title, icon, children }: { title: string; icon: ReactNode; children: ReactNode }) { return <section className="rounded-lg border border-[var(--border)] bg-card p-5 shadow-soft"><div className="mb-5 flex items-center gap-2"><span className="rounded-lg bg-[#edf1eb] p-2 text-[#365b54]">{icon}</span><h2 className="font-display text-xl text-[var(--foreground)]">{title}</h2></div>{children}</section>; }
function Field({ label, children }: { label: string; children: ReactNode }) { return <label className="block text-[11px] font-bold uppercase tracking-[.08em] text-[#788481]">{label}<div className="mt-1.5 [&_input]:h-10 [&_input]:w-full [&_input]:rounded-lg [&_input]:border [&_input]:border-[var(--input)] [&_input]:bg-[var(--card)] [&_input]:px-3 [&_input]:text-sm [&_select]:h-10 [&_select]:w-full [&_select]:rounded-lg [&_select]:border [&_select]:border-[var(--input)] [&_select]:bg-[var(--card)] [&_select]:px-3 [&_select]:text-sm [&_select]:normal-case [&_select]:tracking-normal">{children}</div></label>; }

function ModalShell({ title, eyebrow, onClose, children, wide }: { title: string; eyebrow: string; onClose: () => void; children: ReactNode; wide?: boolean }) {
  return <div className="fixed inset-0 z-[60] flex items-end justify-center bg-[#102421]/45 p-0 backdrop-blur-[2px] sm:items-center sm:p-4" role="dialog" aria-modal="true"><div className={cx("max-h-[94vh] w-full overflow-y-auto rounded-t-3xl bg-[var(--card)] shadow-2xl scrollbar-thin sm:rounded-lg", wide ? "max-w-4xl" : "max-w-2xl")}><div className="sticky top-0 z-10 flex items-center justify-between border-b border-[var(--border)] bg-[var(--card)]/95 px-6 py-5 backdrop-blur"><div><div className="text-[10px] font-bold uppercase tracking-[.15em] text-[var(--accent-strong)]">{eyebrow}</div><h2 className="font-display mt-1 text-2xl text-[var(--foreground)]">{title}</h2></div><button aria-label="Close" onClick={onClose} className="rounded-full border border-[#dde1dc] p-2 text-[var(--muted-foreground)] hover:bg-secondary"><X size={18} /></button></div>{children}</div></div>;
}

function NewReservationModal({ onClose, onCreate }: { onClose: () => void; onCreate: (r: Reservation) => void }) {
  const [bookingType, setBookingType] = useState<BookingType>("regular_table");
  const [guestCount, setGuestCount] = useState(2);
  const rules = determineDepositRules({ guestCount, largePartyThreshold: 10, bookingType });
  function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault(); const data = new FormData(event.currentTarget); const mobile = normalizePhilippineMobile(String(data.get("mobile"))) ?? String(data.get("mobile"));
    onCreate({ id: crypto.randomUUID(), code: `WF-260807-${String(19 + Math.floor(Math.random() * 40)).padStart(3, "0")}`, guestName: String(data.get("guestName")), guestCount, mobile, bookingType: guestCount >= 10 && bookingType === "regular_table" ? "large_party" : bookingType, area: bookingType === "vip_room" ? "VIP Room" : bookingType === "private_event" ? "Whole Restaurant" : "Main Dining", date: String(data.get("date")), start: String(data.get("time")), durationMinutes: Number(data.get("duration")), status: rules.length ? "pending_deposit" : "pending_confirmation", source: String(data.get("source")), deposit: rules.length ? "pending" : "not_required", occasion: String(data.get("occasion") || "") });
  }
  return <ModalShell title="Create reservation" eyebrow="Atomic availability recheck on submit" onClose={onClose} wide><form onSubmit={submit}><div className="grid gap-7 p-6 md:grid-cols-[1.05fr_.95fr]"><div className="space-y-5"><SectionLabel number="01" title="Booking details" /><div className="grid grid-cols-2 gap-3"><Field label="Booking type"><select value={bookingType} onChange={(e) => setBookingType(e.target.value as BookingType)} name="bookingType"><option value="regular_table">Main Dining</option><option value="vip_room">VIP Room</option><option value="private_event">Private event</option><option value="walk_in">Walk-in</option></select></Field><Field label="Party size"><input required min="1" max={bookingType === "vip_room" ? 24 : 200} type="number" value={guestCount} onChange={(e) => setGuestCount(Number(e.target.value))} /></Field><Field label="Date"><input required name="date" type="date" defaultValue="2026-08-07" /></Field><Field label="Start time"><input required name="time" type="time" defaultValue="20:00" /></Field><Field label="Duration"><select name="duration" defaultValue={bookingType === "vip_room" ? "240" : "120"}><option value="120">2 hours</option><option value="180">3 hours</option><option value="240">4 hours</option></select></Field><Field label="Table request"><select name="table"><option>General seating</option><option>M1</option><option>M2</option><option>M1 + M2</option></select></Field></div><div className="rounded-lg border border-emerald-200 bg-emerald-50 p-3"><div className="flex items-center gap-2 text-xs font-bold text-emerald-800"><CheckCircle2 size={16} />Available — general seating</div><p className="mt-1 pl-6 text-[11px] text-emerald-700">42 of 60 Main Dining seats remain at this time.</p></div><SectionLabel number="02" title="Guest details" /><div className="grid grid-cols-2 gap-3"><div className="col-span-2"><Field label="Full name"><input required name="guestName" placeholder="Guest’s full name" /></Field></div><Field label="Mobile number"><input required name="mobile" placeholder="09xx xxx xxxx" /></Field><Field label="Email (optional)"><input name="email" type="email" placeholder="guest@email.com" /></Field><Field label="Inquiry source"><select name="source" defaultValue="Facebook Messenger">{inquirySources.map((s) => <option key={s}>{s}</option>)}</select></Field><Field label="Occasion"><input name="occasion" placeholder="Birthday, business…" /></Field></div></div><div className="space-y-5"><SectionLabel number="03" title="Confirmation & payment" /><div className={cx("rounded-lg border p-4", rules.length ? "border-amber-200 bg-amber-50" : "border-[var(--border)] bg-[#f8f8f4]")}><div className="flex items-start gap-3"><div className={cx("rounded-lg p-2", rules.length ? "bg-amber-100 text-amber-700" : "bg-card text-[var(--muted-foreground)]")}><CircleDollarSign size={18} /></div><div><h3 className="text-sm font-bold text-[var(--secondary-foreground)]">{rules.length ? "Deposit required" : "No deposit required"}</h3><p className="mt-1 text-[11px] leading-5 text-[#6f7b78]">{rules.length ? `Triggered by: ${rules.map((r) => r.replaceAll("_", " ")).join(", ")}. Record amount and due date below.` : "No active rule applies to this reservation."}</p></div></div></div>{rules.length > 0 && <div className="grid grid-cols-2 gap-3"><Field label="Amount due (PHP)"><input name="amount" type="number" placeholder="0.00" /></Field><Field label="Due date"><input name="dueDate" type="date" defaultValue="2026-08-07" /></Field></div>}<Field label="Initial status"><select name="status" defaultValue={rules.length ? "pending_deposit" : "pending_confirmation"}><option value="pending_confirmation">Pending confirmation</option><option value="temporary_hold">Temporary hold</option><option value="pending_deposit">Pending deposit</option><option value="confirmed">Confirmed</option></select></Field><Field label="Confirmation deadline"><input name="confirmationDue" type="datetime-local" defaultValue="2026-08-07T16:00" /></Field><Field label="Special requests"><textarea name="requests" rows={3} placeholder="Allergies, accessibility, seating preferences…" className="w-full rounded-lg border border-[var(--input)] bg-[var(--card)] p-3 text-sm normal-case tracking-normal" /></Field><div className="rounded-lg border border-blue-100 bg-blue-50 p-3 text-[11px] leading-5 text-blue-800"><ShieldCheck size={15} className="mr-1.5 inline" />Submission rechecks capacity, table locks, VIP overlap, and private-event closures in one database transaction.</div></div></div><div className="flex items-center justify-between border-t border-[var(--border)] bg-[#faf9f4] px-6 py-4"><p className="hidden text-[10px] text-[var(--muted-foreground)] sm:block">Required fields are validated on the server.</p><div className="ml-auto flex gap-2"><Button variant="ghost" onClick={onClose}>Cancel</Button><Button type="submit"><Check size={16} />Create reservation</Button></div></div></form></ModalShell>;
}

function SectionLabel({ number, title }: { number: string; title: string }) { return <div className="flex items-center gap-3"><span className="font-display text-sm font-bold text-[#e2810f]">{number}</span><h3 className="text-[11px] font-bold uppercase tracking-[.14em] text-[#4d5c59]">{title}</h3><div className="h-px flex-1 bg-[#e2e5e0]" /></div>; }

function AvailabilityModal({ reservations, onClose, onContinue }: { reservations: Reservation[]; onClose: () => void; onContinue: () => void }) {
  const [searched, setSearched] = useState(true); const [pax, setPax] = useState(4); const committed = useMemo(() => reservations.filter((r) => r.area === "Main Dining" && r.start <= "19:00").reduce((s, r) => s + r.guestCount, 0), [reservations]);
  return <ModalShell title="Check availability" eyebrow="Waterfront · Iloilo" onClose={onClose}><div className="p-6"><div className="grid grid-cols-2 gap-3 sm:grid-cols-4"><Field label="Area"><select><option>Main Dining</option><option>VIP Room</option></select></Field><Field label="Date"><input type="date" defaultValue="2026-08-07" /></Field><Field label="Time"><input type="time" defaultValue="19:00" /></Field><Field label="Party size"><input type="number" min="1" value={pax} onChange={(e) => setPax(Number(e.target.value))} /></Field></div><Button className="mt-4 w-full" onClick={() => setSearched(true)}><Search size={16} />Search availability</Button>{searched && <div className="mt-6 rounded-lg border border-emerald-200 bg-emerald-50 p-5"><div className="flex items-start gap-3"><div className="rounded-full bg-emerald-100 p-2 text-emerald-700"><Check size={19} /></div><div className="flex-1"><div className="text-sm font-bold text-emerald-900">Available — general seating</div><p className="mt-1 text-xs leading-5 text-emerald-800">This party fits Main Dining capacity. No specific table is promised.</p><div className="mt-4 grid grid-cols-3 divide-x divide-emerald-200 rounded-lg bg-card/60 py-3 text-center"><div><b className="font-display text-xl text-emerald-900">60</b><span className="block text-[9px] uppercase tracking-wide text-emerald-700">capacity</span></div><div><b className="font-display text-xl text-emerald-900">{committed}</b><span className="block text-[9px] uppercase tracking-wide text-emerald-700">committed</span></div><div><b className="font-display text-xl text-emerald-900">{60 - committed - pax}</b><span className="block text-[9px] uppercase tracking-wide text-emerald-700">after booking</span></div></div></div></div></div>}<div className="mt-5 flex justify-end gap-2"><Button variant="ghost" onClick={onClose}>Close</Button><Button onClick={onContinue}>Continue to reservation<ChevronRight size={16} /></Button></div></div></ModalShell>;
}

function ReservationDrawer({ reservation, onClose, onUpdate, canOperate }: { reservation: Reservation; onClose: () => void; onUpdate: (r: Reservation) => void; canOperate: boolean }) {
  return <div className="fixed inset-0 z-[70] bg-[#102421]/30" role="dialog" aria-modal="true"><button aria-label="Close reservation details" onClick={onClose} className="absolute inset-0" /><aside className="absolute bottom-0 right-0 top-0 w-full max-w-[540px] overflow-y-auto bg-[var(--card)] shadow-2xl scrollbar-thin"><div className="sticky top-0 z-10 flex items-center justify-between border-b border-[#e3e6e0] bg-[var(--card)]/95 px-6 py-5 backdrop-blur"><div><div className="text-[10px] font-bold uppercase tracking-[.13em] text-[var(--accent-strong)]">{reservation.code}</div><h2 className="font-display mt-1 text-2xl text-[var(--foreground)]">Reservation details</h2></div><button aria-label="Close" onClick={onClose} className="rounded-full border border-[var(--border)] p-2"><X size={18} /></button></div><div className="p-6"><div className="rounded-lg bg-[var(--primary-strong)] p-5 text-white"><div className="flex items-start justify-between"><div><h3 className="font-display text-2xl">{reservation.guestName}</h3><p className="mt-1 text-xs text-white/65">{reservation.mobile}</p></div><Pill status={reservation.status} /></div><div className="mt-6 grid grid-cols-3 divide-x divide-white/15"><div><span className="text-[9px] uppercase tracking-wide text-white/55">When</span><b className="mt-1 block text-sm">{formatTime(reservation.start)}</b></div><div className="pl-4"><span className="text-[9px] uppercase tracking-wide text-white/55">Guests</span><b className="mt-1 block text-sm">{reservation.guestCount} pax</b></div><div className="pl-4"><span className="text-[9px] uppercase tracking-wide text-white/55">Area</span><b className="mt-1 block text-sm">{reservation.area}</b></div></div></div><div className="mt-5 grid grid-cols-2 gap-3"><Detail icon={<TableProperties size={15} />} label="Table" value={reservation.table ?? "General seating"} /><Detail icon={<MessageSquare size={15} />} label="Source" value={reservation.source} /><Detail icon={<UserRound size={15} />} label="Owner" value={reservation.owner ?? "Unassigned"} /><Detail icon={<CircleDollarSign size={15} />} label="Deposit" value={reservation.deposit.replaceAll("_", " ")} /></div>{reservation.status === "temporary_hold" && <div className="mt-5 rounded-lg border border-orange-200 bg-orange-50 p-4"><div className="flex items-center gap-2 text-xs font-bold text-orange-800"><AlertTriangle size={16} />Confirmation overdue</div><p className="mt-1 text-[11px] leading-5 text-orange-700">Inventory remains blocked until staff confirms, extends, cancels, or expires this pencil booking.</p></div>}{canOperate ? <div className="mt-7"><SectionLabel number="" title="Quick actions" /><div className="mt-4 flex flex-wrap gap-2">{reservation.status === "confirmed" && <Button onClick={() => onUpdate({ ...reservation, status: "arrived" })}>Mark arrived</Button>}{reservation.status === "arrived" && <Button onClick={() => onUpdate({ ...reservation, status: "seated" })}>Mark seated</Button>}{reservation.status === "seated" && <Button onClick={() => onUpdate({ ...reservation, status: "completed" })}>Complete</Button>}{["temporary_hold", "pending_confirmation", "pending_deposit"].includes(reservation.status) && <Button onClick={() => onUpdate({ ...reservation, status: "confirmed" })}>Confirm booking</Button>}<Button variant="outline">Assign table</Button><Button variant="outline">Record deposit</Button><Button variant="ghost">More actions</Button></div></div> : <div className="mt-7 rounded-lg border border-border bg-[var(--secondary)] p-4 text-xs text-[#626266]"><ShieldCheck size={15} className="mr-2 inline" />Owner access is view-only. Operational actions are hidden.</div>}<div className="mt-8"><SectionLabel number="" title="Activity timeline" /><div className="mt-4 space-y-0"><Timeline title="Reservation created" body={`via ${reservation.source} by Mika Reyes`} time="07 Aug · 10:14 AM" /><Timeline title={statusLabel[reservation.status]} body="Current booking status" time="07 Aug · 10:16 AM" last /></div></div></div></aside></div>;
}

function Detail({ icon, label, value }: { icon: ReactNode; label: string; value: string }) { return <div className="rounded-lg border border-[var(--border)] bg-card p-3"><div className="flex items-center gap-1.5 text-[9px] font-bold uppercase tracking-[.08em] text-[var(--muted-foreground)]">{icon}{label}</div><div className="mt-1.5 truncate text-xs font-semibold capitalize text-[var(--secondary-foreground)]">{value}</div></div>; }
function Timeline({ title, body, time, last }: { title: string; body: string; time: string; last?: boolean }) { return <div className="grid grid-cols-[20px_1fr] gap-3"><div className="flex flex-col items-center"><span className="mt-1.5 h-2.5 w-2.5 rounded-full border-2 border-[#e58a1e] bg-card" />{!last && <span className="h-12 w-px bg-[#e0e4df]" />}</div><div className="pb-5"><div className="text-xs font-bold text-[#42514e]">{title}</div><div className="mt-0.5 text-[11px] text-[#788481]">{body}</div><div className="mt-1 text-[9px] uppercase tracking-wide text-[#9aa3a1]">{time}</div></div></div>; }

function formatTime(value: string) { const [hour, minute] = value.split(":").map(Number); return `${hour % 12 || 12}:${String(minute).padStart(2, "0")} ${hour >= 12 ? "PM" : "AM"}`; }
