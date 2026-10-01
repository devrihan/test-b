import type {
  QuestionListItemDTO, UiGroup, UiBlock, ViewBlock,
  ParsedQuestion, CreateUiGroup, CreateUiBlock,
} from "./types";

export function buildUiGroups<T extends {
  questionNumber: number | null;
  optionGroup?: string | null;
  optionSet?: string | null;
  pickCount?: number | null;
}>(questions: T[]): UiGroup<T>[] {
  const result: UiGroup<T>[] = [];
  // optionGroup keys are tracked globally so alternatives across base numbers merge into one block.
  const orBlockByKey = new Map<string, { group: UiGroup<T>; block: UiBlock<T>; bases: Set<string> }>();

  questions.forEach((q, idx) => {
    const base = String(q.questionNumber).split(".")[0];
    const grp = q.optionGroup?.trim();

    if (!grp) {
      let group = result.find((g) => g.parent === base);
      if (!group) {
        group = { parent: base, blocks: [] };
        result.push(group);
      }
      group.blocks.push({ type: "compulsory", items: [{ q, idx }] });
      return;
    }

    let entry = orBlockByKey.get(grp);
    if (!entry) {
      let group = result.find((g) => g.parent === base);
      if (!group) {
        group = { parent: base, blocks: [] };
        result.push(group);
      }
      const block: UiBlock<T> = { type: "or", groupKey: grp, pickCount: q.pickCount, sets: [] };
      group.blocks.push(block);
      entry = { group, block, bases: new Set([base]) };
      orBlockByKey.set(grp, entry);
    } else if (!entry.bases.has(base)) {
      entry.bases.add(base);
      entry.group.parent = Array.from(entry.bases).join("/");
    }

    const setKey = q.optionSet?.trim() ?? "A";
    let set = entry.block.sets!.find((s) => s.set === setKey);
    if (!set) {
      set = { set: setKey, items: [] };
      entry.block.sets!.push(set);
    }
    set.items.push({ q, idx });
  });

  return result;
}

// snake_case variant for ParsedQuestion (OCR parser output)
export function buildUiGroupsForCreate(questions: ParsedQuestion[]): CreateUiGroup[] {
  const result: CreateUiGroup[] = [];
  // See buildUiGroups above — same cross-base-number OR merge, snake_case twin.
  const orBlockByKey = new Map<string, { group: CreateUiGroup; block: CreateUiBlock; bases: Set<string> }>();

  questions.forEach((q, idx) => {
    const base = q.question_number.split(".")[0];

    if (!q.option_group) {
      let group = result.find((g) => g.parent === base);
      if (!group) {
        group = { parent: base, blocks: [] };
        result.push(group);
      }
      group.blocks.push({ type: "compulsory", items: [{ q, idx }] });
      return;
    }

    let entry = orBlockByKey.get(q.option_group);
    if (!entry) {
      let group = result.find((g) => g.parent === base);
      if (!group) {
        group = { parent: base, blocks: [] };
        result.push(group);
      }
      const block: CreateUiBlock = { type: "or", groupKey: q.option_group, pickCount: q.pick_count, sets: [] };
      group.blocks.push(block);
      entry = { group, block, bases: new Set([base]) };
      orBlockByKey.set(q.option_group, entry);
    } else if (!entry.bases.has(base)) {
      entry.bases.add(base);
      entry.group.parent = Array.from(entry.bases).join("/");
    }

    const setKey = q.option_set ?? "A";
    let set = entry.block.sets!.find((s) => s.set === setKey);
    if (!set) {
      set = { set: setKey, items: [] };
      entry.block.sets!.push(set);
    }
    set.items.push({ q, idx });
  });

  return result;
}

export function buildViewBlocks<T extends {
  optionGroup?: string | null;
  optionSet?: string | null;
  pickCount?: number | null;
}>(questions: T[]): ViewBlock<T>[] {
  const blocks: ViewBlock<T>[] = [];

  questions.forEach((q) => {
    const grp = q.optionGroup?.trim();
    if (!grp) {
      blocks.push({ type: "single", items: [q] });
      return;
    }
    let block = blocks.find((b) => b.type === "or" && b.groupKey === grp);
    if (!block) {
      block = { type: "or", groupKey: grp, pickCount: q.pickCount ?? null, sets: [] };
      blocks.push(block);
    }
    const setKey = q.optionSet?.trim() || null;
    let set = block.sets!.find((s) => s.set === setKey);
    if (!set) {
      set = { set: setKey, items: [] };
      block.sets!.push(set);
    }
    set.items.push(q);
  });

  return blocks;
}

// Like buildUiGroups, but groups whole base question numbers instead of sub-parts.
export type BaseOrBlock<TBase extends number | string> =
  | { type: "single"; base: TBase }
  | { type: "or"; groupKey: string; pickCount: number | null; sets: { set: string; bases: TBase[] }[] };

export function buildBaseOrBlocks<TBase extends number | string>(
  bases: TBase[],
  info: (base: TBase) => { optionGroup: string | null; optionSet: string | null; pickCount: number | null } | undefined,
): BaseOrBlock<TBase>[] {
  const blocks: BaseOrBlock<TBase>[] = [];

  for (const base of bases) {
    const meta = info(base);
    const grp = meta?.optionGroup?.trim();
    if (!grp) {
      blocks.push({ type: "single", base });
      continue;
    }
    let block = blocks.find((b): b is Extract<BaseOrBlock<TBase>, { type: "or" }> => b.type === "or" && b.groupKey === grp);
    if (!block) {
      block = { type: "or", groupKey: grp, pickCount: meta?.pickCount ?? null, sets: [] };
      blocks.push(block);
    }
    const setKey = meta?.optionSet?.trim() ?? "A";
    let set = block.sets.find(s => s.set === setKey);
    if (!set) {
      set = { set: setKey, bases: [] };
      block.sets.push(set);
    }
    set.bases.push(base);
  }

  return blocks;
}

// numeric sort per segment so "21.10" > "21.9" (string sort would get this wrong)
export function sortByQuestionNumber(a: ParsedQuestion, b: ParsedQuestion): number {
  const partsA = a.question_number.split(".").map(Number);
  const partsB = b.question_number.split(".").map(Number);
  for (let i = 0; i < Math.max(partsA.length, partsB.length); i++) {
    const diff = (partsA[i] ?? 0) - (partsB[i] ?? 0);
    if (diff !== 0) return diff;
  }
  return 0;
}
