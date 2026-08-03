import { Suspense } from "react";
import { ToolsView } from "@/components/ToolsView";

export default function ToolsPage() {
  return (
    <Suspense>
      <ToolsView />
    </Suspense>
  );
}
