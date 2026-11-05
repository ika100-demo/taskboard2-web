import { TaskBoard } from "@/app/_components/task-board";
import { listTasks } from "@/app/_lib/tasks-api";

export const dynamic = "force-dynamic";

export default async function HomePage() {
  const r = await listTasks();
  return (
    <section className="section tasks" aria-labelledby="tasks-title">
      <h1 id="tasks-title">Tasks</h1>
      <TaskBoard initialTasks={r.ok ? r.tasks : null} />
    </section>
  );
}
