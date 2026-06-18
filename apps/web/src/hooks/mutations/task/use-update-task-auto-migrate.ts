import { useMutation, useQueryClient } from "@tanstack/react-query";
import updateTaskAutoMigrate from "@/fetchers/task/update-task-auto-migrate";
import { toast } from "@/lib/toast";

type UpdateTaskAutoMigrateInput = {
  taskId: string;
  projectId: string;
  enabled: boolean;
  targetStatus?: string | null;
};

export function useUpdateTaskAutoMigrate() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: ({
      taskId,
      enabled,
      targetStatus,
    }: UpdateTaskAutoMigrateInput) =>
      updateTaskAutoMigrate(taskId, enabled, targetStatus),
    onSuccess: (_, variables) => {
      queryClient.invalidateQueries({
        queryKey: ["tasks", variables.projectId],
      });
      queryClient.invalidateQueries({
        queryKey: ["task", variables.taskId],
      });
    },
    onError: (error) => {
      toast.error(
        error instanceof Error
          ? error.message
          : "Failed to update auto migration",
      );
    },
  });
}
