import { and, eq } from "drizzle-orm";
import { beforeEach, describe, expect, it } from "vitest";
import db, { schema } from "../../apps/api/src/database";
import { checkPlannedTaskMigrations } from "../../apps/api/src/scheduler/planned-task-migration";
import { resetTestDatabase } from "./helpers/database";
import {
  createProjectFixture,
  createWorkspaceMember,
} from "./helpers/fixtures";

const PAST_DATE = new Date("2020-01-01T00:00:00.000Z");
const FUTURE_DATE = new Date("2999-01-01T00:00:00.000Z");

async function insertPlannedTask({
  projectId,
  userId,
  number,
  autoMigrateEnabled,
  autoMigrateStatus,
  startDate,
}: {
  projectId: string;
  userId: string | null;
  number: number;
  autoMigrateEnabled: boolean;
  autoMigrateStatus: string | null;
  startDate: Date | null;
}) {
  const [task] = await db
    .insert(schema.taskTable)
    .values({
      projectId,
      userId,
      title: `Planned task ${number}`,
      description: "",
      status: "planned",
      columnId: null,
      priority: "low",
      number,
      position: number,
      autoMigrateEnabled,
      autoMigrateStatus,
      startDate,
    })
    .returning();

  return task;
}

async function getTask(id: string) {
  return db.query.taskTable.findFirst({
    where: eq(schema.taskTable.id, id),
  });
}

async function countNotifications(userId: string, type: string) {
  const rows = await db
    .select({ id: schema.notificationTable.id })
    .from(schema.notificationTable)
    .where(
      and(
        eq(schema.notificationTable.userId, userId),
        eq(schema.notificationTable.type, type),
      ),
    );
  return rows.length;
}

describe("API integration: planned task auto migration", () => {
  beforeEach(async () => {
    await resetTestDatabase();
  });

  it("migrates a due planned task into the target column", async () => {
    const member = await createWorkspaceMember();
    const { project, columns } = await createProjectFixture({
      workspaceId: member.workspace.id,
    });

    const task = await insertPlannedTask({
      projectId: project.id,
      userId: member.user.id,
      number: 1,
      autoMigrateEnabled: true,
      autoMigrateStatus: "to-do",
      startDate: PAST_DATE,
    });

    await checkPlannedTaskMigrations();

    const updated = await getTask(task.id);
    expect(updated).toMatchObject({
      status: "to-do",
      columnId: columns.todo.id,
      autoMigrateEnabled: false,
    });
    expect(updated?.position).toBeGreaterThan(0);
  });

  it("does not migrate before the scheduled trigger time", async () => {
    const member = await createWorkspaceMember();
    const { project } = await createProjectFixture({
      workspaceId: member.workspace.id,
    });

    const task = await insertPlannedTask({
      projectId: project.id,
      userId: member.user.id,
      number: 1,
      autoMigrateEnabled: true,
      autoMigrateStatus: "to-do",
      startDate: FUTURE_DATE,
    });

    await checkPlannedTaskMigrations();

    const updated = await getTask(task.id);
    expect(updated).toMatchObject({
      status: "planned",
      autoMigrateEnabled: true,
    });
  });

  it("ignores planned tasks with the toggle disabled", async () => {
    const member = await createWorkspaceMember();
    const { project } = await createProjectFixture({
      workspaceId: member.workspace.id,
    });

    const task = await insertPlannedTask({
      projectId: project.id,
      userId: member.user.id,
      number: 1,
      autoMigrateEnabled: false,
      autoMigrateStatus: "to-do",
      startDate: PAST_DATE,
    });

    await checkPlannedTaskMigrations();

    const updated = await getTask(task.id);
    expect(updated?.status).toBe("planned");
  });

  it("ignores planned tasks without a start date", async () => {
    const member = await createWorkspaceMember();
    const { project } = await createProjectFixture({
      workspaceId: member.workspace.id,
    });

    const task = await insertPlannedTask({
      projectId: project.id,
      userId: member.user.id,
      number: 1,
      autoMigrateEnabled: true,
      autoMigrateStatus: "to-do",
      startDate: null,
    });

    await checkPlannedTaskMigrations();

    const updated = await getTask(task.id);
    expect(updated?.status).toBe("planned");
  });

  it("notifies the assignee and disables the toggle when the target column is missing", async () => {
    const member = await createWorkspaceMember();
    const { project } = await createProjectFixture({
      workspaceId: member.workspace.id,
    });

    const task = await insertPlannedTask({
      projectId: project.id,
      userId: member.user.id,
      number: 1,
      autoMigrateEnabled: true,
      autoMigrateStatus: "does-not-exist",
      startDate: PAST_DATE,
    });

    await checkPlannedTaskMigrations();

    const updated = await getTask(task.id);
    expect(updated).toMatchObject({
      status: "planned",
      autoMigrateEnabled: false,
    });

    expect(
      await countNotifications(member.user.id, "task_auto_migrate_failed"),
    ).toBe(1);
  });

  it("does not re-notify or retry after a missing-column failure", async () => {
    const member = await createWorkspaceMember();
    const { project } = await createProjectFixture({
      workspaceId: member.workspace.id,
    });

    const task = await insertPlannedTask({
      projectId: project.id,
      userId: member.user.id,
      number: 1,
      autoMigrateEnabled: true,
      autoMigrateStatus: "does-not-exist",
      startDate: PAST_DATE,
    });

    await checkPlannedTaskMigrations();
    await checkPlannedTaskMigrations();

    const updated = await getTask(task.id);
    expect(updated?.status).toBe("planned");
    expect(
      await countNotifications(member.user.id, "task_auto_migrate_failed"),
    ).toBe(1);
  });

  it("does not migrate twice after a successful migration", async () => {
    const member = await createWorkspaceMember();
    const { project, columns } = await createProjectFixture({
      workspaceId: member.workspace.id,
    });

    const task = await insertPlannedTask({
      projectId: project.id,
      userId: member.user.id,
      number: 1,
      autoMigrateEnabled: true,
      autoMigrateStatus: "to-do",
      startDate: PAST_DATE,
    });

    await checkPlannedTaskMigrations();
    await checkPlannedTaskMigrations();

    const updated = await getTask(task.id);
    expect(updated).toMatchObject({
      status: "to-do",
      columnId: columns.todo.id,
      autoMigrateEnabled: false,
    });
  });
});
