import { and, eq, isNotNull, max } from "drizzle-orm";
import db from "../database";
import {
  columnTable,
  projectTable,
  taskTable,
  workspaceTable,
  workspaceUserTable,
} from "../database/schema";
import { publishEvent } from "../events";
import createNotification from "../notification/controllers/create-notification";
import {
  parseWorkspaceRruleSchedule,
  zonedScheduleToUtc,
} from "./workspace-schedule";

type PlannedMigrationRow = {
  id: string;
  title: string;
  projectId: string;
  assigneeId: string | null;
  status: string;
  startDate: Date | null;
  autoMigrateStatus: string | null;
  workspaceId: string;
  rruleTimezone: string;
  rruleRunAtHour: number;
  rruleRunAtMinute: number;
};

async function resolveNotificationRecipient(
  row: PlannedMigrationRow,
): Promise<string | null> {
  if (row.assigneeId) {
    return row.assigneeId;
  }

  const [owner] = await db
    .select({ userId: workspaceUserTable.userId })
    .from(workspaceUserTable)
    .where(
      and(
        eq(workspaceUserTable.workspaceId, row.workspaceId),
        eq(workspaceUserTable.role, "owner"),
      ),
    )
    .limit(1);

  return owner?.userId ?? null;
}

async function migrateToColumn(
  row: PlannedMigrationRow,
  columnId: string,
  targetSlug: string,
): Promise<void> {
  const [maxPositionResult] = await db
    .select({ maxPosition: max(taskTable.position) })
    .from(taskTable)
    .where(
      and(
        eq(taskTable.projectId, row.projectId),
        eq(taskTable.columnId, columnId),
      ),
    );

  const nextPosition = (maxPositionResult?.maxPosition ?? 0) + 1;

  await db
    .update(taskTable)
    .set({
      status: targetSlug,
      columnId,
      position: nextPosition,
      autoMigrateEnabled: false,
    })
    .where(eq(taskTable.id, row.id));

  await publishEvent("task.status_changed", {
    taskId: row.id,
    projectId: row.projectId,
    userId: null,
    oldStatus: row.status,
    newStatus: targetSlug,
    title: row.title,
    assigneeId: row.assigneeId,
    type: "status_changed",
  });

  await publishEvent("task-relation.refresh", {
    projectId: row.projectId,
    userId: null,
  });

  await publishEvent("task.updated", {
    taskId: row.id,
    projectId: row.projectId,
    title: row.title,
    status: targetSlug,
    userId: null,
  });
}

async function handleMissingColumn(row: PlannedMigrationRow): Promise<void> {
  // Disable the toggle so we neither retry nor re-notify on future ticks.
  await db
    .update(taskTable)
    .set({ autoMigrateEnabled: false })
    .where(eq(taskTable.id, row.id));

  const recipient = await resolveNotificationRecipient(row);

  if (!recipient) {
    return;
  }

  await createNotification({
    userId: recipient,
    type: "task_auto_migrate_failed",
    eventData: {
      taskTitle: row.title,
      targetStatus: row.autoMigrateStatus,
    },
    resourceId: row.id,
    resourceType: "task",
  });
}

async function processPlannedTask(row: PlannedMigrationRow): Promise<void> {
  if (!row.startDate || !row.autoMigrateStatus) {
    return;
  }

  const schedule = parseWorkspaceRruleSchedule({
    rruleTimezone: row.rruleTimezone,
    rruleRunAtHour: row.rruleRunAtHour,
    rruleRunAtMinute: row.rruleRunAtMinute,
  });

  const trigger = zonedScheduleToUtc(row.startDate, schedule);

  if (Date.now() < trigger.getTime()) {
    return;
  }

  const column = await db.query.columnTable.findFirst({
    where: and(
      eq(columnTable.projectId, row.projectId),
      eq(columnTable.slug, row.autoMigrateStatus),
    ),
  });

  if (column) {
    await migrateToColumn(row, column.id, row.autoMigrateStatus);
  } else {
    await handleMissingColumn(row);
  }
}

export async function checkPlannedTaskMigrations(): Promise<void> {
  let rows: PlannedMigrationRow[];

  try {
    rows = await db
      .select({
        id: taskTable.id,
        title: taskTable.title,
        projectId: taskTable.projectId,
        assigneeId: taskTable.userId,
        status: taskTable.status,
        startDate: taskTable.startDate,
        autoMigrateStatus: taskTable.autoMigrateStatus,
        workspaceId: projectTable.workspaceId,
        rruleTimezone: workspaceTable.rruleTimezone,
        rruleRunAtHour: workspaceTable.rruleRunAtHour,
        rruleRunAtMinute: workspaceTable.rruleRunAtMinute,
      })
      .from(taskTable)
      .innerJoin(projectTable, eq(taskTable.projectId, projectTable.id))
      .innerJoin(
        workspaceTable,
        eq(projectTable.workspaceId, workspaceTable.id),
      )
      .where(
        and(
          eq(taskTable.status, "planned"),
          eq(taskTable.autoMigrateEnabled, true),
          isNotNull(taskTable.startDate),
        ),
      );
  } catch (error) {
    console.error("Failed to query planned tasks for auto migration", {
      error,
    });
    return;
  }

  for (const row of rows) {
    try {
      await processPlannedTask(row);
    } catch (error) {
      console.error("Failed to process planned task auto migration", {
        taskId: row.id,
        error,
      });
    }
  }
}
