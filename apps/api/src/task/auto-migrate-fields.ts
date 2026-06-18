import { HTTPException } from "hono/http-exception";

export type AutoMigrateClearPatch = {
  autoMigrateEnabled: false;
  autoMigrateStatus: null;
};

export function assertCanEnableAutoMigrate(task: {
  status: string;
  startDate: Date | null;
}): void {
  if (task.status !== "planned") {
    throw new HTTPException(400, {
      message: "Auto migration is only available for planned tasks",
    });
  }

  if (!task.startDate) {
    throw new HTTPException(400, {
      message: "A start date is required to enable auto migration",
    });
  }
}

export function autoMigrateClearPatch(input: {
  previousStatus: string;
  nextStatus: string;
  nextStartDate: Date | null | undefined;
  previousStartDate: Date | null;
}): AutoMigrateClearPatch | null {
  const leavingPlanned =
    input.previousStatus === "planned" && input.nextStatus !== "planned";

  const clearingStartDateWhilePlanned =
    input.nextStatus === "planned" && input.nextStartDate === null;

  if (!leavingPlanned && !clearingStartDateWhilePlanned) {
    return null;
  }

  return {
    autoMigrateEnabled: false,
    autoMigrateStatus: null,
  };
}
