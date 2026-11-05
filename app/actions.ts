"use server";

import { DUE_DATE_ERROR, SAVE_ERROR, TITLE_ERROR } from "@/app/_lib/messages";
import { createTask } from "@/app/_lib/tasks-api";
import type { Task } from "@/app/_lib/tasks-api";

export type CreateTaskInput = { title: string; dueDate: string };

export type CreateTaskActionResult =
  | { ok: true; task: Task }
  | { ok: false; errors: { title?: string; dueDate?: string; form?: string } };

export async function createTaskAction(input: CreateTaskInput): Promise<CreateTaskActionResult> {
  if (
    typeof input !== "object" ||
    input === null ||
    typeof input.title !== "string" ||
    typeof input.dueDate !== "string"
  ) {
    return { ok: false, errors: { form: SAVE_ERROR } };
  }
  const result = await createTask({
    title: input.title,
    due_date: input.dueDate === "" ? null : input.dueDate,
  });
  if (result.kind === "created") return { ok: true, task: result.task };
  if (result.kind === "invalid") {
    const errors: { title?: string; dueDate?: string; form?: string } = {};
    if (result.fields.includes("title")) errors.title = TITLE_ERROR;
    if (result.fields.includes("due_date")) errors.dueDate = DUE_DATE_ERROR;
    if (!errors.title && !errors.dueDate) errors.form = SAVE_ERROR;
    return { ok: false, errors };
  }
  return { ok: false, errors: { form: SAVE_ERROR } };
}
