// Copied from packages/libs/src/rrule-schedule.ts to avoid adding @kaneo/libs as
// an API dependency (keeps the esbuild bundle dependency-free). Keep in sync with
// the source if the schedule math ever changes.

export type WorkspaceRruleSchedule = {
  timezone: string;
  runAtHour: number;
  runAtMinute: number;
};

export const DEFAULT_WORKSPACE_RRULE_SCHEDULE: WorkspaceRruleSchedule = {
  timezone: "UTC",
  runAtHour: 9,
  runAtMinute: 0,
};

export function isValidIanaTimezone(timezone: string): boolean {
  try {
    Intl.DateTimeFormat(undefined, { timeZone: timezone }).format(new Date());
    return true;
  } catch {
    return false;
  }
}

export function assertValidWorkspaceRruleSchedule(
  schedule: WorkspaceRruleSchedule,
): void {
  if (!isValidIanaTimezone(schedule.timezone)) {
    throw new Error(`Invalid timezone: ${schedule.timezone}`);
  }
  if (
    !Number.isInteger(schedule.runAtHour) ||
    schedule.runAtHour < 0 ||
    schedule.runAtHour > 23
  ) {
    throw new Error(`Invalid runAtHour: ${schedule.runAtHour}`);
  }
  if (
    !Number.isInteger(schedule.runAtMinute) ||
    schedule.runAtMinute < 0 ||
    schedule.runAtMinute > 59
  ) {
    throw new Error(`Invalid runAtMinute: ${schedule.runAtMinute}`);
  }
}

export function parseWorkspaceRruleSchedule(
  source?: {
    rruleTimezone?: string | null;
    rruleRunAtHour?: number | null;
    rruleRunAtMinute?: number | null;
  } | null,
): WorkspaceRruleSchedule {
  const timezone =
    typeof source?.rruleTimezone === "string" && source.rruleTimezone.trim()
      ? source.rruleTimezone.trim()
      : DEFAULT_WORKSPACE_RRULE_SCHEDULE.timezone;
  const runAtHour =
    typeof source?.rruleRunAtHour === "number" &&
    Number.isInteger(source.rruleRunAtHour) &&
    source.rruleRunAtHour >= 0 &&
    source.rruleRunAtHour <= 23
      ? source.rruleRunAtHour
      : DEFAULT_WORKSPACE_RRULE_SCHEDULE.runAtHour;
  const runAtMinute =
    typeof source?.rruleRunAtMinute === "number" &&
    Number.isInteger(source.rruleRunAtMinute) &&
    source.rruleRunAtMinute >= 0 &&
    source.rruleRunAtMinute <= 59
      ? source.rruleRunAtMinute
      : DEFAULT_WORKSPACE_RRULE_SCHEDULE.runAtMinute;

  return { timezone, runAtHour, runAtMinute };
}

function zonedWallTimeToUtc(
  year: number,
  month: number,
  day: number,
  hour: number,
  minute: number,
  timeZone: string,
): Date {
  const formatter = new Intl.DateTimeFormat("en-US", {
    timeZone,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
    hourCycle: "h23",
  });

  let guess = Date.UTC(year, month - 1, day, hour, minute, 0);

  for (let attempt = 0; attempt < 48; attempt++) {
    const parts = formatter.formatToParts(new Date(guess));
    const values: Record<string, string> = {};
    for (const part of parts) {
      if (part.type !== "literal") {
        values[part.type] = part.value;
      }
    }

    const actualYear = Number(values.year);
    const actualMonth = Number(values.month);
    const actualDay = Number(values.day);
    const actualHour = Number(values.hour);
    const actualMinute = Number(values.minute);

    if (
      actualYear === year &&
      actualMonth === month &&
      actualDay === day &&
      actualHour === hour &&
      actualMinute === minute
    ) {
      return new Date(guess);
    }

    const targetMinutes = hour * 60 + minute;
    const actualMinutes = actualHour * 60 + actualMinute;
    const dayOffsetMinutes = (actualDay - day) * 24 * 60;
    const monthOffsetMinutes = (actualMonth - month) * 31 * 24 * 60;
    const yearOffsetMinutes = (actualYear - year) * 365 * 24 * 60;
    const deltaMinutes =
      targetMinutes -
      actualMinutes -
      dayOffsetMinutes -
      monthOffsetMinutes -
      yearOffsetMinutes;

    guess += deltaMinutes * 60 * 1000;
  }

  return new Date(guess);
}

/** Calendar date (local Y-M-D) + workspace wall-clock -> UTC instant. */
export function zonedScheduleToUtc(
  calendarDate: Date,
  schedule: WorkspaceRruleSchedule,
): Date {
  assertValidWorkspaceRruleSchedule(schedule);
  return zonedWallTimeToUtc(
    calendarDate.getFullYear(),
    calendarDate.getMonth() + 1,
    calendarDate.getDate(),
    schedule.runAtHour,
    schedule.runAtMinute,
    schedule.timezone,
  );
}
