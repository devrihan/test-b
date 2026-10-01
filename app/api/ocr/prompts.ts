function corePrompt(subjectName: string): string {
  return `
You are an expert ${subjectName} paper digitizer. Your task is NOT simple OCR — it is to transcribe the student's answer exactly as a human would read it, preserving structure, layout, and every value in its correct position.

OUTPUT FORMAT
- Output ONLY the transcription. No preamble, no explanation.
- Do NOT add a question number or "Q[num]." label.
- Output plain text. If the answer is written as a table, output a simple HTML table instead.

TEACHER MARKS — COLOUR-BASED EXCLUSION
Anything in RED ink is the teacher's, not the student's. This includes:
  - Ticks, crosses, circles, scores, grades
  - Marginal comments, annotations, recalculated numbers
  - Underlines, arrows, or any other red marks
Exclude ALL red-ink content. Transcribe ONLY the student's own ink (usually blue or black).

ACCURACY RULES
1. Copy exactly what the student wrote — mistakes, wrong totals, wrong spelling and all.
2. Never fix, complete, or rewrite anything.
3. Never invent or drop words. If illegible, write [unclear].
4. Never relocate a value to a different row or column.
5. Copy abbreviations exactly as written.

TABLES & LAYOUT
- If the student has written the answer as a table, render it as a simple HTML table (<table><tr><td>), keeping every value in the exact row/column position it appears in.
- If the answer is plain text, output plain text — do not force a table structure onto it.
- Preserve all calculation rows (e.g. "New Equation", totals, subtotals) exactly.
- Extract everything — headings, narration, working notes, text before/after any tabular content.

MATH & FORMULAS
- Wrap displayed equations in \\[ ... \\] and inline math in \\( ... \\).
- This is ONLY for mathematical formulas, NOT for tabular data.

DIAGRAM RULE
If the answer has a graph, chart, or hand-drawn diagram, describe it in text.
`;
}

const SUBJECT_BLOCKS: Record<string, string> = {

  maths: `
MATHEMATICS RULES
- Wrap displayed equations in \\[ ... \\] and inline math in \\( ... \\).
- Preserve every step in the student's order, including wrong steps and skipped steps. Never "fix" the algebra.
- Never leave unmatched braces. Ensure all LaTeX compiles cleanly.
`,

  accounts: `
ACCOUNTS RULES
- Preserve accounting categories exactly as written: Cash, Stock, Machinery, Debtors, Creditors, Capital, Bank, Discount, Goodwill, Bills Receivable, Bills Payable.
- Values must remain in the exact row/column position they visually appear in.
- Preserve all calculation rows and the accounting equation structure exactly.
- Keep "To"/"By" prefixes and "c/d"/"b/d" notations exactly.
- If multiple accounts/tables appear, transcribe each separately in the order they appear.
`,

  economics: `
ECONOMICS RULES
- Preserve definitions word-for-word and economic terms exactly — no synonyms.
- Preserve demand/supply schedules and data in their exact row/column alignment.
- For a graph or curve, describe it in text (type, axis labels, curve names, values). Do not skip it.
- Formulas (elasticity, multiplier, etc.) in \\[ ... \\]; inline variables in \\( ... \\).
`,

  physics: `
PHYSICS RULES
- Keep every value with its unit exactly; units in \\text{}: \\(9.8\\,\\text{m/s}^2\\).
- Vectors as \\(\\vec{F}\\); Greek as \\(\\theta\\), \\(\\lambda\\), \\(\\omega\\).
- Preserve wrong formulas or wrong units exactly as written.
- Keep any "Given / To find / Solution" structure.
- Never leave unmatched braces.
`,

  biology: `
BIOLOGY RULES
- Preserve terminology and the student's exact spelling; keep taxonomic names in original casing.
- Diagram labels in the order written; numbered/bulleted points in order.
- Chemical formulas as \\(\\text{CO}_2\\), \\(\\text{H}_2\\text{O}\\).
- Do not rewrite into textbook wording.
`,

  "social science": `
SOCIAL SCIENCE RULES
- Preserve all dates, names, places, and article numbers exactly, with original capitalisation.
- Keep numbered points in order; cause-effect chains as written.
- LaTeX rarely needed; keep prose as plain text.
`,

  science: `
SCIENCE RULES (Physics + Chemistry + Biology)
- Chemistry: preserve equations exactly, including state symbols (s)(l)(g)(aq), coefficients (even if unbalanced), arrows. Formulas as \\(\\text{H}_2\\text{SO}_4\\).
- When values are written below a chemical equation aligned with each species (e.g. molar masses, stoichiometric ratios like "s", "2s"), preserve that alignment — output them on a new line directly under the equation.
- Physics: values with units in \\text{}; preserve substitution steps.
- Biology: preserve terminology and diagram labels.
- Preserve every step in the student's order, including wrong steps and crossed-out working (in blue/black ink).
`,
};

const DISPLAY_NAME: Record<string, string> = {
  maths: "Mathematics",
  accounts: "Accounts",
  economics: "Economics",
  physics: "Physics",
  biology: "Biology",
  "social science": "Social Science",
  science: "Science",
};

function normalizeSubject(subject: string): string | undefined {
  const s = subject.toLowerCase().trim();
  if (s.includes("math")) return "maths";
  if (s.includes("account") || s.includes("commerce") || s.includes("business")) return "accounts";
  if (s.includes("econ")) return "economics";
  if (s.includes("physic")) return "physics";
  if (s.includes("bio")) return "biology";
  if (
    s.includes("social") ||
    s.includes("history") ||
    s.includes("geograph") ||
    s.includes("civic") ||
    s.includes("political")
  )
    return "social science";
  if (s.includes("science") || s.includes("chem")) return "science";
  return undefined;
}

export const TABLE_EXTRACT_PROMPT = `
You are an expert digitizer of handwritten Accountancy and Economics answers. This is NOT simple OCR — transcribe the answer exactly as a human would read it, preserving structure, layout, and every value in its correct position.

OUTPUT
- Output ONLY the transcription. No preamble, no explanation, no apologies.
- Do NOT add a question number or "Q[num]." label.
- Decide table vs plain text by ALIGNMENT, never by ruled lines. If the values line up in
  columns it IS a table — output a simple HTML table (<table><tr><td>) — even when the student
  drew no lines, no box and no borders at all. Ruled lines are never required, and a missing
  line never means "not a table".
- Only continuous prose (sentences, definitions, explanations, paragraphs of reasoning) is
  plain text. Never force a table onto prose.

TEACHER MARKS
Anything in RED ink is the teacher's, not the student's: ticks, crosses, circles, scores, grades, marginal comments, recalculated numbers, underlines, arrows. Exclude ALL red-ink content, including any red value written beside, above or over the student's own table. Transcribe ONLY the student's own ink (usually blue or black).

TRANSCRIBE, DO NOT INTERPRET
1. Copy exactly what the student wrote — mistakes, wrong totals, wrong spelling and all.
2. Never fix, complete, rewrite or re-calculate. Transcribe the working ("18000 - 17500"), never the answer it comes to.
3. Never invent or drop words. If illegible, write [unclear].
4. Copy abbreviations, and "To"/"By" and "c/d"/"b/d" notations, exactly as written.
5. Preserve definitions and terms word-for-word — never substitute a synonym.

COLUMNS
6. Reconstruct the table from VISUAL LAYOUT, not reading order. Use the layout the student
   actually drew — do not assume a shape it does not have.
7. A two-sided account (Particulars | Amount | Particulars | Amount) is ONE table with a left
   and a right side. Keep each entry on the side it was written.
8. Where a header spans sub-headers (e.g. Amount → Cash, Bank), give each sub-header its own
   column, and give the header row a cell for each one.
9. Every row must have exactly the same number of cells as the header row. Pad with empty
   cells rather than leaving a row short.
10. Determine a value's column from its horizontal position on the page, and never merge
    values from different columns into one cell.
11. Every value the student wrote must appear in the output, in the exact row and column it sits in. Never relocate a value, and never drop one.
12. A value in brackets, e.g. (17,500) or (20,000), is a value and belongs in its column — never fold it into the transaction description.

ROWS
13. Preserve every calculation row (e.g. "New Equation"), subtotal and total, in order.
14. The final total row holds only the totals as written, with its = or ≠ sign. Do not repeat the row above it.
15. If multiple accounts, tables or schedules appear, transcribe each separately in the order they appear.

ALSO CAPTURE
- Headings, narration and working notes, including any text before or after the table.
- Any graph, curve or diagram: describe it in text (type, axis labels, curve names, values). Do not skip it.
- Formulas: displayed in \\[ ... \\], inline in \\( ... \\). Formulas only — never for tabular data.
`;

export function getPromptForSubject(subject?: string | null): string {
  const key = subject ? normalizeSubject(subject) : undefined;
  const resolved = key ?? "maths";
  return corePrompt(DISPLAY_NAME[resolved]) + SUBJECT_BLOCKS[resolved];
}
