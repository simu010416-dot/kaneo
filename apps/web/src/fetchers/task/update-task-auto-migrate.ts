import { client } from "@kaneo/libs";

async function updateTaskAutoMigrate(
  taskId: string,
  enabled: boolean,
  targetStatus?: string | null,
) {
  const response = await client.task["auto-migrate"][":id"].$patch({
    param: { id: taskId },
    json: {
      enabled,
      targetStatus: targetStatus ?? null,
    },
  });

  if (!response.ok) {
    const error = await response.text();
    throw new Error(error);
  }

  const data = await response.json();

  return data;
}

export default updateTaskAutoMigrate;
