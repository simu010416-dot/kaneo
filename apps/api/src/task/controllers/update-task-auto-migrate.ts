import { and, eq } from "drizzle-orm";
import { HTTPException } from "hono/http-exception";
import db from "../../database";
import { columnTable, taskTable } from "../../database/schema";
import { assertCanEnableAutoMigrate } from "../auto-migrate-fields";

async function updateTaskAutoMigrate({
  id,
  enabled,
  targetStatus,
}: {
  id: string;
  enabled: boolean;
  targetStatus?: string | null;
}) {
  const existingTask = await db.query.taskTable.findFirst({
    where: eq(taskTable.id, id),
  });

  if (!existingTask) {
    throw new HTTPException(404, {
      message: "Task not found",
    });
  }

  let nextTargetStatus: string | null = null;

  if (enabled) {
    assertCanEnableAutoMigrate(existingTask);

    if (!targetStatus) {
      throw new HTTPException(400, {
        message: "A target column is required to enable auto migration",
      });
    }

    const column = await db.query.columnTable.findFirst({
      where: and(
        eq(columnTable.projectId, existingTask.projectId),
        eq(columnTable.slug, targetStatus),
      ),
    });

    if (!column) {
      throw new HTTPException(400, {
        message: `Invalid target column "${targetStatus}" for this project`,
      });
    }

    nextTargetStatus = targetStatus;
  }

  const [updatedTask] = await db
    .update(taskTable)
    .set({
      autoMigrateEnabled: enabled,
      autoMigrateStatus: nextTargetStatus,
    })
    .where(eq(taskTable.id, id))
    .returning();

  if (!updatedTask) {
    throw new HTTPException(500, {
      message: "Failed to update task auto migration",
    });
  }

  return updatedTask;
}

export default updateTaskAutoMigrate;
