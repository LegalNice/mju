import { Suspense } from "react";
import { EntryPage } from "@/components/EntryPage";

export default function Home() {
  return (
    <Suspense>
      <EntryPage />
    </Suspense>
  );
}
