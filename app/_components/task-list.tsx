import { EMPTY_LIST, LOAD_ERROR } from "@/app/_lib/messages";
import type { Task } from "@/app/_lib/tasks-api";

export function TaskList({ tasks }: { tasks: Task[] | null }) {
  if (tasks === null) return <p role="alert">{LOAD_ERROR}</p>;
  if (tasks.length === 0) return <p>{EMPTY_LIST}</p>;
  return (
    <ul aria-label="Tasks">
      {tasks.map((task) => (
        <li key={task.id}>
          <span className="task-title">{task.title}</span>
          {task.due_date !== null && (
            <>
              {" "}
              <time dateTime={task.due_date}>{task.due_date}</time>
            </>
          )}
        </li>
      ))}
    </ul>
  );
}
