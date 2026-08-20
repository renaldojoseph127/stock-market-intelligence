import { openPdf } from "clawpdf";
import { PDFDocument } from "pdf-lib";
import sharp, { type Sharp } from "sharp";

export const OCR_RENDER_DPI = 360;
export const OCR_PASS_A_WIDTH = 1_400;
export const OCR_PASS_B_WIDTH = 3_000;
export const OCR_PASS_C_WIDTH = 3_800;
export const OCR_SEGMENT_HEIGHT = 2_400;
export const OCR_SEGMENT_OVERLAP = 240;

const WHITE_THRESHOLD = 246;

export type OcrPassName = "A" | "B" | "C";
export type OcrPreprocessing = "grayscale" | "otsu";

export type OcrPassConfig = {
  pass: OcrPassName;
  targetWidth: number;
  segmentHeight: number;
  segmentOverlap: number;
  maxUpscale: number;
};

export const OCR_PASS_CONFIGS: Record<"A" | "B", OcrPassConfig> = {
  A: {
    pass: "A",
    targetWidth: OCR_PASS_A_WIDTH,
    segmentHeight: OCR_SEGMENT_HEIGHT,
    segmentOverlap: OCR_SEGMENT_OVERLAP,
    maxUpscale: 3,
  },
  B: {
    pass: "B",
    targetWidth: OCR_PASS_B_WIDTH,
    segmentHeight: 1_800,
    segmentOverlap: 240,
    maxUpscale: 10,
  },
};

export type OcrCrop = {
  left: number;
  top: number;
  width: number;
  height: number;
};

export type OcrSegmentProvenance = {
  index: number;
  top: number;
  height: number;
  keepTop: number;
  keepBottom: number;
};

export type OcrPageProvenance = {
  renderDpi: number;
  renderedWidth: number;
  renderedHeight: number;
  crop: OcrCrop;
  whiteMarginCropped: boolean;
  normalizedWidth: number;
  normalizedHeight: number;
  upscaleFactor: number;
  segmentOverlap: number;
  segments: OcrSegmentProvenance[];
};

export type PreparedOcrSource = {
  pdf: Buffer;
  pageNumber: number;
  renderedImage: Buffer;
  croppedImage: Buffer;
  renderDpi: number;
  renderedWidth: number;
  renderedHeight: number;
  crop: OcrCrop;
};

export type PreparedOcrPage = {
  source: PreparedOcrSource;
  pass: "A" | "B";
  regions: OcrSegmentProvenance[];
  provenance: OcrPageProvenance;
};

export type RenderedOcrRegion = {
  image: Buffer;
  padding: number;
  scaleFromNormalized: number;
};

export async function renderPage(
  buffer: Buffer,
  pageNumber: number,
  dpi = OCR_RENDER_DPI,
) {
  const document = await openPdf(new Uint8Array(buffer));
  try {
    return Buffer.from(
      await document.page(pageNumber).png({
        dpi,
        forms: true,
        background: "white",
      }),
    );
  } finally {
    document.destroy();
  }
}

function findContentBounds(
  pixels: Buffer,
  width: number,
  height: number,
): OcrCrop {
  const rowCounts = new Uint32Array(height);
  const columnCounts = new Uint32Array(width);

  for (let y = 0; y < height; y += 1) {
    const offset = y * width;
    for (let x = 0; x < width; x += 1) {
      if (pixels[offset + x] < WHITE_THRESHOLD) {
        rowCounts[y] += 1;
        columnCounts[x] += 1;
      }
    }
  }

  const rowMinimum = Math.max(2, Math.floor(width * 0.0008));
  const columnMinimum = Math.max(2, Math.floor(height * 0.00025));
  let left = 0;
  let right = width - 1;
  let top = 0;
  let bottom = height - 1;

  while (left < width && columnCounts[left] < columnMinimum) left += 1;
  while (right >= left && columnCounts[right] < columnMinimum) right -= 1;
  while (top < height && rowCounts[top] < rowMinimum) top += 1;
  while (bottom >= top && rowCounts[bottom] < rowMinimum) bottom -= 1;

  if (left >= width || top >= height || right - left < 40 || bottom - top < 40) {
    return { left: 0, top: 0, width, height };
  }

  const padding = Math.max(16, Math.round(Math.min(width, height) * 0.006));
  left = Math.max(0, left - padding);
  top = Math.max(0, top - padding);
  right = Math.min(width - 1, right + padding);
  bottom = Math.min(height - 1, bottom + padding);

  return {
    left,
    top,
    width: right - left + 1,
    height: bottom - top + 1,
  };
}

function calculateUpscale(crop: OcrCrop, config: OcrPassConfig) {
  return Math.max(
    1,
    Math.min(config.maxUpscale, config.targetWidth / crop.width),
  );
}

export function planVerticalSegments(
  imageHeight: number,
  segmentHeight = OCR_SEGMENT_HEIGHT,
  overlap = OCR_SEGMENT_OVERLAP,
): OcrSegmentProvenance[] {
  if (imageHeight <= segmentHeight) {
    return [
      {
        index: 0,
        top: 0,
        height: imageHeight,
        keepTop: 0,
        keepBottom: imageHeight,
      },
    ];
  }

  const regions: OcrSegmentProvenance[] = [];
  const step = segmentHeight - overlap;
  let top = 0;
  let index = 0;

  while (top < imageHeight) {
    const height = Math.min(segmentHeight, imageHeight - top);
    const isFirst = index === 0;
    const isLast = top + height >= imageHeight;
    regions.push({
      index,
      top,
      height,
      keepTop: isFirst ? 0 : Math.floor(overlap / 2),
      keepBottom: isLast ? height : height - Math.ceil(overlap / 2),
    });
    if (isLast) break;
    top += step;
    index += 1;
  }

  return regions;
}

export async function prepareOcrSource(
  pdf: Buffer,
  pageNumber: number,
): Promise<PreparedOcrSource> {
  const renderedImage = await renderPage(pdf, pageNumber, OCR_RENDER_DPI);
  const image = sharp(renderedImage).flatten({ background: "white" });
  const metadata = await image.metadata();
  const renderedWidth = metadata.width;
  const renderedHeight = metadata.height;
  if (!renderedWidth || !renderedHeight) {
    throw new Error("The rendered PDF page had no usable image dimensions.");
  }

  const greyPixels = await image.clone().greyscale().raw().toBuffer();
  const crop = findContentBounds(greyPixels, renderedWidth, renderedHeight);
  const croppedImage = await image
    .clone()
    .extract(crop)
    .png({ compressionLevel: 6 })
    .toBuffer();

  return {
    pdf,
    pageNumber,
    renderedImage,
    croppedImage,
    renderDpi: OCR_RENDER_DPI,
    renderedWidth,
    renderedHeight,
    crop,
  };
}

export function prepareOcrPass(
  source: PreparedOcrSource,
  config: OcrPassConfig,
): PreparedOcrPage {
  const upscaleFactor = calculateUpscale(source.crop, config);
  const normalizedWidth = Math.max(
    source.crop.width,
    Math.round(source.crop.width * upscaleFactor),
  );
  const normalizedHeight = Math.max(
    source.crop.height,
    Math.round(source.crop.height * upscaleFactor),
  );
  const segments = planVerticalSegments(
    normalizedHeight,
    config.segmentHeight,
    config.segmentOverlap,
  );

  return {
    source,
    pass: config.pass as "A" | "B",
    regions: segments,
    provenance: {
      renderDpi: source.renderDpi,
      renderedWidth: source.renderedWidth,
      renderedHeight: source.renderedHeight,
      crop: source.crop,
      whiteMarginCropped:
        source.crop.left > 0 ||
        source.crop.top > 0 ||
        source.crop.width < source.renderedWidth ||
        source.crop.height < source.renderedHeight,
      normalizedWidth,
      normalizedHeight,
      upscaleFactor,
      segmentOverlap: config.segmentOverlap,
      segments,
    },
  };
}

export async function prepareOcrPage(
  pdf: Buffer,
  pageNumber: number,
  pass: "A" | "B" = "A",
) {
  return prepareOcrPass(
    await prepareOcrSource(pdf, pageNumber),
    OCR_PASS_CONFIGS[pass],
  );
}

export function calculateOtsuThreshold(pixels: Buffer) {
  const histogram = new Uint32Array(256);
  for (const value of pixels) histogram[value] += 1;
  const total = pixels.length;
  let allIntensity = 0;
  for (let value = 0; value < 256; value += 1) {
    allIntensity += value * histogram[value];
  }

  let backgroundWeight = 0;
  let backgroundIntensity = 0;
  let bestVariance = -1;
  let bestThreshold = 180;
  for (let threshold = 0; threshold < 256; threshold += 1) {
    backgroundWeight += histogram[threshold];
    if (!backgroundWeight) continue;
    const foregroundWeight = total - backgroundWeight;
    if (!foregroundWeight) break;
    backgroundIntensity += threshold * histogram[threshold];
    const backgroundMean = backgroundIntensity / backgroundWeight;
    const foregroundMean =
      (allIntensity - backgroundIntensity) / foregroundWeight;
    const variance =
      backgroundWeight *
      foregroundWeight *
      (backgroundMean - foregroundMean) ** 2;
    if (variance > bestVariance) {
      bestVariance = variance;
      bestThreshold = threshold;
    }
  }
  return bestThreshold;
}

async function preprocessImage(
  image: Sharp,
  width: number,
  height: number,
  preprocessing: OcrPreprocessing,
) {
  // Scanz uses both red and green text. Conventional luminance conversion can
  // make saturated green rows nearly white, so first collapse every pixel to
  // its darkest colour channel. This retains black text and makes either row
  // colour equally dark without teaching OCR to trust a particular palette.
  const { data: rgb, info } = await image
    .resize(width, height, {
      kernel: sharp.kernel.lanczos3,
      withoutEnlargement: false,
    })
    .removeAlpha()
    .toColourspace("srgb")
    .raw()
    .toBuffer({ resolveWithObject: true });
  const neutralPixels = Buffer.allocUnsafe(info.width * info.height);
  for (let source = 0, target = 0; target < neutralPixels.length; target += 1) {
    neutralPixels[target] = Math.min(
      rgb[source],
      rgb[source + 1],
      rgb[source + 2],
    );
    source += info.channels;
  }
  const grayscale = sharp(neutralPixels, {
    raw: { width: info.width, height: info.height, channels: 1 },
  })
    .normalize()
    .sharpen({ sigma: 0.45 });

  if (preprocessing === "grayscale") {
    return grayscale.png({ compressionLevel: 6 }).toBuffer();
  }

  const pixels = await grayscale.clone().raw().toBuffer();
  const threshold = calculateOtsuThreshold(pixels);
  return sharp(pixels, { raw: { width, height, channels: 1 } })
    .threshold(threshold)
    .png({ compressionLevel: 6 })
    .toBuffer();
}

async function renderNativePdfRegion(
  prepared: PreparedOcrPage,
  region: OcrSegmentProvenance,
  targetWidth: number,
) {
  const sourceDocument = await PDFDocument.load(prepared.source.pdf, {
    updateMetadata: false,
  });
  const sourcePage = sourceDocument.getPage(prepared.source.pageNumber - 1);
  const { width: pageWidth, height: pageHeight } = sourcePage.getSize();
  const crop = prepared.source.crop;
  const normalizedScale = prepared.provenance.normalizedWidth / crop.width;
  const sourceTop = Math.max(0, region.top / normalizedScale);
  const sourceBottom = Math.min(
    crop.height,
    (region.top + region.height) / normalizedScale,
  );
  const scaleX = pageWidth / prepared.source.renderedWidth;
  const scaleY = pageHeight / prepared.source.renderedHeight;
  const left = crop.left * scaleX;
  const right = (crop.left + crop.width) * scaleX;
  const top = pageHeight - (crop.top + sourceTop) * scaleY;
  const bottom = pageHeight - (crop.top + sourceBottom) * scaleY;
  const clippedWidth = Math.max(1, right - left);
  const clippedHeight = Math.max(1, top - bottom);

  const segmentDocument = await PDFDocument.create();
  const embedded = await segmentDocument.embedPage(sourcePage, {
    left,
    right,
    bottom,
    top,
  });
  const segmentPage = segmentDocument.addPage([clippedWidth, clippedHeight]);
  segmentPage.drawPage(embedded, {
    x: 0,
    y: 0,
    width: clippedWidth,
    height: clippedHeight,
  });
  const segmentPdf = Buffer.from(
    await segmentDocument.save({ useObjectStreams: false }),
  );
  const document = await openPdf(new Uint8Array(segmentPdf));
  try {
    return Buffer.from(
      await document.page(1).png({
        width: targetWidth,
        forms: true,
        background: "white",
      }),
    );
  } finally {
    document.destroy();
  }
}

/**
 * Renders one normalized-coordinate region directly from the cropped source.
 * High-magnification passes therefore never build a 50-100 MP full-page
 * bitmap in memory merely to slice it back into OCR segments.
 */
export async function renderPreparedRegion(
  prepared: PreparedOcrPage,
  region: OcrSegmentProvenance,
  preprocessing: OcrPreprocessing = "grayscale",
  targetWidth = prepared.provenance.normalizedWidth,
): Promise<RenderedOcrRegion> {
  const normalizedScale =
    prepared.provenance.normalizedWidth / prepared.source.crop.width;
  const sourceTop = Math.max(0, Math.floor(region.top / normalizedScale));
  const sourceBottom = Math.min(
    prepared.source.crop.height,
    Math.ceil((region.top + region.height) / normalizedScale),
  );
  const sourceHeight = Math.max(1, sourceBottom - sourceTop);
  const effectiveScale = targetWidth / prepared.source.crop.width;
  const targetHeight = Math.max(1, Math.round(sourceHeight * effectiveScale));
  const padding = 20;
  const sourceImage =
    prepared.pass === "B"
      ? sharp(await renderNativePdfRegion(prepared, region, targetWidth))
      : sharp(prepared.source.croppedImage).extract({
          left: 0,
          top: sourceTop,
          width: prepared.source.crop.width,
          height: sourceHeight,
        });
  const image = await preprocessImage(
    sourceImage,
    targetWidth,
    targetHeight,
    preprocessing,
  );

  return {
    image: await sharp(image)
      .extend({
        top: padding,
        bottom: padding,
        left: padding,
        right: padding,
        background: "white",
      })
      .png({ compressionLevel: 6 })
      .toBuffer(),
    padding,
    scaleFromNormalized: targetWidth / prepared.provenance.normalizedWidth,
  };
}

export async function renderNormalizedScreenshot(
  prepared: PreparedOcrPage,
  preprocessing: OcrPreprocessing = "grayscale",
) {
  return preprocessImage(
    sharp(prepared.source.croppedImage),
    prepared.provenance.normalizedWidth,
    prepared.provenance.normalizedHeight,
    preprocessing,
  );
}
