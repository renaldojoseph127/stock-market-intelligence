import { createHash } from "node:crypto";
import { mkdir, writeFile } from "node:fs/promises";
import path from "node:path";
import { createWorker, PSM, type Page, type Worker } from "tesseract.js";
import { parseCategory } from "../parsers/parse-category";
import { parseDate } from "../parsers/parse-date";
import { parseMarketRow } from "../parsers/parse-market-row";
import {
  OCR_PASS_CONFIGS,
  OCR_PASS_C_WIDTH,
  planVerticalSegments,
  prepareOcrPass,
  prepareOcrSource,
  renderNormalizedScreenshot,
  renderPreparedRegion,
  type OcrPageProvenance,
  type OcrPassName,
  type OcrPreprocessing,
  type OcrSegmentProvenance,
  type PreparedOcrPage,
  type PreparedOcrSource,
} from "./render-pages";

type OcrSegmentResult = OcrSegmentProvenance & {
  confidence: number;
  recognizedLines: number;
  psm: string;
  preprocessing: OcrPreprocessing;
};

export type OcrQuality = {
  validDate: boolean;
  categoryCount: number;
  rowCount: number;
  alignedRowCount: number;
  misalignedRowCount: number;
  parserErrorCount: number;
  confidence: number;
  score: number;
  adequate: boolean;
  validationFailures: string[];
};

export type OcrAttemptDiagnostic = {
  pass: OcrPassName;
  targetWidth: number;
  scaleFactor: number;
  nativePdfRerender: boolean;
  normalizedWidth: number;
  normalizedHeight: number;
  segmentCount: number;
  tableRegionCount: number;
  psm: string;
  preprocessing: OcrPreprocessing | "adaptive";
  quality: OcrQuality;
};

export type OcrTableRegionDiagnostic = {
  index: number;
  category: string | null;
  top: number;
  height: number;
  targetWidth: number;
  psm: string;
  preprocessing: OcrPreprocessing;
};

export type OcrProvenance = Omit<OcrPageProvenance, "segments"> & {
  selectedPass: OcrPassName;
  segments: OcrSegmentResult[];
  attempts: OcrAttemptDiagnostic[];
  tableRegions: OcrTableRegionDiagnostic[];
  quality: OcrQuality;
  debugArtifactsSaved: boolean;
};

export type OcrResult = {
  text: string;
  confidence: number;
  provenance?: OcrProvenance;
  quality?: OcrQuality;
};

export interface OcrProvider {
  recognize(pdf: Buffer, pageNumber: number): Promise<OcrResult>;
  close?(): Promise<void>;
}

export type RecognizedLine = {
  text: string;
  confidence: number;
  y: number;
  x: number;
};

type RecognizedPass = {
  pass: OcrPassName;
  targetWidth: number;
  prepared: PreparedOcrPage;
  text: string;
  confidence: number;
  lines: RecognizedLine[];
  segments: OcrSegmentResult[];
  quality: OcrQuality;
  psm: PSM;
  preprocessing: OcrPreprocessing | "adaptive";
  tableRegions: OcrTableRegionDiagnostic[];
};

type TableRegion = OcrSegmentProvenance & {
  category: string | null;
  anchorText: string | null;
};

const MIN_OCR_CONFIDENCE = 0.65;
const MIN_COMPLETE_CATEGORIES = 8;
const MIN_COMPLETE_ROWS = 24;
const MIN_ALIGNED_ROW_RATIO = 0.65;
const TABLE_CHARACTER_WHITELIST =
  "ABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789$%+-.&,/() ";

function cleanLine(value: string) {
  return value.replace(/[\t ]+/g, " ").trim();
}

function normalizedLine(value: string) {
  return cleanLine(value).toUpperCase();
}

export function mergeTextSegments(parts: string[]) {
  const combined: string[] = [];
  for (const part of parts) {
    const next = part.split(/\r?\n/).map(cleanLine).filter(Boolean);
    let overlap = 0;
    const maximum = Math.min(12, combined.length, next.length);
    for (let count = maximum; count > 0; count -= 1) {
      const suffix = combined.slice(-count).map(normalizedLine);
      const prefix = next.slice(0, count).map(normalizedLine);
      if (suffix.every((line, index) => line === prefix[index])) {
        overlap = count;
        break;
      }
    }
    combined.push(...next.slice(overlap));
  }
  return combined.join("\n");
}

function clampConfidence(value: number) {
  return Math.max(0, Math.min(1, value / 100));
}

function countAlignedValues(row: NonNullable<ReturnType<typeof parseMarketRow>["row"]>) {
  return [
    row.price,
    row.changeAmount,
    row.changePercent,
    row.trades,
    row.volume,
    row.dollarVolume,
  ].filter((value) => value != null).length;
}

export function evaluateOcrQuality(text: string, confidence: number): OcrQuality {
  const categories = new Set<string>();
  let currentCategory: string | null = null;
  let rowCount = 0;
  let alignedRowCount = 0;
  let parserErrorCount = 0;

  for (const line of text.split(/\r?\n/)) {
    const category = parseCategory(line);
    if (category) {
      currentCategory = category;
      categories.add(category);
      continue;
    }
    if (!currentCategory) continue;
    const parsed = parseMarketRow(line, currentCategory, 1);
    parserErrorCount += parsed.issues.length;
    if (!parsed.row) continue;
    rowCount += 1;
    if (countAlignedValues(parsed.row) >= 4) alignedRowCount += 1;
  }

  const validDate = Boolean(parseDate(text));
  const misalignedRowCount = rowCount - alignedRowCount;
  const alignedRatio = rowCount ? alignedRowCount / rowCount : 0;
  const validationFailures: string[] = [];
  if (!validDate) validationFailures.push("No valid printed report date.");
  if (categories.size === 0) {
    validationFailures.push("No supported market category.");
  } else if (categories.size < MIN_COMPLETE_CATEGORIES) {
    validationFailures.push(
      `Only ${categories.size} supported categories; expected at least ${MIN_COMPLETE_CATEGORIES} for a typical complete report.`,
    );
  }
  if (rowCount < MIN_COMPLETE_ROWS) {
    validationFailures.push(
      `Only ${rowCount} usable rows; expected at least ${MIN_COMPLETE_ROWS} for a typical complete report.`,
    );
  }
  if (rowCount > 0 && alignedRatio < MIN_ALIGNED_ROW_RATIO) {
    validationFailures.push(
      `Only ${Math.round(alignedRatio * 100)}% of rows had at least four aligned numeric columns.`,
    );
  }
  if (
    parserErrorCount > 12 &&
    parserErrorCount / Math.max(1, rowCount) > 0.35
  ) {
    validationFailures.push(
      `${parserErrorCount} parser errors were disproportionate to ${rowCount} usable rows.`,
    );
  }
  if (confidence < MIN_OCR_CONFIDENCE) {
    validationFailures.push(
      `OCR confidence ${Math.round(confidence * 100)}% was below ${Math.round(MIN_OCR_CONFIDENCE * 100)}%.`,
    );
  }

  const score =
    (validDate ? 400 : 0) +
    categories.size * 120 +
    rowCount * 18 +
    alignedRowCount * 15 +
    confidence * 100 -
    parserErrorCount * 2 -
    misalignedRowCount * 12;

  return {
    validDate,
    categoryCount: categories.size,
    rowCount,
    alignedRowCount,
    misalignedRowCount,
    parserErrorCount,
    confidence,
    score,
    adequate: validationFailures.length === 0,
    validationFailures,
  };
}

function wordsToPositionedLines(
  data: Page,
  region: OcrSegmentProvenance,
  padding: number,
  scaleFromNormalized: number,
) {
  const words =
    data.blocks?.flatMap((block) =>
      block.paragraphs.flatMap((paragraph) =>
        paragraph.lines.flatMap((line) => line.words),
      ),
    ) ?? [];
  if (!words.length) return [];

  const positionedWords = words
    .map((word) => ({
      text: cleanLine(word.text),
      confidence: clampConfidence(word.confidence),
      x: (word.bbox.x0 - padding) / scaleFromNormalized,
      y:
        ((word.bbox.y0 + word.bbox.y1) / 2 - padding) /
        scaleFromNormalized,
      height: (word.bbox.y1 - word.bbox.y0) / scaleFromNormalized,
    }))
    .filter(
      (word) =>
        word.text && word.y >= region.keepTop && word.y < region.keepBottom,
    )
    .sort((left, right) => left.y - right.y || left.x - right.x);

  const rows: Array<typeof positionedWords> = [];
  for (const word of positionedWords) {
    const prior = rows.at(-1);
    const priorY = prior
      ? prior.reduce((sum, item) => sum + item.y, 0) / prior.length
      : 0;
    const tolerance = Math.max(8, word.height * 0.7);
    if (prior && Math.abs(word.y - priorY) <= tolerance) prior.push(word);
    else rows.push([word]);
  }

  return rows.map((row) => {
    row.sort((left, right) => left.x - right.x);
    const weight = row.reduce((sum, word) => sum + word.text.length, 0);
    return {
      text: cleanLine(row.map((word) => word.text).join(" ")),
      confidence:
        row.reduce(
          (sum, word) => sum + word.confidence * word.text.length,
          0,
        ) / Math.max(1, weight),
      x: row[0]?.x ?? 0,
      y:
        region.top +
        row.reduce((sum, word) => sum + word.y, 0) / Math.max(1, row.length),
    };
  });
}

function weightedConfidence(lines: RecognizedLine[], fallback: number) {
  if (!lines.length) return fallback;
  const weight = lines.reduce((sum, line) => sum + line.text.length, 0);
  return (
    lines.reduce(
      (sum, line) => sum + line.confidence * line.text.length,
      0,
    ) / Math.max(1, weight)
  );
}

class OcrDebugWriter {
  readonly enabled: boolean;
  private directory: string | null;

  constructor(pdf: Buffer, pageNumber: number) {
    const root = process.env.IMPORT_OCR_DEBUG_DIR?.trim();
    this.enabled = Boolean(root);
    this.directory = root
      ? path.join(
          path.resolve(root),
          `${createHash("sha256").update(pdf).digest("hex").slice(0, 12)}-page-${pageNumber}`,
        )
      : null;
  }

  async save(name: string, image: Buffer) {
    if (!this.directory) return;
    await mkdir(this.directory, { recursive: true });
    await writeFile(path.join(this.directory, name), image);
  }
}

function attemptDiagnostic(result: RecognizedPass): OcrAttemptDiagnostic {
  return {
    pass: result.pass,
    targetWidth: result.targetWidth,
    scaleFactor: result.targetWidth / result.prepared.source.crop.width,
    nativePdfRerender: result.pass !== "A",
    normalizedWidth: result.prepared.provenance.normalizedWidth,
    normalizedHeight: result.prepared.provenance.normalizedHeight,
    segmentCount: result.segments.length,
    tableRegionCount: result.tableRegions.length,
    psm: result.psm,
    preprocessing: result.preprocessing,
    quality: result.quality,
  };
}

function tableCandidateScore(result: RecognizedPass) {
  return (
    result.quality.categoryCount * 300 +
    result.quality.alignedRowCount * 80 +
    result.quality.rowCount * 30 +
    result.confidence * 100 -
    result.quality.parserErrorCount * 3 -
    result.quality.misalignedRowCount * 20
  );
}

function median(values: number[]) {
  const ordered = [...values].sort((left, right) => left - right);
  if (!ordered.length) return 2_000;
  return ordered[Math.floor(ordered.length / 2)];
}

export function detectTableRegions(
  lines: RecognizedLine[],
  imageHeight: number,
): TableRegion[] {
  const anchors = lines
    .map((line) => ({ ...line, category: parseCategory(line.text) }))
    .filter((line): line is typeof line & { category: string } =>
      Boolean(line.category),
    )
    .sort((left, right) => left.y - right.y)
    .filter(
      (line, index, values) =>
        index === 0 ||
        line.category !== values[index - 1].category ||
        line.y - values[index - 1].y > 120,
    );

  if (anchors.length >= 2) {
    const typicalHeight = Math.max(
      700,
      Math.min(
        3_500,
        Math.round(
          median(anchors.slice(1).map((anchor, index) => anchor.y - anchors[index].y)) *
            1.1,
        ),
      ),
    );
    return anchors.map((anchor, index) => {
      const top = Math.max(0, Math.floor(anchor.y - 90));
      const next = anchors[index + 1];
      const bottom = next
        ? Math.max(top + 500, Math.floor(next.y - 50))
        : Math.min(imageHeight, top + typicalHeight);
      return {
        index,
        top,
        height: Math.max(1, bottom - top),
        keepTop: 0,
        keepBottom: Math.max(1, bottom - top),
        category: anchor.category,
        anchorText: anchor.text,
      };
    });
  }

  // If even high-magnification headings are sparse, use smaller recovery
  // regions. These still preserve top-to-bottom order and can rediscover
  // headings without trusting confidence alone.
  return planVerticalSegments(imageHeight, 1_400, 180).map((region) => ({
    ...region,
    category: null,
    anchorText: null,
  }));
}

export class TesseractOcrProvider implements OcrProvider {
  private workerPromise: Promise<Worker> | null = null;

  private async worker() {
    if (!this.workerPromise) this.workerPromise = createWorker("eng");
    return this.workerPromise;
  }

  private async recognizeRegions(
    prepared: PreparedOcrPage,
    regions: TableRegion[] | OcrSegmentProvenance[],
    psm: PSM,
    preprocessing: OcrPreprocessing,
    debug: OcrDebugWriter,
    debugPrefix: string,
    targetWidth = prepared.provenance.normalizedWidth,
    tableMode = false,
  ): Promise<RecognizedPass> {
    const worker = await this.worker();
    await worker.setParameters({
      tessedit_pageseg_mode: psm,
      preserve_interword_spaces: "1",
      user_defined_dpi: "360",
      tessedit_char_whitelist: tableMode ? TABLE_CHARACTER_WHITELIST : "",
    });
    const lines: RecognizedLine[] = [];
    const textParts: string[] = [];
    const segments: OcrSegmentResult[] = [];

    for (const region of regions) {
      const rendered = await renderPreparedRegion(
        prepared,
        region,
        preprocessing,
        targetWidth,
      );
      await debug.save(
        `${debugPrefix}-segment-${region.index.toString().padStart(3, "0")}.png`,
        rendered.image,
      );
      const result = await worker.recognize(
        rendered.image,
        {},
        { text: true, blocks: true },
      );
      const positioned = wordsToPositionedLines(
        result.data,
        region,
        rendered.padding,
        rendered.scaleFromNormalized,
      );
      if (positioned.length) lines.push(...positioned);
      else textParts.push(result.data.text);
      segments.push({
        index: region.index,
        top: region.top,
        height: region.height,
        keepTop: region.keepTop,
        keepBottom: region.keepBottom,
        confidence: clampConfidence(result.data.confidence),
        recognizedLines: positioned.length,
        psm,
        preprocessing,
      });
    }

    lines.sort((left, right) => left.y - right.y || left.x - right.x);
    const text = lines.length
      ? lines.map((line) => line.text).join("\n")
      : mergeTextSegments(textParts);
    const confidence = weightedConfidence(
      lines,
      segments.reduce((sum, segment) => sum + segment.confidence, 0) /
        Math.max(1, segments.length),
    );
    const quality = evaluateOcrQuality(text, confidence);

    return {
      pass: prepared.pass,
      targetWidth,
      prepared,
      text,
      confidence,
      lines,
      segments,
      quality,
      psm,
      preprocessing,
      tableRegions: [],
    };
  }

  private async passC(
    passB: RecognizedPass,
    debug: OcrDebugWriter,
  ): Promise<RecognizedPass> {
    const regions = detectTableRegions(
      passB.lines,
      passB.prepared.provenance.normalizedHeight,
    );
    const candidates: Array<{
      psm: PSM;
      preprocessing: OcrPreprocessing;
    }> = [
      { psm: PSM.SPARSE_TEXT, preprocessing: "grayscale" },
      { psm: PSM.SINGLE_BLOCK, preprocessing: "grayscale" },
      { psm: PSM.SPARSE_TEXT, preprocessing: "otsu" },
      { psm: PSM.SINGLE_BLOCK, preprocessing: "otsu" },
    ];
    const benchmarkRegion = [regions[0]];
    const benchmarkResults: RecognizedPass[] = [];
    for (const candidate of candidates) {
      benchmarkResults.push(
        await this.recognizeRegions(
          passB.prepared,
          benchmarkRegion,
          candidate.psm,
          candidate.preprocessing,
          debug,
          `pass-c-benchmark-${candidate.preprocessing}-${candidate.psm}`,
          OCR_PASS_C_WIDTH,
          true,
        ),
      );
    }
    benchmarkResults.sort(
      (left, right) => tableCandidateScore(right) - tableCandidateScore(left),
    );
    const selected = benchmarkResults[0];
    const hasAnchors = regions.some((region) => region.anchorText);
    const header =
      hasAnchors && regions[0].top > 0
        ? await this.recognizeRegions(
            passB.prepared,
            [
              {
                index: -1,
                top: 0,
                height: Math.min(
                  passB.prepared.provenance.normalizedHeight,
                  regions[0].top + 60,
                ),
                keepTop: 0,
                keepBottom: Math.min(
                  passB.prepared.provenance.normalizedHeight,
                  regions[0].top + 60,
                ),
              },
            ],
            PSM.SPARSE_TEXT,
            "grayscale",
            debug,
            "pass-c-header",
            OCR_PASS_C_WIDTH,
          )
        : null;
    const remaining = regions.slice(1);
    const remainder = remaining.length
      ? await this.recognizeRegions(
          passB.prepared,
          remaining,
          selected.psm,
          selected.preprocessing as OcrPreprocessing,
          debug,
          "pass-c-table",
          OCR_PASS_C_WIDTH,
          true,
        )
      : null;
    const tableLines = [...selected.lines, ...(remainder?.lines ?? [])].sort(
      (left, right) => left.y - right.y || left.x - right.x,
    );
    const firstAnchorY = regions.find((region) => region.anchorText)?.top ?? 0;
    const headerLines = [...(header?.lines ?? []), ...passB.lines]
      .filter(
        (line) =>
          line.y < firstAnchorY &&
          (Boolean(parseDate(line.text)) || /SCANZ|MARKET MOVERS/i.test(line.text)),
      )
      .filter(
        (line, index, values) =>
          values.findIndex(
            (candidate) => normalizedLine(candidate.text) === normalizedLine(line.text),
          ) === index,
      );
    const anchoredText = hasAnchors
      ? [
          ...headerLines.map((line) => line.text),
          ...regions.flatMap((region) => {
            const regionLines = tableLines
              .filter(
                (line) =>
                  line.y >= region.top && line.y < region.top + region.height,
              )
              .map((line) => line.text);
            return region.anchorText
              ? [region.anchorText, ...regionLines]
              : regionLines;
          }),
        ].join("\n")
      : mergeTextSegments([
          selected.text,
          ...(remainder ? [remainder.text] : []),
        ]);
    const combinedLines = [...headerLines, ...tableLines];
    const confidence = weightedConfidence(
      combinedLines,
      remainder
        ? (selected.confidence + remainder.confidence) / 2
        : selected.confidence,
    );
    const quality = evaluateOcrQuality(anchoredText, confidence);
    const tableRegions = regions.map((region) => ({
      index: region.index,
      category: region.category,
      top: region.top,
      height: region.height,
      targetWidth: OCR_PASS_C_WIDTH,
      psm: selected.psm,
      preprocessing: selected.preprocessing as OcrPreprocessing,
    }));

    return {
      pass: "C",
      targetWidth: OCR_PASS_C_WIDTH,
      prepared: passB.prepared,
      text: anchoredText,
      confidence,
      lines: combinedLines,
      segments: [
        ...(header?.segments ?? []),
        ...selected.segments,
        ...(remainder?.segments ?? []),
      ],
      quality,
      psm: selected.psm,
      preprocessing: selected.preprocessing,
      tableRegions,
    };
  }

  async recognize(pdf: Buffer, pageNumber: number): Promise<OcrResult> {
    const source: PreparedOcrSource = await prepareOcrSource(pdf, pageNumber);
    const debug = new OcrDebugWriter(pdf, pageNumber);
    await debug.save("rendered-page.png", source.renderedImage);
    await debug.save("detected-crop.png", source.croppedImage);

    const passAImage = debug.enabled
      ? await renderNormalizedScreenshot(
          prepareOcrPass(source, OCR_PASS_CONFIGS.A),
        )
      : null;
    if (passAImage) await debug.save("pass-a-normalized.png", passAImage);
    const passA = await this.recognizeRegions(
      prepareOcrPass(source, OCR_PASS_CONFIGS.A),
      prepareOcrPass(source, OCR_PASS_CONFIGS.A).regions,
      PSM.AUTO,
      "grayscale",
      debug,
      "pass-a",
    );
    const attempts = [attemptDiagnostic(passA)];
    let selected = passA;

    if (!passA.quality.adequate) {
      const preparedB = prepareOcrPass(source, OCR_PASS_CONFIGS.B);
      if (debug.enabled) {
        await debug.save(
          "pass-b-high-resolution-crop.png",
          await renderNormalizedScreenshot(preparedB),
        );
      }
      const passB = await this.recognizeRegions(
        preparedB,
        preparedB.regions,
        PSM.AUTO,
        "grayscale",
        debug,
        "pass-b",
      );
      attempts.push(attemptDiagnostic(passB));
      selected = passB.quality.score >= passA.quality.score ? passB : passA;

      if (!passB.quality.adequate) {
        const passC = await this.passC(passB, debug);
        attempts.push(attemptDiagnostic(passC));
        selected = [selected, passC].sort(
          (left, right) => right.quality.score - left.quality.score,
        )[0];
      }
    }

    return {
      text: selected.text,
      confidence: selected.confidence,
      quality: selected.quality,
      provenance: {
        ...selected.prepared.provenance,
        selectedPass: selected.pass,
        segments: selected.segments,
        attempts,
        tableRegions: selected.tableRegions,
        quality: selected.quality,
        debugArtifactsSaved: debug.enabled,
      },
    };
  }

  async close() {
    const worker = await this.workerPromise;
    this.workerPromise = null;
    await worker?.terminate();
  }
}
