"use client";

import { useEffect } from "react";
import { useRouter } from "next/navigation";

// Back-compat redirect for old links.
export default function PublishedStudentRedirect() {
  const router = useRouter();
  useEffect(() => {
    router.replace("/answerEditing");
  }, [router]);
  return null;
}
