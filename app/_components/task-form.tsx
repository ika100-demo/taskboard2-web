"use client";

import { useState, useTransition } from "react";
import type { FormEvent } from "react";

import { createTaskAction } from "@/app/actions";
import type { CreateTaskActionResult } from "@/app/actions";
import type { Task } from "@/app/_lib/tasks-api";

type FormErrors = Extract<CreateTaskActionResult, { ok: false }>["errors"];

export function TaskForm({ onCreated }: { onCreated: (task: Task) => void }) {
  const [title, setTitle] = useState("");
  const [dueDate, setDueDate] = useState("");
  const [errors, setErrors] = useState<FormErrors>({});
  const [isPending, startTransition] = useTransition();

  function onSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    startTransition(async () => {
      const r = await createTaskAction({ title, dueDate });
      if (r.ok) {
        onCreated(r.task);
        setTitle("");
        setDueDate("");
        setErrors({});
      } else {
        setErrors(r.errors);
      }
    });
  }

  return (
    <form aria-label="Create task" noValidate onSubmit={onSubmit} className="task-form">
      <label htmlFor="task-title">Title</label>
      <input
        id="task-title"
        name="title"
        type="text"
        value={title}
        onChange={(e) => setTitle(e.target.value)}
        aria-invalid={errors.title ? true : undefined}
        aria-describedby={errors.title ? "task-title-error" : undefined}
      />
      {errors.title && (
        <p id="task-title-error" role="alert" className="field-error">
          {errors.title}
        </p>
      )}
      <label htmlFor="task-due-date">Due date</label>
      <input
        id="task-due-date"
        name="due_date"
        type="date"
        value={dueDate}
        onChange={(e) => setDueDate(e.target.value)}
        aria-invalid={errors.dueDate ? true : undefined}
        aria-describedby={errors.dueDate ? "task-due-date-error" : undefined}
      />
      {errors.dueDate && (
        <p id="task-due-date-error" role="alert" className="field-error">
          {errors.dueDate}
        </p>
      )}
      {errors.form && (
        <p id="task-form-error" role="alert" className="field-error">
          {errors.form}
        </p>
      )}
      <button type="submit" className="btn btn-primary" disabled={isPending}>
        Add task
      </button>
    </form>
  );
}
