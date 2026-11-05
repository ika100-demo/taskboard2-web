"use client";

import { useState } from "react";

import { TaskForm } from "@/app/_components/task-form";
import { TaskList } from "@/app/_components/task-list";
import type { Task } from "@/app/_lib/tasks-api";

export function TaskBoard({ initialTasks }: { initialTasks: Task[] | null }) {
  const [tasks, setTasks] = useState<Task[] | null>(initialTasks);

  function onCreated(task: Task) {
    // When the list failed to load, keep the load error: a one-item list would misrepresent the store.
    setTasks((current) => (current === null ? null : [...current, task]));
  }

  return (
    <>
      <TaskList tasks={tasks} />
      <TaskForm onCreated={onCreated} />
    </>
  );
}
