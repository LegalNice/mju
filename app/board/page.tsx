import { Suspense } from "react";
import { BoardIndex } from "@/components/BoardIndex";

export default function BoardPage() {
  return (
    <Suspense>
      <BoardIndex />
    </Suspense>
  );
}
