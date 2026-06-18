import { describe, expect, it } from "vitest";
import {
  assertCanEnableAutoMigrate,
  autoMigrateClearPatch,
} from "../../apps/api/src/task/auto-migrate-fields";

describe("assertCanEnableAutoMigrate", () => {
  it("allows planned tasks with a start date", () => {
    expect(() =>
      assertCanEnableAutoMigrate({
        status: "planned",
        startDate: new Date("2026-01-01"),
      }),
    ).not.toThrow();
  });

  it("rejects non-planned tasks", () => {
    expect(() =>
      assertCanEnableAutoMigrate({
        status: "to-do",
        startDate: new Date("2026-01-01"),
      }),
    ).toThrow("Auto migration is only available for planned tasks");
  });

  it("rejects planned tasks without a start date", () => {
    expect(() =>
      assertCanEnableAutoMigrate({
        status: "planned",
        startDate: null,
      }),
    ).toThrow("A start date is required to enable auto migration");
  });
});

describe("autoMigrateClearPatch", () => {
  it("clears when leaving planned", () => {
    expect(
      autoMigrateClearPatch({
        previousStatus: "planned",
        nextStatus: "to-do",
        nextStartDate: undefined,
        previousStartDate: new Date("2026-01-01"),
      }),
    ).toEqual({
      autoMigrateEnabled: false,
      autoMigrateStatus: null,
    });
  });

  it("clears when start date is explicitly removed while planned", () => {
    expect(
      autoMigrateClearPatch({
        previousStatus: "planned",
        nextStatus: "planned",
        nextStartDate: null,
        previousStartDate: new Date("2026-01-01"),
      }),
    ).toEqual({
      autoMigrateEnabled: false,
      autoMigrateStatus: null,
    });
  });

  it("does not clear when start date is unchanged", () => {
    expect(
      autoMigrateClearPatch({
        previousStatus: "planned",
        nextStatus: "planned",
        nextStartDate: undefined,
        previousStartDate: new Date("2026-01-01"),
      }),
    ).toBeNull();
  });

  it("does not clear when moving between board columns", () => {
    expect(
      autoMigrateClearPatch({
        previousStatus: "to-do",
        nextStatus: "in-progress",
        nextStartDate: undefined,
        previousStartDate: null,
      }),
    ).toBeNull();
  });

  it("clears when moving from planned to archived", () => {
    expect(
      autoMigrateClearPatch({
        previousStatus: "planned",
        nextStatus: "archived",
        nextStartDate: undefined,
        previousStartDate: new Date("2026-01-01"),
      }),
    ).toEqual({
      autoMigrateEnabled: false,
      autoMigrateStatus: null,
    });
  });
});
