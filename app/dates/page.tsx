import { Suspense } from "react";
import { DatesView } from "@/components/DatesView";

export default function DatesPage() {
  return (
    <Suspense>
      <DatesView />
    </Suspense>
  );
}
