# Atomic page↔student coupling — fix cross-student bbox saves (#199)

## Problem
In the Answer Chunking editor (`/pdfExtract`), switching between students could save one
student's bounding boxes onto **another** student's record: the regions carried a foreign
`img_id`, rendered on the wrong/missing page, and downstream crops + OCR extracted the wrong
student's answers.

Root cause — "current student" lived in **four independent sources of truth** that were allowed
to disagree, wired by a fire-and-forget callback + a 50 ms `setTimeout`:
- selection — `useBatchFilter.selectedStudentId` (a bare string).
- page images — `usePDFRenderer` refs keyed only by `img_id`, **no student stamp**.
- regions — `useMarking`, `img_id` captured from whatever pages happened to be loaded at draw time.
- save — `performSave` took the **target** from context but the **regions** from marking.

`resetRenderer` existed but was never called; the dropdown switch fired
`setTimeout(onOpenStudent, 50)` and could load the new student's pages against the old selection
(or leave the previous student's pages loaded).

## Fix — one atomic, identity-stamped session; illegal states unrepresentable
1. **Renderer identity stamp** (`usePDFRenderer.ts`): `loadImagesFromUrls` now takes an
   `identity: { studentId, batchId }` and records `loadedStudentIdRef` / `loadedBatchIdRef`
   (cleared by `resetRenderer`). `hasImgId(imgId)` reports whether an id is a currently-loaded page.
2. **Atomic, race-safe load** (`page.tsx` `handleOpenStudent`): captures the intended
   `{batchId, studentId}` + a `loadToken`; `resetRenderer()` + `marking.clearAll()` up-front; every
   commit checks the token (`isStale()`) and bails if a newer switch superseded it; on success sets
   the `session` object.
3. **Declarative trigger** (`page.tsx`): a `useEffect` keyed on `(batch_id, studentId, students)`
   runs the load once the roster is present (de-duped by `loadedKeyRef`). Replaces the
   `registerOpen`/`onOpenStudent`/50 ms `setTimeout` race. On this page `registerOpen(() => {})`
   neutralizes the shared dropdown callback (still used by the Answer Editing editor).
4. **`session` is the single source of truth**: `{ batchId, studentId, studentName }`, set only at
   load-commit. Pages, regions and the save-target all read it.
5. **Save invariants** (`performSave`): refuses unless
   `session.studentId === selectedStudentId === renderer.loadedStudentId` **and** every region's
   `img_id` is a currently-loaded page; saves to `session.batchId/studentId` (not context).
6. **Server tripwire** (`beaver-api/src/routes/bboxes.ts`): `POST /bboxes` rejects (400) any region
   whose `img_id` isn't among that student's `answer_sheet_pages` — up-front, before any upsert, so
   no partial/null-dimension rows are written. Applies to all callers (river detects on the
   student's own pages, so its saves pass; a 400 there would surface a real pipeline bug).

## Not in this change
- `studentId` is really an **answer-paper id** (one per subject) and should be renamed
  `answerPaperId` — deferred to a dedicated mechanical refactor (pervasive; would bloat this fix).
- `answerEditing/components/PipelineEditor.tsx` has the same `registerOpen` + `setTimeout(…,50)`
  switch race and should get the same atomic-session treatment as a fast-follow.

## Verify
- `npx tsc --noEmit` clean (beaver + beaver-api).
- Rapidly switch students in Answer Chunking, draw + save → boxes always land on the displayed
  student; a mid-load switch only commits the final student's pages.
- `POST /bboxes` with a foreign `img_id` → 400, zero rows written; the orphan-region detection query
  stays at 0 for new saves; river's own saves still succeed.
