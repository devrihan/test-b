"use client";

import {
  createContext,
  useContext,
  useState,
  useCallback,
  ReactNode,
} from "react";
import { mergeOCRRegions } from "../lib/mergeOCRRegions";

// ── Types ────────────────────────────────────────────────────


export interface OCRRegion {
  id: string;
  pageIndex: number;
  cropRect: CropRect;
  image: string;
}

export interface CropRect {
  /** Drag start point */
  x1: number;
  y1: number;
  /** Drag end point */
  x2: number;
  y2: number;
  /** Selection dimensions */
  width: number;
  height: number;
  /** Which page/scan index the crop was made on */
  pageIndex: number;
}

export type OCRModel =
  | "gpt4o"
  | "claude-sonnet"
  | "gemini-flash";

interface OCRExtractionState {
  /** The question currently being extracted (null = idle) */
  activeQuestionId: string | null;
  /** Whether the viewer is in drag-to-select mode */
  selectionMode: boolean;
  /** The crop rectangle from user's drag selection */
  cropRect: CropRect | null;

  /** All selected OCR regions in selection order */
  regions: OCRRegion[];

  /** Final merged image used for OCR */
  mergedImage: string;
  /** Text returned by the OCR/model API */
  extractedText: string;
  /** Whether the OCR API call is in progress */
  loading: boolean;
  /** Whether the right-side drawer is open */
  drawerOpen: boolean;

  selectedModel: OCRModel;
}

interface OCRExtractionActions {
  /** Step 1: User clicks Extract on a question → enters selection mode */
  startExtraction: (questionId: string) => void;
  /** Step 2: User finishes drag → receives crop rect */
  setCropRect: (rect: CropRect) => void;
  /** Add one OCR region */
  addRegion: (region: OCRRegion) => void;
  /** Merge all regions and run OCR */
  finishOCR: () => Promise<void>;
  /** Step 4: Manually control loading state */
  setLoading: (loading: boolean) => void;
  /** Step 5: OCR API returns text → open drawer */
  setExtractedText: (text: string) => void;
  /** User edits text in the drawer */
  updateExtractedText: (text: string) => void;
  /** User clicks "Fill OCR" — parent page handles the actual fill */
  fillOCR: () => void;
  /** User clicks Retry — re-run OCR on same crop */
  retry: () => void;
  /** Cancel / ESC — reset everything */
  cancel: () => void;

  setSelectedModel: (model: OCRModel) => void;
}

interface OCRExtractionContextValue extends OCRExtractionState, OCRExtractionActions {}

// ── Context ──────────────────────────────────────────────────

const OCRExtractionContext = createContext<OCRExtractionContextValue | null>(null);

// ── Hook ─────────────────────────────────────────────────────

export function useOCRExtraction() {
  const ctx = useContext(OCRExtractionContext);
  if (!ctx) {
    throw new Error("useOCRExtraction must be used within <OCRExtractionProvider>");
  }
  return ctx;
}

// ── Initial state ────────────────────────────────────────────

const INITIAL_STATE: OCRExtractionState = {
  activeQuestionId: null,
  selectionMode: false,
  cropRect: null,
  regions: [],
  mergedImage: "",
  extractedText: "",
  loading: false,
  drawerOpen: false,
  selectedModel: "gpt4o",
};

// ── Provider ─────────────────────────────────────────────────

interface OCRExtractionProviderProps {
  children: ReactNode;
  /** Called when user confirms "Fill OCR" — receives questionId + text */
  onFillOCR: (questionId: string, extractedText: string) => void;
  /** Called when OCR needs to run — receives cropped image, returns text */
  onRunOCR?: (
  croppedImage: string,
  model: OCRModel
) => Promise<string>;
}

export function OCRExtractionProvider({
  children,
  onFillOCR,
  onRunOCR,
}: OCRExtractionProviderProps) {
  const [state, setState] = useState<OCRExtractionState>(INITIAL_STATE);

  // ── Actions ──────────────────────────────────────────────

  const startExtraction = useCallback((questionId: string) => {
    setState({
      ...INITIAL_STATE,
      activeQuestionId: questionId,
      selectionMode: true,
    });
  }, []);

  const setCropRect = useCallback((rect: CropRect) => {
    setState(prev => ({
      ...prev,
      cropRect: rect,
    }));
  }, []);



  const setLoading = useCallback((loading: boolean) => {
    setState(prev => ({ ...prev, loading }));
  }, []);


  const setSelectedModel = useCallback((model: OCRModel) => {
  setState(prev => ({
    ...prev,
    selectedModel: model,
  }));
}, []);


const addRegion = useCallback((region: OCRRegion) => {
  setState(prev => ({
    ...prev,
    regions: [...prev.regions, region],
    drawerOpen: true,
  }));
}, []);


const finishOCR = useCallback(async () => {
  if (!onRunOCR || state.regions.length === 0) {
    return;
  }

  try {
    setLoading(true);

    const merged = await mergeOCRRegions(
      state.regions.map(r => r.image)
    );

    const text = await onRunOCR(
      merged,
      state.selectedModel
    );

    setState(prev => ({
      ...prev,
      mergedImage: merged,
      extractedText: text,
      loading: false,
      drawerOpen: true,
      selectionMode: false,
    }));
  } catch (err) {
    console.error(err);

    setLoading(false);
  }
}, [
  state.regions,
  state.selectedModel,
  onRunOCR,
  setLoading,
]);

  const setExtractedText = useCallback((text: string) => {
    setState(prev => ({
      ...prev,
      extractedText: text,
      loading: false,
      drawerOpen: true,
    }));
  }, []);

  const updateExtractedText = useCallback((text: string) => {
    setState(prev => ({ ...prev, extractedText: text }));
  }, []);

  const fillOCR = useCallback(() => {
    if (state.activeQuestionId !== null) {
      onFillOCR(state.activeQuestionId, state.extractedText);
    }
    setState(INITIAL_STATE);
  }, [state.activeQuestionId, state.extractedText, onFillOCR]);

  const retry = useCallback(() => {
  finishOCR();
}, [finishOCR]);

  const cancel = useCallback(() => {
    setState(INITIAL_STATE);
  }, []);

  // ── Context value ────────────────────────────────────────

  const value: OCRExtractionContextValue = {
    ...state,
    startExtraction,
    setCropRect,
    addRegion,
    finishOCR,
    setLoading,
    setExtractedText,
    updateExtractedText,
    fillOCR,
    retry,
    cancel,
    setSelectedModel,
  };

  return (
    <OCRExtractionContext.Provider value={value}>
      {children}
    </OCRExtractionContext.Provider>
  );
}