"use client";

import PipelineEditor from "./components/PipelineEditor";

// Answer Editing screen. Edits the Pipeline (loam_ops OCR, pre-publish) source.
// The Published (loam_db) view that once shared this screen was removed; the
// /answerEditing/published routes remain as redirects for old links.
export default function AnswerEditingPage() {
  return <PipelineEditor />;
}
