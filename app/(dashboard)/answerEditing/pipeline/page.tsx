"use client";

import { useEffect } from "react";
import { useRouter } from "next/navigation";
import { useQueryStates } from "nuqs";
import { urlKeys, URL_OPTIONS } from "@/app/lib/urlKeys";

// Back-compat redirect; carries the deep-link params over to /answerEditing.
export default function PipelineRedirect() {
  const router = useRouter();
  const [params] = useQueryStates(urlKeys.answerEditing, URL_OPTIONS);

  useEffect(() => {
    const qs = new URLSearchParams(
      Object.entries(params).filter(([, v]) => v) as [string, string][]
    ).toString();
    router.replace(qs ? `/answerEditing?${qs}` : "/answerEditing");
  }, [params, router]);

  return null;
}
