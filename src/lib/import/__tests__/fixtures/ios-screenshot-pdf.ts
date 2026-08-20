import { PDFDocument } from "pdf-lib";
import sharp from "sharp";
import { CANONICAL_CATEGORIES } from "../../parsers/category-map";

const SCREENSHOT_WIDTH = 1_170;
const SCREENSHOT_HEIGHT = 7_000;

function escapeXml(value: string) {
  return value
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;");
}

export function fixtureOcrText(rowsPerCategory = 2) {
  const lines = ["Scanz Market Movers — August 10, 2025"];
  CANONICAL_CATEGORIES.forEach((category, categoryIndex) => {
    lines.push(category);
    for (let row = 0; row < rowsPerCategory; row += 1) {
      const ticker = `${String.fromCharCode(65 + (categoryIndex % 26))}${String.fromCharCode(65 + row)}${String.fromCharCode(65 + ((categoryIndex + row) % 26))}X`;
      lines.push(
        `${row + 1}  ${ticker}  $${(2.25 + categoryIndex + row).toFixed(2)}  1.15  +${(8.5 + row).toFixed(2)}%  18350  12.045M  49.7M`,
      );
    }
  });
  return lines.join("\n");
}

export async function makeIosScreenshotPdf() {
  const contentLines = fixtureOcrText(3).split("\n");
  let y = 135;
  const svgLines = contentLines.map((line, index) => {
    const isTitle = index === 0;
    const isCategory = CANONICAL_CATEGORIES.includes(
      line as (typeof CANONICAL_CATEGORIES)[number],
    );
    const size = isTitle ? 36 : isCategory ? 30 : 23;
    const weight = isTitle || isCategory ? 700 : 500;
    const output = `<text x="55" y="${y}" font-family="DejaVu Sans Mono, monospace" font-size="${size}" font-weight="${weight}" fill="#111827">${escapeXml(line)}</text>`;
    y += isTitle ? 120 : isCategory ? 90 : 70;
    if (isCategory) y += 12;
    return output;
  });

  const svg = Buffer.from(`<svg xmlns="http://www.w3.org/2000/svg" width="${SCREENSHOT_WIDTH}" height="${SCREENSHOT_HEIGHT}" viewBox="0 0 ${SCREENSHOT_WIDTH} ${SCREENSHOT_HEIGHT}">
    <rect width="100%" height="100%" fill="#ffffff"/>
    <rect x="3" y="3" width="${SCREENSHOT_WIDTH - 6}" height="${SCREENSHOT_HEIGHT - 6}" fill="none" stroke="#9ca3af" stroke-width="6"/>
    <rect x="0" y="0" width="100%" height="75" fill="#111827"/>
    <text x="55" y="50" font-family="DejaVu Sans, sans-serif" font-size="28" font-weight="700" fill="#ffffff">SCANZ</text>
    ${svgLines.join("\n")}
  </svg>`);
  const screenshot = await sharp(svg).png().toBuffer();

  const document = await PDFDocument.create();
  const page = document.addPage([612, 792]);
  const embedded = await document.embedPng(screenshot);
  const height = 720;
  const width = height * (SCREENSHOT_WIDTH / SCREENSHOT_HEIGHT);
  page.drawImage(embedded, {
    x: (612 - width) / 2,
    y: (792 - height) / 2,
    width,
    height,
  });
  return Buffer.from(await document.save({ useObjectStreams: false }));
}

export async function makeRealNarrowIosScreenshotPdf() {
  const width = 1_600;
  const height = 12_000;
  const lines = fixtureOcrText(4).split("\n");
  let y = 105;
  const svgLines = lines.map((line, index) => {
    const isTitle = index === 0;
    const isCategory = CANONICAL_CATEGORIES.includes(
      line as (typeof CANONICAL_CATEGORIES)[number],
    );
    const isRow = /^\d+\s/.test(line);
    const rowNumber = isRow ? Number(line.match(/^\d+/)?.[0] ?? 0) : 0;
    const signedLine =
      isRow && rowNumber % 2 === 0
        ? line.replace(/\+(\d+\.\d+)%/, "-$1%")
        : line;
    // These dimensions model the real archive: source text is readable after
    // zooming the narrow screenshot, but the letter-page render alone leaves
    // row glyphs only a few pixels high.
    const size = isTitle ? 32 : isCategory ? 24 : 18;
    const weight = isTitle || isCategory ? 700 : 500;
    const color = isRow
      ? rowNumber % 2 === 0
        ? "#dc2626"
        : "#16a34a"
      : "#111827";
    const output = `<text x="45" y="${y}" font-family="DejaVu Sans Mono, monospace" font-size="${size}" font-weight="${weight}" fill="${color}">${escapeXml(signedLine)}</text>`;
    y += isTitle ? 110 : isCategory ? 84 : 58;
    if (isCategory) y += 8;
    return output;
  });
  const svg = Buffer.from(`<svg xmlns="http://www.w3.org/2000/svg" width="${width}" height="${height}" viewBox="0 0 ${width} ${height}">
    <rect width="100%" height="100%" fill="#ffffff"/>
    <rect x="3" y="3" width="${width - 6}" height="${height - 6}" fill="none" stroke="#9ca3af" stroke-width="6"/>
    <rect width="100%" height="62" fill="#111827"/>
    <text x="45" y="43" font-family="DejaVu Sans, sans-serif" font-size="22" font-weight="700" fill="#ffffff">SCANZ</text>
    ${svgLines.join("\n")}
  </svg>`);
  const screenshot = await sharp(svg).png().toBuffer();
  const document = await PDFDocument.create();
  const page = document.addPage([612, 792]);
  const embedded = await document.embedPng(screenshot);
  const pageHeight = 720;
  const pageWidth = pageHeight * (width / height);
  page.drawImage(embedded, {
    x: (612 - pageWidth) / 2,
    y: (792 - pageHeight) / 2,
    width: pageWidth,
    height: pageHeight,
  });
  return Buffer.from(await document.save({ useObjectStreams: false }));
}
