import { Suspense } from "react";
import { CaseBoardView } from "@/components/CaseBoardView";

export default async function BoardCasePage({ params }: { params: Promise<{ caseId: string }> }) {
  const { caseId } = await params;
  return (
    <Suspense>
      <CaseBoardView caseId={caseId} />
    </Suspense>
  );
}
