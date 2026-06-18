import { eq } from "drizzle-orm";
import { beforeEach, describe, expect, it } from "vitest";
import db, { schema } from "../../apps/api/src/database";
import { checkPlannedTaskMigrations } from "../../apps/api/src/scheduler/planned-task-migration";
import updateTask from "../../apps/api/src/task/controllers/update-task";
import updateTaskStatus from "../../apps/api/src/task/controllers/update-task-status";
import { resetTestDatabase } from "./helpers/database";
import {
  createProjectFixture,
  createWorkspaceMember,
} from "./helpers/fixtures";

const PAST_DATE = new Date("2020-01-01T00:00:00.000Z");

async function seedPlannedTaskWithAutoMigrate({
  projectId,
  userId,
}: {
  projectId: string;
  userId: string;
}) {
  const [task] = await db
    .insert(schema.taskTable)
    .values({
      projectId,
      userId,
      title: "Planned task",
      description: "",
      status: "planned",
      columnId: null,
      priority: "low",
      number: 1,
      position: 1,
      startDate: PAST_DATE,
      autoMigrateEnabled: true,
      autoMigrateStatus: "to-do",
    })
    .returning();

  return task;
}

describe("API integration: task auto migrate lifecycle", () => {
  beforeEach(async () => {
    await resetTestDatabase();
  });

  it("clears auto migration when a planned task is moved to a board column", async () => {
    const member = await createWorkspaceMember();
    const { project } = await createProjectFixture({
      workspaceId: member.workspace.id,
    });
    const task = await seedPlannedTaskWithAutoMigrate({
      projectId: project.id,
      userId: member.user.id,
    });

    await updateTaskStatus({
      id: task.id,
      status: "to-do",
      currentUserId: member.user.id,
    });

    const persisted = await db.query.taskTable.findFirst({
      where: eq(schema.taskTable.id, task.id),
    });
    expect(persisted).toMatchObject({
      status: "to-do",
      autoMigrateEnabled: false,
      autoMigrateStatus: null,
    });
  });

  it("does not auto migrate after returning to planned once manual move cleared the toggle", async () => {
    const member = await createWorkspaceMember();
    const { project } = await createProjectFixture({
      workspaceId: member.workspace.id,
    });
    const task = await seedPlannedTaskWithAutoMigrate({
      projectId: project.id,
      userId: member.user.id,
    });

    await updateTaskStatus({
      id: task.id,
      status: "to-do",
      currentUserId: member.user.id,
    });
    await updateTaskStatus({
      id: task.id,
      status: "planned",
      currentUserId: member.user.id,
    });

    await checkPlannedTaskMigrations();

    const persisted = await db.query.taskTable.findFirst({
      where: eq(schema.taskTable.id, task.id),
    });
    expect(persisted).toMatchObject({
      status: "planned",
      autoMigrateEnabled: false,
    });
  });

  it("clears auto migration when start date is removed from a planned task", async () => {
    const member = await createWorkspaceMember();
    const { project } = await createProjectFixture({
      workspaceId: member.workspace.id,
    });
    const task = await seedPlannedTaskWithAutoMigrate({
      projectId: project.id,
      userId: member.user.id,
    });

    await updateTask(
      task.id,
      task.title,
      "planned",
      undefined,
      task.dueDate ?? undefined,
      project.id,
      task.description,
      task.priority ?? "low",
      task.position ?? 1,
      task.userId ?? undefined,
      member.user.id,
    );

    const persisted = await db.query.taskTable.findFirst({
      where: eq(schema.taskTable.id, task.id),
    });
    expect(persisted).toMatchObject({
      autoMigrateEnabled: false,
      autoMigrateStatus: null,
      startDate: null,
    });
  });
});
