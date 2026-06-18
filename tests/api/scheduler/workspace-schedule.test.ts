import { describe, expect, it } from "vitest";
import {
  DEFAULT_WORKSPACE_RRULE_SCHEDULE,
  parseWorkspaceRruleSchedule,
  zonedScheduleToUtc,
} from "../../../apps/api/src/scheduler/workspace-schedule";

describe("parseWorkspaceRruleSchedule", () => {
  it("falls back to defaults when fields are missing", () => {
    expect(parseWorkspaceRruleSchedule({})).toEqual(
      DEFAULT_WORKSPACE_RRULE_SCHEDULE,
    );
  });

  it("falls back to defaults when fields are out of range", () => {
    expect(
      parseWorkspaceRruleSchedule({
        rruleTimezone: "  ",
        rruleRunAtHour: 99,
        rruleRunAtMinute: -1,
      }),
    ).toEqual(DEFAULT_WORKSPACE_RRULE_SCHEDULE);
  });

  it("parses valid workspace fields", () => {
    expect(
      parseWorkspaceRruleSchedule({
        rruleTimezone: "Asia/Shanghai",
        rruleRunAtHour: 9,
        rruleRunAtMinute: 0,
      }),
    ).toEqual({
      timezone: "Asia/Shanghai",
      runAtHour: 9,
      runAtMinute: 0,
    });
  });
});

describe("zonedScheduleToUtc", () => {
  it("maps UTC 09:00 on a fixed calendar day (day granularity)", () => {
    const calendarDate = new Date(2026, 0, 15);
    const utc = zonedScheduleToUtc(
      calendarDate,
      DEFAULT_WORKSPACE_RRULE_SCHEDULE,
    );
    expect(utc.getUTCFullYear()).toBe(2026);
    expect(utc.getUTCMonth()).toBe(0);
    expect(utc.getUTCDate()).toBe(15);
    expect(utc.getUTCHours()).toBe(9);
    expect(utc.getUTCMinutes()).toBe(0);
  });

  it("maps Asia/Shanghai 09:00 to UTC 01:00", () => {
    const calendarDate = new Date(2026, 0, 15);
    const utc = zonedScheduleToUtc(calendarDate, {
      timezone: "Asia/Shanghai",
      runAtHour: 9,
      runAtMinute: 0,
    });
    expect(utc.getUTCHours()).toBe(1);
    expect(utc.getUTCMinutes()).toBe(0);
    expect(utc.getUTCDate()).toBe(15);
  });

  it("handles US daylight saving spring forward", () => {
    const calendarDate = new Date(2026, 2, 8);
    const utc = zonedScheduleToUtc(calendarDate, {
      timezone: "America/New_York",
      runAtHour: 9,
      runAtMinute: 30,
    });
    const formatter = new Intl.DateTimeFormat("en-US", {
      timeZone: "America/New_York",
      hour: "2-digit",
      minute: "2-digit",
      hourCycle: "h23",
    });
    const parts = formatter.formatToParts(utc);
    const hour = Number(
      parts.find((part) => part.type === "hour")?.value ?? "0",
    );
    const minute = Number(
      parts.find((part) => part.type === "minute")?.value ?? "0",
    );
    expect(hour).toBe(9);
    expect(minute).toBe(30);
  });

  it("throws for an invalid timezone", () => {
    expect(() =>
      zonedScheduleToUtc(new Date(2026, 0, 15), {
        timezone: "Not/AZone",
        runAtHour: 9,
        runAtMinute: 0,
      }),
    ).toThrow();
  });
});
