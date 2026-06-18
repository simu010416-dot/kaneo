import { fireEvent, render } from "@testing-library/react";
import type { ReactNode } from "react";
import { afterEach, describe, expect, it, vi } from "vitest";
import type Task from "@/types/task";

const updateAutoMigrateMock = vi.fn();

vi.mock("@dnd-kit/sortable", () => ({
  useSortable: () => ({
    attributes: {},
    listeners: {},
    setNodeRef: vi.fn(),
    transform: null,
    transition: null,
    isDragging: false,
  }),
}));

vi.mock("@dnd-kit/utilities", () => ({
  CSS: { Transform: { toString: () => "" } },
}));

vi.mock("@tanstack/react-router", () => ({
  useNavigate: () => vi.fn(),
}));

vi.mock("react-i18next", () => ({
  useTranslation: () => ({ t: (key: string) => key }),
}));

vi.mock("@/store/project", () => ({
  default: () => ({
    project: {
      id: "project-1",
      slug: "proj",
      columns: [
        { id: "to-do", slug: "to-do", name: "To Do", isFinal: false },
        { id: "done", slug: "done", name: "Done", isFinal: true },
      ],
    },
  }),
}));

vi.mock("@/store/backlog-bulk-selection", () => ({
  default: () => ({
    toggleSelection: vi.fn(),
    isSelected: () => false,
    isFocused: () => false,
  }),
}));

vi.mock("@/store/user-preferences", () => ({
  useUserPreferencesStore: () => ({
    showAssignees: false,
    showPriority: false,
    showDueDates: false,
    showLabels: false,
    showTaskNumbers: false,
  }),
}));

vi.mock("@/hooks/queries/workspace/use-active-workspace", () => ({
  default: () => ({ data: { id: "workspace-1" } }),
}));

vi.mock(
  "@/hooks/queries/workspace-users/use-get-active-workspace-users",
  () => ({
    useGetActiveWorkspaceUsers: () => ({ data: { members: [] } }),
  }),
);

vi.mock("@/hooks/mutations/task/use-delete-task", () => ({
  useDeleteTask: () => ({ mutateAsync: vi.fn() }),
}));

vi.mock("@/hooks/mutations/task/use-update-task-auto-migrate", () => ({
  useUpdateTaskAutoMigrate: () => ({ mutate: updateAutoMigrateMock }),
}));

vi.mock(
  "../kanban-board/task-card-context-menu/task-card-context-menu-content",
  () => ({ default: () => null }),
);

vi.mock("../kanban-board/task-labels", () => ({ default: () => null }));

vi.mock("../ui/context-menu", () => ({
  ContextMenu: ({ children }: { children: ReactNode }) => <div>{children}</div>,
  ContextMenuTrigger: ({ children }: { children: ReactNode }) => (
    <div>{children}</div>
  ),
}));

import BacklogTaskRow from "./backlog-task-row";

function makeTask(overrides: Partial<Task> = {}): Task {
  return {
    id: "task-1",
    title: "Test task",
    number: 1,
    description: null,
    status: "planned",
    priority: "low",
    startDate: "2026-01-01T00:00:00.000Z",
    dueDate: null,
    position: 1,
    createdAt: "2026-01-01T00:00:00.000Z",
    updatedAt: "2026-01-01T00:00:00.000Z",
    userId: null,
    assigneeId: null,
    assigneeName: null,
    projectId: "project-1",
    autoMigrateEnabled: false,
    autoMigrateStatus: null,
    ...overrides,
  };
}

describe("BacklogTaskRow auto migration controls", () => {
  afterEach(() => {
    updateAutoMigrateMock.mockReset();
  });

  it("shows the auto migrate toggle for planned tasks with a start date", () => {
    const { container } = render(<BacklogTaskRow task={makeTask()} />);
    expect(container.querySelector('[data-slot="switch"]')).toBeInTheDocument();
  });

  it("hides the toggle when the task has no start date", () => {
    const { container } = render(
      <BacklogTaskRow task={makeTask({ startDate: null })} />,
    );
    expect(
      container.querySelector('[data-slot="switch"]'),
    ).not.toBeInTheDocument();
  });

  it("hides the toggle for non-planned tasks", () => {
    const { container } = render(
      <BacklogTaskRow task={makeTask({ status: "to-do" })} />,
    );
    expect(
      container.querySelector('[data-slot="switch"]'),
    ).not.toBeInTheDocument();
  });

  it("shows the target column select only when auto migrate is enabled", () => {
    const { container, rerender } = render(
      <BacklogTaskRow task={makeTask()} />,
    );
    expect(
      container.querySelector('[data-slot="select-trigger"]'),
    ).not.toBeInTheDocument();

    rerender(
      <BacklogTaskRow
        task={makeTask({
          autoMigrateEnabled: true,
          autoMigrateStatus: "to-do",
        })}
      />,
    );
    expect(
      container.querySelector('[data-slot="select-trigger"]'),
    ).toBeInTheDocument();
  });

  it("enables auto migration with the first column when toggled on", () => {
    const { container } = render(<BacklogTaskRow task={makeTask()} />);

    const toggle = container.querySelector('[data-slot="switch"]');
    expect(toggle).not.toBeNull();
    fireEvent.click(toggle as Element);

    expect(updateAutoMigrateMock).toHaveBeenCalledWith({
      taskId: "task-1",
      projectId: "project-1",
      enabled: true,
      targetStatus: "to-do",
    });
  });
});
