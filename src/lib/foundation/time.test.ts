import { describe, expect, it } from "vitest";
import { formatVenueDateTime, serviceDateAtVenue, venueLocalDateTimeToUtc } from "./time";

describe("venue-local time", () => {
  it("keeps the venue service date across a UTC boundary", () => {
    expect(serviceDateAtVenue("2026-08-06T16:30:00Z", "Asia/Manila")).toBe("2026-08-07");
  });

  it("uses the correct offset after a daylight-saving transition", () => {
    expect(formatVenueDateTime("2026-03-08T07:30:00Z", "America/New_York")).toBe("2026-03-08 03:30 -04:00");
  });

  it("converts venue-local input to a UTC instant", () => {
    expect(venueLocalDateTimeToUtc("2026-08-07", "19:00", "Asia/Manila").toISOString()).toBe("2026-08-07T11:00:00.000Z");
  });
});
