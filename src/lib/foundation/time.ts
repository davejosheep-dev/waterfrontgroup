import { formatInTimeZone, fromZonedTime } from "date-fns-tz";

export function serviceDateAtVenue(instant: string | Date, ianaTimezone: string) {
  return formatInTimeZone(instant, ianaTimezone, "yyyy-MM-dd");
}

export function venueLocalDateTimeToUtc(serviceDate: string, localTime: string, ianaTimezone: string) {
  return fromZonedTime(`${serviceDate}T${localTime}:00`, ianaTimezone);
}

export function formatVenueDateTime(instant: string | Date, ianaTimezone: string) {
  return formatInTimeZone(instant, ianaTimezone, "yyyy-MM-dd HH:mm XXX");
}
