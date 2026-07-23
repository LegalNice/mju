import { Suspense } from "react";
import { TaskDetailView } from "@/components/TaskDetailView";

export default async function TaskPage({ params }: { params: Promise<{ taskId: string }> }) {
  const { taskId } = await params;
  return (
    <Suspense>
      <TaskDetailView taskId={taskId} />
    </Suspense>
  );
}
