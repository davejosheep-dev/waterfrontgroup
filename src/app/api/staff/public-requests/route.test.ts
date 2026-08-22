import { beforeEach, describe, expect, test, vi } from "vitest";
import type { AccessContext, AccessRole } from "@/lib/access-control";

vi.mock("@/lib/access-context", () => ({ getCurrentAccessContext: vi.fn() }));
vi.mock("@/lib/public-store", () => ({
  listPublicRequests: vi.fn(() => [{ id: "pr-1", fullName: "Fictional Guest", mobile: "0917 000 0000" }]),
  staffRequestAction: vi.fn(() => ({ ok: true })),
}));

const { getCurrentAccessContext } = await import("@/lib/access-context");
const { listPublicRequests, staffRequestAction } = await import("@/lib/public-store");
const { GET, PATCH } = await import("./route");

function contextFor(role: AccessRole): AccessContext {
  return { role, fullName: "Test Person", conceptId: null, conceptName: "All concepts", isDemo: false };
}

function patchRequest() {
  return new Request("http://localhost/api/staff/public-requests", {
    method: "PATCH",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ requestId: "pr-1", action: "review" }),
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
  }) as any;
}

beforeEach(() => {
  vi.clearAllMocks();
});

describe("public requests queue authorization", () => {
  // A Supabase session is not evidence of employment: self-registration means
  // anyone can hold one. Only an active staff profile resolves a context.
  test("a caller without a staff profile cannot read the queue", async () => {
    vi.mocked(getCurrentAccessContext).mockResolvedValue(null);
    const response = await GET();
    expect(response.status).toBe(401);
    expect(listPublicRequests).not.toHaveBeenCalled();
  });

  test("a caller without a staff profile cannot act on a request", async () => {
    vi.mocked(getCurrentAccessContext).mockResolvedValue(null);
    const response = await PATCH(patchRequest());
    expect(response.status).toBe(401);
    expect(staffRequestAction).not.toHaveBeenCalled();
  });

  test("no guest contact details appear in an unauthorized response", async () => {
    vi.mocked(getCurrentAccessContext).mockResolvedValue(null);
    const body = await (await GET()).text();
    expect(body).not.toMatch(/Fictional Guest|0917/);
  });

  test.each(["superadmin", "owner", "manager", "staff"] as const)("%s can read the queue", async (role) => {
    vi.mocked(getCurrentAccessContext).mockResolvedValue(contextFor(role));
    const response = await GET();
    expect(response.status).toBe(200);
    expect(listPublicRequests).toHaveBeenCalled();
  });

  // Owner is read-only oversight, so reaching the screen is not enough to
  // review, decline, or convert a request into a reservation.
  test("owner cannot act on a request despite being able to read it", async () => {
    vi.mocked(getCurrentAccessContext).mockResolvedValue(contextFor("owner"));
    const response = await PATCH(patchRequest());
    expect(response.status).toBe(403);
    expect(staffRequestAction).not.toHaveBeenCalled();
  });

  test.each(["superadmin", "manager", "staff"] as const)("%s can act on a request", async (role) => {
    vi.mocked(getCurrentAccessContext).mockResolvedValue(contextFor(role));
    const response = await PATCH(patchRequest());
    expect(response.status).toBe(200);
    expect(staffRequestAction).toHaveBeenCalled();
  });
});
