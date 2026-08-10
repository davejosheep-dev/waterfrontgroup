# Waterfront Hospitality Platform — Baseline Product Design Specification

## Codex assignment

Use this document as the baseline visual and interaction design for the entire Waterfront Hospitality Group platform.

You are not designing a generic SaaS dashboard. You are designing a calm, precise hospitality operations system for reservation staff, hosts, managers, accounting reviewers, event coordinators, marketers, and guests.

The application includes, or will eventually include:

- Restaurant reservations and availability.
- Public booking requests and guest self-service.
- Manual payment recording and verification.
- Guest CRM, consent, segmentation, and marketing.
- Event sales and venue operations.
- Day-of floor operations, walk-ins, and waitlist.
- Reports, configuration, audit, and administration.

Inspect the repository, existing components, routes, feature flags, business specifications, and working behavior before editing. Preserve all domain logic, authorization, accessibility, tests, and user data. Apply this design incrementally instead of replacing working application logic with a mockup.

Build the real reusable application shell, tokens, components, and representative pages. Do not stop after writing a design plan.

If the repository is empty, use:

- Next.js App Router and TypeScript.
- Tailwind CSS.
- shadcn/ui using the `new-york` style and Radix primitives.
- Lucide icons.
- Geist Sans for interface text.
- Geist Mono only for IDs, reference numbers, timestamps, tabular figures, and technical values.
- Recharts only where a chart materially improves understanding.

If shadcn/ui is not initialized, use the current non-interactive initialization method. Do not reinitialize or overwrite an existing component system blindly.

---

## 1. Reference synthesis

The attached references establish the visual direction. Extract their shared principles rather than copying their content, logos, layouts, or brand names.

### Adopt from the references

- A light, warm-neutral application canvas.
- A stable left navigation and thin top utility bar.
- White operational surfaces separated by subtle borders.
- Compact but readable cards and tables.
- Clear page title, breadcrumbs, filters, and primary action hierarchy.
- Quiet iconography and small contextual menus.
- Dashboard sections organized into a deliberate grid.
- Selective use of one accent color rather than colorful decoration everywhere.
- Master-detail layouts for queues and review workflows.
- Right-side contextual panels for details that should remain visible while working.
- Dense lists with strong alignment, muted supporting text, and concise badges.
- Soft rounded corners without excessive pill-shaped containers.
- Charts with thin lines, restrained fills, readable tooltips, and direct labels.

### Adapt for Waterfront

- Replace generic finance/project metrics with reservations, covers, availability, deposits, guest activity, events, and campaign data.
- Prioritize dates, times, party sizes, areas, ownership, and statuses.
- Make day-of operations faster than a decorative executive dashboard.
- Use master-detail patterns for public request review, payment verification, and campaign review.
- Use timelines and resource grids where hospitality work depends on sequence and availability.
- Make alerts operational and actionable, not ornamental.
- Use warm hospitality character while preserving the precision of an enterprise tool.

### Do not reproduce

- The companies, people, sample records, logos, exact charts, or copy shown in the references.
- “Upgrade plan,” billing prompts, or unrelated SaaS features.
- Desktop wallpaper or scenic backgrounds behind the production application.
- Tiny low-contrast text used only to make a screenshot look refined.
- Gratuitous gradients, glassmorphism, neon effects, or excessive shadows.
- A different visual system for every module.

All examples and seed content must refer only to Waterfront Hospitality Group and its hospitality operations.

---

## 2. Design intent

The interface should feel:

- **Calm:** low visual noise during busy service periods.
- **Operational:** important actions and exceptions are immediately visible.
- **Warm:** more hospitable than an accounting application, without becoming decorative.
- **Trustworthy:** clear state, history, permissions, and confirmations.
- **Efficient:** optimized for keyboard, tablet, and repeated staff workflows.
- **Scalable:** the same shell supports reservations, CRM, payments, events, and reporting.

The default visual impression is a refined hospitality operations desk: warm white, soft stone surfaces, dark ink text, deep waterfront teal, and small warm coral highlights.

Avoid the common “AI-generated dashboard” look. Do not fill every page with four metric cards, random charts, large gradients, floating blobs, or meaningless percentage changes.

---

## 3. Product design principles

1. **Operations before decoration.** The next reservation, unresolved conflict, unverified payment, or overdue follow-up matters more than ornamental analytics.
2. **One obvious primary action.** Each page has at most one visually dominant action.
3. **Progressive disclosure.** Lists show what staff needs to scan; full context opens in a panel or detail page.
4. **Status must be explicit.** Never communicate state using color alone.
5. **The application remembers context.** Preserve selected outlet, date, filters, scroll position, and entered form data where safe.
6. **Consequential actions require intent.** Cancellation, no-show, payment rejection, refund, merge, override, and campaign send use clear confirmation patterns.
7. **Dense does not mean cramped.** Use compact spacing with readable type and generous click targets.
8. **Role-aware, not confusing.** Hide unavailable modules, but show a clear access-denied state if a direct route is opened.
9. **Mobile adapts the workflow.** Do not squeeze desktop tables onto a phone.
10. **Data definitions are visible.** Metrics show period, timezone, source, and freshness when relevant.

---

## 4. Application shell

### Desktop shell

Use a full-height application shell with:

- Warm-neutral page background.
- Fixed left sidebar: `248px` expanded, `72px` collapsed.
- Top bar: `56px` to `60px` high.
- Main content with a maximum readable width of approximately `1600px`, while timeline/resource-grid pages may use the full available width.
- `20px` to `24px` desktop content padding.
- A subtle one-pixel border between sidebar, header, and content.
- No large drop shadow around the entire application in normal production use.

On very wide screens, center the content region while keeping the sidebar fixed. Do not stretch text tables so far that rows become hard to scan.

### Sidebar

The sidebar contains:

1. Waterfront wordmark or approved logo.
2. Outlet switcher when the user has access to more than one outlet.
3. Primary navigation grouped by workflow.
4. Settings/support near the bottom.
5. Signed-in user menu anchored at the bottom.

Navigation groups:

- **Operations**
  - Overview
  - Today
  - Reservations
  - Calendar
  - Booking Requests
  - Waitlist, only when enabled
- **Guests**
  - Guest Directory
  - CRM Overview, only when enabled
- **Events**
  - Event Pipeline
  - Event Calendar
  - Only show when the module is enabled
- **Finance**
  - Payments
  - Verification Queue
  - Reconciliation
  - Only show permitted entries
- **Marketing**
  - Segments
  - Campaigns
  - Only show when enabled and permitted
- **Insights**
  - Reports
- **Administration**
  - Configuration
  - Team and Access
  - Audit Log

Do not show empty future navigation items. Navigation is controlled by feature flag, capability, and outlet assignment.

Sidebar item rules:

- Icon size: `16px` to `18px`.
- Row height: `36px` to `40px`.
- Active item: subtle teal-tinted background, dark text, and a small leading indicator or stronger icon—not a saturated block.
- Badges show actionable counts such as unreviewed requests, not decorative totals.
- Group labels use quiet uppercase or small sentence case, never excessive letter spacing.
- Collapsed mode uses tooltips and preserves visible alert badges.

### Top bar

The top bar includes:

- Breadcrumbs or module context on the left.
- Global search/command trigger near the center or left-center.
- Optional operational date selector on relevant pages.
- Notifications.
- Help.
- User menu.

The outlet selector belongs in the sidebar, not repeated on every page. The top bar stays visually quiet.

Global search opens a `CommandDialog` and supports guests, reservations, reservation codes, mobile/email, event references, and permitted settings. Results are grouped and keyboard navigable.

### Page header

Every primary page uses one consistent header:

- Breadcrumb, when useful.
- Page title.
- One-sentence operational description only when it adds context.
- Status or last-updated indicator when relevant.
- Secondary actions.
- One primary action aligned right.

On mobile, actions wrap below the title; the primary action remains easy to reach.

---

## 5. Responsive behavior

### Breakpoints

- Small/mobile: below `768px`.
- Medium/tablet: `768px` to `1199px`.
- Desktop: `1200px` and above.

Use the project's Tailwind breakpoints if already established, but preserve these behavioral tiers.

### Mobile

- Replace the sidebar with a navigation `Sheet` opened from the top bar.
- Keep a compact top bar with page title, search, notifications, and menu.
- Convert data tables into structured list cards when horizontal scanning would fail.
- Use bottom sheets or full-screen sheets for filters and quick actions.
- Sticky bottom action bars are allowed for reservation save, status actions, or guest self-service.
- Avoid more than two side-by-side controls.
- Use a minimum interactive target of `44px` where practical.

### Tablet

- Support front-desk landscape use as a first-class layout.
- Allow collapsed sidebar.
- Master-detail pages may show list plus detail, but hide tertiary panels.
- Reservation timelines remain horizontally scrollable with sticky labels.

### Desktop

- Use split views where they reduce back-and-forth navigation.
- Keep filters and critical column headers sticky on long operational pages.
- Preserve keyboard navigation and visible focus.

---

## 6. Design tokens

Use semantic CSS variables and Tailwind theme tokens. Do not scatter arbitrary hex colors throughout components.

### Light theme — required baseline

Suggested modern shadcn/Tailwind starting values; adapt the variable mapping to the repository's existing theme conventions and verify contrast before shipping:

```css
:root {
  --background: oklch(0.97 0.01 85);
  --foreground: oklch(0.24 0.025 170);

  --card: oklch(1 0 0);
  --card-foreground: oklch(0.24 0.025 170);

  --popover: oklch(1 0 0);
  --popover-foreground: oklch(0.24 0.025 170);

  --primary: oklch(0.49 0.08 185);
  --primary-foreground: oklch(1 0 0);

  --secondary: oklch(0.95 0.015 85);
  --secondary-foreground: oklch(0.29 0.025 170);

  --muted: oklch(0.95 0.012 85);
  --muted-foreground: oklch(0.52 0.02 175);

  --accent: oklch(0.69 0.15 45);
  --accent-foreground: oklch(1 0 0);

  --destructive: oklch(0.56 0.19 30);
  --destructive-foreground: oklch(1 0 0);

  --border: oklch(0.91 0.012 85);
  --input: oklch(0.87 0.014 85);
  --ring: oklch(0.49 0.08 185);

  --radius: 0.625rem;
}
```

Approximate visual palette:

- Canvas: warm ivory `#F7F5F0`.
- Surface: white `#FFFFFF`.
- Primary ink: deep green-black `#172321`.
- Muted ink: stone-gray `#66716E`.
- Waterfront teal: approximately `#216E68`.
- Warm accent: approximately `#E8794C`.
- Border: approximately `#E5E1D9`.

Use the teal for primary actions, active navigation, selected controls, and core chart series. Use warm coral sparingly for attention, selected chart comparison, or hospitality warmth—not for every button.

### Dark theme

Dark mode is optional for the initial release. If implemented, create a complete accessible token set; do not mechanically invert colors. Light mode remains the baseline because front-desk and office environments benefit from clarity and print-like scanning.

### Semantic operational colors

Create tokens rather than direct Tailwind palette usage:

- Success/confirmed/completed: deep accessible green.
- Warning/hold/pending review: amber.
- Danger/conflict/overdue/rejected: red.
- Informational/new/in review: blue.
- Neutral/draft/inactive: stone gray.
- VIP/special attention: restrained plum or gold, used with a text label.

Status colors must pass contrast requirements and always appear with readable text and, where helpful, an icon.

### Radius

- Inputs and buttons: `8px` to `10px`.
- Cards/panels: `10px` to `12px`.
- Large modal/sheet: `12px` to `16px`.
- Badges: compact rounded rectangle, not an oversized capsule.

Do not mix many radius styles.

### Borders and shadows

- Default separation is a one-pixel border.
- Cards use no shadow or a barely visible `shadow-xs`.
- Menus, popovers, dialogs, and floating tooltips may use a restrained shadow.
- Focus rings are visible and use the primary token.
- Never rely on shadow alone to separate interactive surfaces.

---

## 7. Typography and numbers

Use Geist Sans or the project's existing approved sans-serif.

Recommended scale:

- Page title: `24px`, weight `600`, tight but readable line height.
- Major dashboard number: `28px` to `32px`, weight `600`.
- Section heading: `15px` to `17px`, weight `600`.
- Body/table text: `14px`.
- Supporting metadata: `12px` to `13px`.
- Labels: `12px` to `13px`, weight `500`.
- Never use body text below `12px`.

Use sentence case. Avoid all-uppercase headings except very quiet small category labels.

Use tabular numerals for:

- Times.
- Dates in dense tables.
- Reservation codes.
- Payment references.
- Guest counts.
- Currency.
- Dashboard metrics.

Use Geist Mono sparingly for reference codes such as `WSC-2026-0184`, not for ordinary paragraphs.

Display Philippine pesos with `₱`, appropriate grouping, and no false decimal precision. Display all operational time using the configured outlet timezone; Waterfront Seafood defaults to `Asia/Manila`.

---

## 8. Spacing and density

Use a four-pixel spacing foundation.

- Compact control gaps: `8px`.
- Related content gaps: `12px` to `16px`.
- Card padding: `16px` in operational views, `20px` to `24px` in summaries.
- Section gap: `20px` to `24px`.
- Page gap: `24px`.
- Table row height: generally `44px` to `52px`.

Dashboard pages may use comfortable density. Reservation lists, payment queues, and calendars use compact density. Do not mix densities randomly inside one page.

Avoid nesting cards inside cards. Use sections, separators, or a split grid inside a single card when content belongs together.

---

## 9. Core component system

Build reusable domain components by composing shadcn/ui primitives. Do not create a custom raw `div` version of a primitive that already exists.

### Foundations

- `AppShell`
- `AppSidebar`
- `TopBar`
- `PageHeader`
- `Breadcrumbs`
- `OutletSwitcher`
- `GlobalCommand`
- `ModuleTabs`
- `FilterBar`
- `ResponsivePageActions`

### Data display

- `MetricCard`
- `MetricStrip`
- `StatusBadge`
- `SourceBadge`
- `GuestIdentity`
- `ReservationSummary`
- `MoneyValue`
- `DateTimeValue`
- `DataTable`
- `MobileRecordList`
- `ActivityTimeline`
- `AuditEvent`
- `DefinitionTooltip`
- `EmptyState`
- `ErrorState`
- `LoadingSkeleton`

### Reservation operations

- `ReservationCard`
- `ReservationStatusMenu`
- `AvailabilityResult`
- `CapacityMeter`
- `ResourceTimeline`
- `TableAssignmentPicker`
- `ConflictAlert`
- `PencilHoldIndicator`
- `DepositStatus`
- `GuestArrivalActions`

### Review workflows

- `QueueList`
- `ReviewWorkspace`
- `EvidenceViewer`
- `DecisionPanel`
- `AssignmentControl`
- `ReasonDialog`
- `ApprovalTimeline`

### Forms

- `FormSection`
- `FieldGroup`
- `ContactField`
- `DateTimeField`
- `GuestCountField`
- `CurrencyField`
- `InlineValidationSummary`
- `StickyFormActions`

### Overlays

- Use `Sheet` for quick create/edit and contextual details.
- Use `Dialog` for focused non-destructive workflows.
- Use `AlertDialog` for destructive or consequential confirmation.
- Use `Popover` for date, table, owner, and compact filter pickers.
- Use `DropdownMenu` for secondary row actions.
- Use `Tooltip` only for supplemental information, never required instructions.

### Feedback

- Toasts confirm completed lightweight actions.
- Inline banners explain blocking or persistent issues.
- Field errors sit beside the affected control.
- A toast must not be the only place a critical error appears.

---

## 10. Status design

Define one canonical component and mapping for statuses. Avoid each screen inventing its own colors.

### Reservation examples

- Draft: neutral.
- Temporary Hold / Pencil Booking: amber with clock icon.
- Pending Confirmation: blue.
- Pending Deposit: amber.
- Confirmed: green.
- Arrived: teal-blue.
- Seated: deep teal.
- Completed: subdued green.
- Cancelled: neutral with strike/cancel icon.
- No-show: red.
- Expired: gray-red.
- Conflict: red with warning icon.

### Payment examples

- Draft: neutral.
- Submitted for Verification: blue.
- Verified: green.
- Rejected: red.
- Voided: gray.
- Partially Refunded: amber.
- Refunded: purple-gray.

### Campaign examples

- Draft: neutral.
- In Review: blue.
- Approved: green.
- Scheduled: teal.
- Sending: blue with progress.
- Paused: amber.
- Completed: subdued green.
- Failed: red.
- Cancelled: gray.

Badges include text. Icons are optional and consistent. Do not animate ordinary statuses; reserve animation for genuinely active processing.

---

## 11. Page patterns

### A. Overview dashboard

Use the references' composed dashboard rhythm, adapted to real hospitality priorities.

Header:

- Greeting or `Operations Overview`.
- Current outlet.
- Local operational date.
- Primary action: `New Reservation`.

First row:

- Today's reservations.
- Expected covers.
- Confirmed versus holds.
- Pending deposits or unresolved actions.

Main grid:

- **Today's service timeline:** reservations grouped by time/service period.
- **Capacity outlook:** covers or occupancy by hour, not generic revenue bars.
- **Attention required:** expiring holds, conflicts, overdue deposits, VIP arrivals, unreviewed public requests.
- **Upcoming private events:** next relevant closures or major bookings.
- **Recent activity:** concise staff activity stream.

Use at most one or two charts above the fold. If a table or ordered list answers the question better, use it.

Every metric card must be clickable when it leads to a meaningful filtered view.

### B. Today's reservations

This is the fastest operational page.

- Sticky date/service controls.
- Compact summary strip.
- Toggle between timeline and list.
- Filters for status, area, owner, booking type, source, and attention required.
- Rows show time, guest, party size, area/table, occasion, deposit, status, and owner.
- Primary row click opens a right-side detail sheet on desktop.
- Quick status actions are available without opening a full edit form.
- Conflicts and special requests are unmistakable.

Do not force staff through dashboard cards to reach the reservation list.

### C. Reservation calendar and resource timeline

- Day is the default operational view.
- Week view may summarize by service period.
- Resource labels remain sticky on the left.
- Time axis remains sticky at the top.
- Reservations are blocks with guest, pax, status, and deposit indicator.
- Do not rely on block color alone.
- Current time has a subtle line.
- Blocked resources and whole-restaurant private events are visibly distinct.
- Selecting a block opens the reservation detail sheet.
- Drag-and-drop is disabled unless implemented safely with conflict revalidation and accessible alternatives.

### D. Availability search

Use a focused search-first composition:

- Date, start time, duration, party size, booking type, and desired area.
- Results grouped as available, available with conditions, or unavailable.
- Each result explains capacity, table/area implications, buffers, and deposit expectations.
- Primary action creates a reservation using the selected availability snapshot, followed by server revalidation.
- Conflict errors preserve entered information and return the user to relevant results.

### E. Quick reservation form

Use a `Sheet` on large screens when launched from Today/Calendar. Use a full page on mobile or for complex private events.

Sections:

1. Guest search or create.
2. Reservation date/time/party.
3. Area and optional table assignment.
4. Occasion and requests.
5. Hold/confirmation/deposit.
6. Source and ownership.

Keep commonly used fields visible. Put advanced/internal options behind a clear secondary section—not hidden in an ambiguous accordion.

Sticky footer:

- Cancel.
- Save as hold/draft where permitted.
- Primary submit action.

### F. Reservation detail

Header:

- Guest name.
- Reservation code.
- Status badge.
- Date/time, party size, outlet/area.
- Primary next action based on state.

Desktop grid:

- Main column: overview, requests, table/resource assignment, payment summary, activity timeline.
- Side column: guest summary, owner, source, occasion, upcoming actions.

Use tabs only when content volume requires them: Overview, Payments, Messages, History.

Consequential actions sit in an overflow menu or clearly separated danger zone.

### G. Public booking request queue

Use a master-detail layout inspired by the inbox reference:

- Left/main list: request status filters and request cards/rows.
- Center: full request details, guest-supplied information, availability snapshot, and internal review notes.
- Right context panel on wide desktop: guest match, assignment, source, timeline, and decision summary.

On smaller screens, use list → detail navigation and sheets.

Actions:

- Assign.
- Request more information.
- Propose alternative.
- Convert to reservation.
- Decline/close with reason.

Do not make the screen resemble a chat inbox unless actual bidirectional messaging exists.

### H. Payment verification queue

Use a serious, evidence-focused master-detail workspace:

- Queue with amount, channel, reservation, recorder, age, and warning flags.
- Large proof viewer with zoom and safe download where permitted.
- Entered transaction data displayed beside proof.
- Verification checklist.
- Duplicate reference/proof warnings.
- Decision panel with Verify and Reject actions.

Verified is the positive primary action only after every required check. Rejection uses a required reason dialog. Proof never appears as a tiny decorative thumbnail when staff must inspect it.

### I. Guest directory and profile

Directory:

- Search-first page.
- Table/list with guest, primary contact, last completed visit, upcoming reservation, visits, consent summary, and duplicate warning.
- Filters remain constrained and relevant.

Profile:

- Clear identity header and contact points.
- Upcoming reservations before historical analytics.
- Structured preferences and important service notes.
- Visit/reservation history.
- Consent and communication state.
- Tags and guest status.
- Marketing history only for authorized roles.

Sensitive operational notes and payment details are permissioned and visually separated.

### J. Events pipeline

When enabled, use:

- Pipeline/Kanban view for sales stages.
- Calendar view for venue/resource occupancy.
- List view for reporting and bulk review.
- Event detail with client, venue, schedule, setup/teardown, package, proposal, payments, tasks, and activity.

Pipeline cards show event date, client, pax, venue, value/minimum consumable where valid, stage, owner, and next action. Do not overload cards with full event details.

Keep event status vocabulary separate from restaurant reservation statuses.

### K. CRM segments and campaigns

Segment builder:

- Rule builder on the left/main column.
- Live estimate and eligibility/exclusion summary on the right.
- Plain-language rule summary.
- Sample audience only for permitted roles.

Campaign editor:

- Step-based workflow: Content → Audience → Review → Schedule.
- Content preview beside editor on desktop.
- Test send clearly separated from production approval.
- Review page shows immutable content version, audience count, exclusions, consent state, sender, schedule, and approver.
- Sending/completed report prioritizes delivery, bounce, complaint, unsubscribe, and failure—not vanity metrics.

### L. Reports

- Page-level date and outlet filters.
- Small set of clearly defined metrics.
- One primary chart with supporting table where useful.
- Export action is secondary, permission-controlled, and audited.
- Definitions and freshness are accessible through an info tooltip or visible note.
- Never represent deposits as revenue.

### M. Configuration and settings

Use vertical settings navigation or tabs plus one card/form group per concern:

- Outlet information.
- Operating hours.
- Areas and tables.
- Reservation policies.
- Deposit/payment channels.
- Messaging.
- CRM/marketing policies.
- Users and access.
- Feature flags.

Show unsaved changes and keep Save actions close to the edited section. Consequential policy changes require confirmation and audit.

### N. Sign-in

- Centered, restrained sign-in card on warm-neutral background.
- Waterfront identity and environment indicator.
- Email/password or configured authentication controls.
- Clear error and recovery flow.
- No scenic stock photography, sales copy, or dashboard screenshot required.

### O. Public guest booking and self-service

The public surface shares typography, colors, controls, and accessibility but does not use the internal sidebar.

- Waterfront-branded compact header.
- Narrow focused content width: approximately `640px` to `760px`.
- Step indicator for multi-step request flow.
- Large, plain-language fields.
- Availability/request wording that never promises instant confirmation when staff review is required.
- Clear acknowledgement and secure status pages.
- Guest preference/unsubscribe pages remain minimal and privacy-safe.

The guest experience should feel more spacious and welcoming than the staff dashboard.

---

## 12. Tables and lists

Use tables for comparison and scanning; use cards for responsive summaries and heterogeneous content.

Table rules:

- Sticky header on long pages.
- Checkbox column only when valid bulk actions exist.
- Primary identity in the first meaningful column.
- Right-align numeric values.
- Use tabular numerals.
- Status near the right side, followed by row action menu.
- Row click opens details; embedded controls remain independently operable.
- Hover is subtle and not required to discover actions.
- Sort direction is visible and accessible.
- Filters show active state and can be cleared individually or together.
- Pagination includes current range and total where available.
- Preserve filters in the URL when useful.

Do not truncate critical guest names, time, status, or amounts without a way to reveal them. Avoid horizontal scroll for ordinary desktop tables; prioritize columns and move secondary data into detail views.

---

## 13. Forms and validation

- Labels are always visible; placeholders do not replace labels.
- Required fields are indicated consistently.
- Provide examples or helper text only when needed.
- Validation happens at field level and on submit.
- Show a concise validation summary for long forms.
- Preserve valid entered data after server errors.
- Format mobile numbers, currency, and dates for display while submitting canonical values.
- Date/time fields state the outlet timezone.
- Autocomplete guest matches without exposing private data beyond staff permission.
- Prevent accidental double submit and show pending state.
- Disable a button only when the user can understand why; otherwise allow the action and explain validation.

Destructive actions use `AlertDialog`. Actions requiring an operational reason use a dedicated reason dialog with the consequences stated plainly.

---

## 14. Charts and data visualization

Charts are supporting evidence, not page decoration.

Use:

- Line charts for change over time.
- Bars for hourly covers, source comparison, or stage counts.
- Stacked bars only when composition matters.
- Donuts only for a small number of meaningful categories.
- Capacity meters for simple used/available context.

Rules:

- Use no more than four semantic colors in one chart.
- Use direct labels and accessible legends.
- Tooltips show full date/time, value, unit, and series.
- Do not use 3D charts.
- Do not use rainbow palettes.
- Do not smooth a line if smoothing could misrepresent operational data.
- Every chart has a text/table alternative for accessibility when the information is important.
- Skeletons match the chart footprint while loading.
- Empty charts explain why there is no data and what to do next.

---

## 15. Interaction and motion

- Use motion only to preserve spatial understanding: opening a sheet, expanding navigation, updating a chart, or reordering an item.
- Duration generally `120ms` to `220ms`.
- Respect `prefers-reduced-motion`.
- Avoid bouncing, glowing, pulsing, or looping decorative animation.
- Loading states use skeletons for page structure and small spinners only inside controls.
- Optimistic UI is allowed only for reversible low-risk actions. Reservation status, conflicts, payments, guest merges, and campaign approval wait for confirmed server success.

---

## 16. Empty, loading, error, and permission states

Every route and major component must include designed states.

### Empty

- Plain title.
- One-sentence explanation.
- Relevant next action when permitted.
- No oversized illustration required.

### Loading

- Preserve layout with skeletons.
- Avoid a blank whole-screen spinner.
- Announce longer operations to assistive technology.

### Error

- State what failed in operational language.
- Preserve user input.
- Offer Retry, return path, or support reference.
- Never expose raw database/provider messages.

### Access denied

- Explain that the account lacks access to the outlet or capability.
- Offer a route back.
- Do not reveal whether restricted data exists.

### Offline/degraded

- Clearly identify stale or unavailable live data.
- Do not let staff assume an availability check succeeded.
- Disable unsafe mutations while preserving draft input where possible.

---

## 17. Accessibility requirements

Target WCAG 2.2 AA.

- Full keyboard navigation.
- Visible focus rings.
- Logical heading hierarchy.
- Programmatic labels and descriptions.
- Proper table headers and captions where needed.
- Dialog focus trap and sensible return focus.
- Screen-reader announcements for dynamic status changes.
- Color contrast meeting AA.
- Status never conveyed by color alone.
- Charts have text summaries or accessible data.
- Touch targets approximately `44px` where practical.
- Error messages associate with fields.
- Reduced-motion support.
- Zoom to 200% without loss of essential functionality.
- No hover-only required interaction.

Test at least with keyboard, automated accessibility checks, and one screen-reader path for reservation creation, payment verification, and guest public request.

---

## 18. Implementation guidance

### shadcn/ui

Prefer these primitives:

- `Button`
- `Card`
- `Badge`
- `Table`
- `Tabs`
- `Sheet`
- `Dialog`
- `AlertDialog`
- `DropdownMenu`
- `Popover`
- `Command`
- `Tooltip`
- `Select`
- `Checkbox`
- `RadioGroup`
- `Switch`
- `Input`
- `Textarea`
- `Label`
- `Calendar`
- `Skeleton`
- `Alert`
- `Separator`
- `ScrollArea`
- `Avatar`

Own and customize the copied source responsibly. Keep foundational tokens in global CSS and domain composition in application components. Do not edit every primitive with page-specific logic.

### Suggested structure

Adapt to the repository rather than forcing these exact paths:

```text
src/
  app/
    (auth)/
    (staff)/
    (public)/
  components/
    ui/
    shell/
    shared/
    reservations/
    guests/
    payments/
    events/
    marketing/
    reports/
  lib/
    design/
    formatting/
    permissions/
  styles/
```

Create one canonical formatter for dates, times, currency, guest counts, mobile numbers, and reference codes.

Create one canonical status map instead of hardcoding status classes in pages.

### Component quality

- Components accept domain-safe props, not arbitrary styling flags for every use.
- Use composition before adding many variants.
- Forward refs where the primitive pattern requires them.
- Preserve accessibility behavior from Radix/shadcn primitives.
- Avoid unnecessary client components.
- Avoid global state for local panel/form state.
- Use URL state for shareable filters where appropriate.
- Provide test IDs only when semantic selectors are insufficient.

### Icons

- Use Lucide consistently.
- Default size `16px` or `18px`.
- Icons support text rather than replace important labels.
- Do not mix filled, outlined, colorful, and emoji icon sets.

### Reference assets

The attached images are inspiration only. Do not package them into the application or use them as production backgrounds.

If Waterfront's approved logo, photography, or formal brand guide is unavailable, use a clean text wordmark and the tokens in this document. Do not invent a permanent logo.

---

## 19. Representative implementation slice

If the application already exists, apply the system to the highest-value existing pages first. If starting from scratch, implement this representative slice before expanding:

1. Application shell with expanded/collapsed sidebar, top bar, outlet switcher, responsive mobile navigation, notifications placeholder, and global command interface.
2. Overview dashboard using hospitality data and states.
3. Today's reservations list/timeline with filters and right-side detail sheet.
4. Quick reservation form with validation, loading, conflict, and success states.
5. Public booking request master-detail queue.
6. Payment verification master-detail workspace.
7. Guest directory and profile.
8. Configuration page showing the settings pattern.
9. Public request-to-book flow and acknowledgement page.
10. Internal design-system route or component showcase, available only in development or authorized environments.

The showcase should display tokens, typography, buttons, fields, badges, statuses, cards, table rows, overlays, alerts, empty/error/loading states, and responsive examples. Do not expose it publicly in production unless intentionally authorized.

---

## 20. Design non-goals

- Do not redesign business workflows without explicit product authorization.
- Do not expose future modules merely to make the sidebar look complete.
- Do not copy the visual references pixel-for-pixel.
- Do not use scenic image backgrounds in the production staff interface.
- Do not introduce a dark-only design.
- Do not make all cards, controls, and badges pill-shaped.
- Do not add charts where a list or table is clearer.
- Do not create fake realtime data or mock successful mutations.
- Do not use lorem ipsum, unrelated businesses, foreign sample companies, or unrelated client names.
- Do not weaken RLS, permissions, server validation, audit, or confirmation flows for visual convenience.
- Do not process payments, auto-confirm bookings, or enable marketing merely because a button exists in the design.
- Do not implement a unified inbox unless a later functional specification explicitly authorizes it.

---

## 21. Acceptance criteria

The baseline design is accepted when:

1. All staff pages use one responsive application shell and coherent navigation.
2. The visual system clearly reflects the references without copying their brands or records.
3. Typography, spacing, radius, borders, shadows, and colors come from shared tokens.
4. The app uses Waterfront-specific hospitality content only.
5. Desktop, tablet landscape, and mobile layouts are intentionally designed.
6. Today's reservations can be scanned quickly without opening every record.
7. Public request and payment verification workflows use effective master-detail layouts.
8. Reservation, payment, request, event, and campaign statuses use a canonical accessible status system.
9. Tables support clear hierarchy, responsive fallback, filters, loading, empty, and error states.
10. Forms preserve user input after validation/server failure and show useful errors.
11. Consequential actions use the correct confirmation and required-reason patterns.
12. Charts are restrained, labeled, accessible, and connected to real definitions.
13. The public guest flow shares the brand system but is calmer and more spacious than staff screens.
14. Feature flags and permissions control navigation and actions.
15. No protected data becomes visible through redesigned components, charts, panels, or mobile layouts.
16. Keyboard navigation, focus management, contrast, screen-reader labels, and reduced-motion behavior meet the accessibility requirements.
17. Loading, empty, error, offline/degraded, and access-denied states are implemented—not left as plain text placeholders.
18. Existing tests and business workflows remain passing.
19. New shared components have appropriate component or integration tests.
20. A production build completes without TypeScript, lint, hydration, or accessibility errors attributable to the redesign.

---

## 22. Verification checklist for Codex

Before reporting completion:

1. Inspect the implementation at desktop, tablet landscape, and mobile widths.
2. Verify sidebar collapse and mobile navigation.
3. Verify every navigation item against role, outlet, and feature flag.
4. Test global search with keyboard only.
5. Test table scanning, filters, pagination, and row detail behavior.
6. Test reservation create/edit conflict and server-error states without losing form data.
7. Test public request review and payment verification master-detail workflows.
8. Test destructive and required-reason dialogs.
9. Test skeleton, empty, error, access-denied, and degraded states.
10. Run automated accessibility checks and manually verify focus order.
11. Confirm no reference-image assets, unrelated companies, or placeholder SaaS copy were shipped.
12. Confirm no production payment, messaging, marketing, or future-module capability was enabled by design work alone.
13. Run lint, type-check, tests, and production build.
14. Summarize changed components/routes, screenshots or viewport verification performed, known exceptions, and next recommended design work.

---

## 23. Deliberate design decisions

These decisions are intentional:

- Light mode is the primary operational theme.
- The shell uses one left sidebar, not a permanent double-sidebar or icon rail plus duplicate navigation.
- Deep teal is the main Waterfront action/selection color; warm coral is secondary and sparing.
- Borders establish hierarchy more often than shadows.
- Cards are quiet and functional.
- The dashboard is hospitality-specific and action-oriented.
- Master-detail is the baseline for review queues.
- The public guest experience is visually related but structurally simpler.
- Visual density changes by workflow, not randomly by component.
- Graphical floor-plan and complex drag-and-drop interactions are implemented only when authorized by their functional phase.
- Future modules remain hidden until enabled.
- The design system never overrides business safeguards.

If approved Waterfront brand assets or an existing mature component system conflict with the suggested palette or typography, preserve the interaction and layout principles, document the conflict, and adapt the tokens rather than building two competing design systems.
