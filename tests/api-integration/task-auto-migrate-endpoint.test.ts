import { eq } from "drizzle-orm";
import { beforeEach, describe, expect, it } from "vitest";
import db, { schema } from "../../apps/api/src/database";
import { createApp } from "../../apps/api/src/index";
import { mockAuthenticatedSession } from "./helpers/auth";
import { resetTestDatabase } from "./helpers/database";
import {
  createProjectFixture,
  createWorkspaceMember,
} from "./helpers/fixtures";

async function seedPlannedTask(
  projectId: string,
  userId: string,
  startDate: Date | null = new Date("2026-06-10T00:00:00.000Z"),
) {
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
      startDate,
    })
    .returning();

  return task;
}

async function patchAutoMigrate(
  app: ReturnType<typeof createApp>["app"],
  taskId: string,
  body: { enabled: boolean; targetStatus?: string | null },
) {
  return app.request(`/api/task/auto-migrate/${taskId}`, {
    method: "PATCH",
    headers: { "content-type": "application/json" },
    body: JSON.stringify(body),
  });
}

describe("API integration: task auto migrate endpoint", () => {
  beforeEach(async () => {
    await resetTestDatabase();
  });

  it("enables auto migration with a valid target column", async () => {
    const member = await createWorkspaceMember();
    const { project } = await createProjectFixture({
      workspaceId: member.workspace.id,
    });
    const task = await seedPlannedTask(project.id, member.user.id);

    mockAuthenticatedSession(member.user);
    const { app } = createApp();

    const response = await patchAutoMigrate(app, task.id, {
      enabled: true,
      targetStatus: "to-do",
    });

    expect(response.status).toBe(200);

    const persisted = await db.query.taskTable.findFirst({
      where: eq(schema.taskTable.id, task.id),
    });
    expect(persisted).toMatchObject({
      autoMigrateEnabled: true,
      autoMigrateStatus: "to-do",
    });
  });

  it("rejects enabling with a virtual status", async () => {
    const member = await createWorkspaceMember();
    const { project } = await createProjectFixture({
      workspaceId: member.workspace.id,
    });
    const task = await seedPlannedTask(project.id, member.user.id);

    mockAuthenticatedSession(member.user);
    const { app } = createApp();

    const response = await patchAutoMigrate(app, task.id, {
      enabled: true,
      targetStatus: "planned",
    });

    expect(response.status).toBe(400);
  });

  it("rejects enabling with a non-existent column", async () => {
    const member = await createWorkspaceMember();
    const { project } = await createProjectFixture({
      workspaceId: member.workspace.id,
    });
    const task = await seedPlannedTask(project.id, member.user.id);

    mockAuthenticatedSession(member.user);
    const { app } = createApp();

    const response = await patchAutoMigrate(app, task.id, {
      enabled: true,
      targetStatus: "nope",
    });

    expect(response.status).toBe(400);
  });

  it("disables auto migration and clears the target column", async () => {
    const member = await createWorkspaceMember();
    const { project } = await createProjectFixture({
      workspaceId: member.workspace.id,
    });
    const [task] = await db
      .insert(schema.taskTable)
      .values({
        projectId: project.id,
        userId: member.user.id,
        title: "Planned task",
        description: "",
        status: "planned",
        columnId: null,
        priority: "low",
        number: 1,
        position: 1,
        autoMigrateEnabled: true,
        autoMigrateStatus: "to-do",
      })
      .returning();

    mockAuthenticatedSession(member.user);
    const { app } = createApp();

    const response = await patchAutoMigrate(app, task.id, {
      enabled: false,
    });

    expect(response.status).toBe(200);

    const persisted = await db.query.taskTable.findFirst({
      where: eq(schema.taskTable.id, task.id),
    });
    expect(persisted).toMatchObject({
      autoMigrateEnabled: false,
      autoMigrateStatus: null,
    });
  });

  it("rejects enabling for a non-planned task", async () => {
    const member = await createWorkspaceMember();
    const { project, columns } = await createProjectFixture({
      workspaceId: member.workspace.id,
    });
    const [task] = await db
      .insert(schema.taskTable)
      .values({
        projectId: project.id,
        userId: member.user.id,
        title: "Board task",
        description: "",
        status: "to-do",
        columnId: columns.todo.id,
        priority: "low",
        number: 1,
        position: 1,
        startDate: new Date("2026-06-10T00:00:00.000Z"),
      })
      .returning();

    mockAuthenticatedSession(member.user);
    const { app } = createApp();

    const response = await patchAutoMigrate(app, task.id, {
      enabled: true,
      targetStatus: "in-progress",
    });

    expect(response.status).toBe(400);
  });

  it("rejects enabling for a planned task without a start date", async () => {
    const member = await createWorkspaceMember();
    const { project } = await createProjectFixture({
      workspaceId: member.workspace.id,
    });
    const task = await seedPlannedTask(project.id, member.user.id, null);

    mockAuthenticatedSession(member.user);
    const { app } = createApp();

    const response = await patchAutoMigrate(app, task.id, {
      enabled: true,
      targetStatus: "to-do",
    });

    expect(response.status).toBe(400);
  });

  it("rejects updates for a non-existent task", async () => {
    const member = await createWorkspaceMember();
    await createProjectFixture({ workspaceId: member.workspace.id });

    mockAuthenticatedSession(member.user);
    const { app } = createApp();

    const response = await patchAutoMigrate(app, "missing-task-id", {
      enabled: false,
    });

    // Workspace-access middleware blocks before the controller's 404 because
    // the workspace cannot be resolved from a non-existent task.
    expect(response.status).toBe(400);
  });
});
