import { redirect } from "next/navigation";
import { findTaskBySessionId } from "@/lib/mju-store";

/**
 * Legacy route. The chat workbench has been retired; task-bound sessions live
 * at /task/[taskId]. Old ?session=<id> links redirect to the owning task when
 * one exists, otherwise to the entry page.
 */
export default async function SessionsRedirect({
  searchParams,
}: {
  searchParams: Promise<{ session?: string }>;
}) {
  const { session } = await searchParams;
  if (session) {
    const hit = findTaskBySessionId(session);
    if (hit) {
      redirect(`/task/${hit.taskId}?cwd=${encodeURIComponent(hit.cwd)}`);
    }
  }
  redirect("/");
}
