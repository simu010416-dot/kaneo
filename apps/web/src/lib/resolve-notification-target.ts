import getProject from "@/fetchers/project/get-project";
import getTask from "@/fetchers/task/get-task";

export type ResolveNotificationTargetInput = {
  resourceType: string | null | undefined;
  resourceId: string | null | undefined;
  workspaceIds: string[];
};

export type ResolveNotificationTargetResult =
  | { type: "workspace"; workspaceId: string }
  | { type: "task"; workspaceId: string; projectId: string; taskId: string };

async function tryGetProject(projectId: string, workspaceId: string) {
  try {
    await getProject({ id: projectId, workspaceId });
    return true;
  } catch {
    return false;
  }
}

async function resolveNotificationTarget(
  input: ResolveNotificationTargetInput,
): Promise<ResolveNotificationTargetResult | null> {
  const { resourceType, resourceId, workspaceIds } = input;

  if (!resourceId || !resourceType) {
    return null;
  }

  if (resourceType === "workspace") {
    return { type: "workspace", workspaceId: resourceId };
  }

  if (resourceType === "task") {
    let task: Awaited<ReturnType<typeof getTask>>;

    try {
      task = await getTask(resourceId);
    } catch {
      return null;
    }

    const { projectId } = task;
    if (!projectId) {
      return null;
    }

    for (const workspaceId of workspaceIds) {
      const found = await tryGetProject(projectId, workspaceId);
      if (found) {
        return {
          type: "task",
          workspaceId,
          projectId,
          taskId: resourceId,
        };
      }
    }

    return null;
  }

  return null;
}

export default resolveNotificationTarget;
