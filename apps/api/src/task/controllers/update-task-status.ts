import { and, eq } from "drizzle-orm";
import { HTTPException } from "hono/http-exception";
import db from "../../database";
import { columnTable, taskTable } from "../../database/schema";
import { publishEvent } from "../../events";
import { autoMigrateClearPatch } from "../auto-migrate-fields";
import { assertValidTaskStatus } from "../validate-task-fields";

async function updateTaskStatus({
  id,
  status,
  currentUserId,
}: {
  id: string;
  status: string;
  currentUserId: string;
}) {
  const existingTask = await db.query.taskTable.findFirst({
    where: eq(taskTable.id, id),
  });

  if (!existingTask) {
    throw new HTTPException(404, {
      message: "Task not found",
    });
  }

  await assertValidTaskStatus(status, existingTask.projectId);

  const column = await db.query.columnTable.findFirst({
    where: and(
      eq(columnTable.projectId, existingTask.projectId),
      eq(columnTable.slug, status),
    ),
  });

  const clearPatch = autoMigrateClearPatch({
    previousStatus: existingTask.status,
    nextStatus: status,
    nextStartDate: undefined,
    previousStartDate: existingTask.startDate,
  });

  const [updatedTask] = await db
    .update(taskTable)
    .set({ status, columnId: column?.id ?? null, ...clearPatch })
    .where(eq(taskTable.id, id))
    .returning();

  if (!updatedTask) {
    throw new HTTPException(500, {
      message: "Failed to update task status",
    });
  }

  await publishEvent("task.status_changed", {
    taskId: updatedTask.id,
    projectId: updatedTask.projectId,
    userId: currentUserId,
    oldStatus: existingTask.status,
    newStatus: status,
    title: updatedTask.title,
    assigneeId: updatedTask.userId,
    type: "status_changed",
  });

  await publishEvent("task-relation.refresh", {
    projectId: updatedTask.projectId,
    userId: currentUserId,
  });

  return updatedTask;
}

export default updateTaskStatus;
