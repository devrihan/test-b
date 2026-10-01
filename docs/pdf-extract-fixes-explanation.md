# PDF Extract UI Fixes: Marker Overlay, Crop Download, Sidebar, and Landscape Image Layout

## Purpose

This document explains the fixes made in the PDF extraction frontend so that:

- The marker overlay shown on the page matches the downloaded cropped image.
- The question sidebar can be collapsed to give more space to wide pages.
- Landscape or horizontal images can be viewed properly.
- Existing overlays stay aligned when the page layout changes.

The main affected area is:

`app/(dashboard)/pdfExtract`

## Original Problem

The frontend had two different coordinate systems:

1. The visible marker overlay used absolute screen-like positions:

   - `absX1`
   - `absY1`
   - `absX2`
   - `absY2`

2. The downloaded crop used ratio positions:

   - `x1Ratio`
   - `y1Ratio`
   - `x2Ratio`
   - `y2Ratio`

The overlay looked correct because it was drawn from the raw mouse rectangle. But the downloaded PNG was cropped using ratios that were calculated separately. When the page was centered, resized, or affected by the sidebar width, the ratio calculation could be different from the visible overlay.

That is why the selected area on screen and the downloaded cropped image were not always the same.

## Root Cause

The old code guessed the page's left position using this kind of calculation:

```ts
const pageLeft = (scrollWidth - pageW) / 2;
```

This was fragile because the real page position depends on actual DOM layout:

- sidebar width
- collapsed vs expanded sidebar
- scroll container width
- page padding
- wide landscape images
- browser resize
- CSS layout behavior

The browser already knows the real position of the page. The frontend was guessing instead of measuring it.

## Fix 1: Use Real Page Geometry

File changed:

`app/(dashboard)/pdfExtract/hooks/usePDFRenderer.ts`

The renderer now stores real page geometry:

- `pageLeftsRef`
- `pageImgIdsRef`

It also exposes a new function:

```ts
measurePages()
```

This function reads the actual DOM positions and dimensions of `.pdf-page-wrap` elements:

- `offsetLeft`
- `offsetTop`
- `offsetWidth`
- `offsetHeight`

This makes the page position source of truth the actual rendered page, not a guessed formula.

## Fix 2: Convert Mouse Position Using Measured Geometry

File changed:

`app/(dashboard)/pdfExtract/hooks/useMarking.ts`

When a user draws a rectangle, the code now calculates ratios using the measured page left/top/width/height.

The important idea is:

```ts
xRatio = (mouseX - actualPageLeft) / actualPageWidth
yRatio = (mouseY - actualPageTop) / actualPageHeight
```

Then the overlay positions are derived back from those same ratios:

```ts
absX = xRatio * actualPageWidth + actualPageLeft
absY = yRatio * actualPageHeight + actualPageTop
```

This means both the overlay and the download come from the same source: the stored ratio bbox.

## Fix 3: Use Real Image IDs

File changed:

`app/(dashboard)/pdfExtract/page.tsx`

Earlier, manual marking assumed page image IDs like:

```ts
img_001
img_002
```

That is fine for local files, but cloud/API-loaded images may use different image IDs from the backend.

The renderer now tracks real image IDs per page in `pageImgIdsRef`, and manual regions use those IDs. This prevents a crop from being extracted from the wrong image.

## Fix 4: Collapsible Question Sidebar

File changed:

`app/(dashboard)/pdfExtract/components/QuestionSidebar.tsx`

A collapse/expand control was added to the question sidebar.

Expanded mode:

- width: `w-64`
- full question labels
- action buttons
- region details

Collapsed mode:

- width: `w-14`
- narrow question rail
- question numbers remain clickable
- more horizontal space is available for landscape pages

This helps when viewing wide answer sheets or horizontal scans.

## Fix 5: Landscape Image Layout

File changed:

`app/(dashboard)/pdfExtract/page.tsx`

The PDF inner container now uses:

```ts
minWidth: "100%"
width: "max-content"
```

This allows the scrollable area to grow to the width of the widest page. Without this, very wide images could overflow in a way that made part of the image unreachable or visually clipped.

## Fix 6: Re-measure After Layout Changes

Files changed:

- `app/(dashboard)/pdfExtract/page.tsx`
- `app/(dashboard)/pdfExtract/hooks/usePDFRenderer.ts`

Even after using measured geometry, there was still one more issue:

The page position can change after initial render, especially when:

- the sidebar is collapsed
- the sidebar is expanded
- the browser is resized
- the scroll area changes size

So the code now refreshes page geometry when the layout changes.

It uses `ResizeObserver` to detect layout changes and then:

1. Calls `renderer.measurePages()`
2. Recalculates overlay absolute positions from saved bbox ratios
3. Bumps the render tick so overlays repaint

This keeps old marks aligned even after the UI moves.

## New Coordinate Flow

The corrected flow is:

1. Render images into page wrappers.
2. Measure actual page DOM positions.
3. User draws on the page.
4. Mouse position is converted into bbox ratios using measured page geometry.
5. The region stores ratios as the permanent truth.
6. Overlay position is calculated from those same ratios.
7. Downloaded crop uses those same ratios against the natural image canvas.

So the permanent truth is now:

```ts
x1Ratio, y1Ratio, x2Ratio, y2Ratio
```

The absolute overlay values are only display values.

## Why This Fix Works

The downloaded crop is generated in:

`app/(dashboard)/pdfExtract/lib/extractor.ts`

It uses:

```ts
cropX = ratio * naturalImageWidth
cropY = ratio * naturalImageHeight
```

That is correct only if the ratios were calculated correctly.

The fix ensures ratios are calculated from the actual visible page geometry. Therefore:

- what the user sees
- what the overlay draws
- what the crop downloads

all refer to the same selected region.

## Verification Done

The following checks passed:

```bash
npx tsc --noEmit
```

Targeted ESLint also passed for the modified PDF extraction files.

Note: full project lint still had unrelated existing errors outside this change area.

## Files Changed

- `app/(dashboard)/pdfExtract/page.tsx`
- `app/(dashboard)/pdfExtract/hooks/usePDFRenderer.ts`
- `app/(dashboard)/pdfExtract/hooks/useMarking.ts`
- `app/(dashboard)/pdfExtract/components/QuestionSidebar.tsx`
- `app/(dashboard)/pdfExtract/components/MarkerOverlays.tsx`

## Summary

The main bug was caused by a mismatch between visible overlay coordinates and crop-download coordinates.

The fix was to stop guessing page positions and instead measure the real page layout from the DOM. The stored bbox ratios are now the single source of truth. The sidebar collapse and landscape layout fixes were added to improve usability for wide images, and resize handling was added to keep overlays aligned after layout changes.
