#!/usr/bin/env node
/**
 * parallax.js
 *
 * (ES Module) Takes an input PNG, applies rounded corners, and tiles it in a
 * stepped grid with specified rows, columns, spacing, rotation, and output
 * resolution. Uses an oversize‐then‐crop approach, but ensures the crop
 * coordinates never go negative (by clamping).
 *
 * Usage:
 *   ./static-sitegen/bin/parallax.js \
 *     <input_path> <n_rows> <n_cols> <resolution> <rotate_deg> <spacing_px> <output_path>
 *
 * Example:
 *   ./static-sitegen/bin/parallax.js \
 *     static-sitegen/assets/logo-rostar.png 20 8 1920x1080 -30 20 \
 *     logo-rostar-parallax.png
 */

import sharp from "sharp";
import { existsSync } from "fs";

/**
 * STEP 1: Create one “rounded + rotated” tile.
 */
async function createRoundedRotatedTile(inputPath, tileW, tileH, rotateDeg, radiusRatio = 0.1) {
  const radius = Math.floor(Math.min(tileW, tileH) * radiusRatio);

  const maskSvg = Buffer.from(`
    <svg width="${tileW}" height="${tileH}">
      <rect x="0" y="0" width="${tileW}" height="${tileH}"
            rx="${radius}" ry="${radius}" fill="#fff"/>
    </svg>
  `);

  // Resize → mask for rounded corners → rotate with transparent background
  const tileBuffer = await sharp(inputPath)
    .resize(tileW, tileH, { fit: "cover" })
    .composite([{ input: maskSvg, blend: "dest-in" }])
    .rotate(rotateDeg, { background: { r: 0, g: 0, b: 0, alpha: 0 } })
    .png()
    .toBuffer();

  const { width: rtW, height: rtH } = await sharp(tileBuffer).metadata();
  return { buffer: tileBuffer, width: rtW, height: rtH };
}

/**
 * STEP 2: Build the stepped grid on an “intermediate” canvas, then crop to [wRes×hRes].
 */
async function generateSteppedPattern(
  inputPath,
  nRows,
  nCols,
  resolutionStr,
  rotateDeg,
  spacingPx,
  outputPath
) {
  // Parse resolution (e.g. "1920x1080")
  const [wRes, hRes] = resolutionStr
    .toLowerCase()
    .split("x")
    .map((v) => parseInt(v, 10));

  if (!wRes || !hRes) {
    throw new Error('Invalid resolution. Use "WIDTHxHEIGHT", e.g. "1920x1080".');
  }

  // Compute tileW/tileH accounting for spacing
  const totalHGap = (nCols + 1) * spacingPx;
  const totalVGap = (nRows + 1) * spacingPx;
  const tileW = Math.floor((wRes - totalHGap) / nCols);
  const tileH = Math.floor((hRes - totalVGap) / nRows);
  if (tileW <= 0 || tileH <= 0) {
    throw new Error("Resolution too small for given rows, cols, and spacing.");
  }

  // Create one rounded+rotated tile
  let { buffer: tileBuffer, width: rtW, height: rtH } =
    await createRoundedRotatedTile(inputPath, tileW, tileH, rotateDeg);

  // If rotated tile > final canvas, scale it down
  if (rtW > wRes || rtH > hRes) {
    const scale = Math.min(wRes / rtW, hRes / rtH, 1);
    const newW = Math.floor(rtW * scale);
    const newH = Math.floor(rtH * scale);
    tileBuffer = await sharp(tileBuffer)
      .resize(newW, newH, { fit: "contain" })
      .png()
      .toBuffer();
    const meta = await sharp(tileBuffer).metadata();
    rtW = meta.width;
    rtH = meta.height;
  }

  // Compute each tile’s “pasteX, pasteY” in the logical [0..wRes, 0..hRes] coordinate space
  const pastePositions = [];
  for (let row = 0; row < nRows; row++) {
    for (let col = 0; col < nCols; col++) {
      // Cell’s top-left
      let cellX = spacingPx + col * (tileW + spacingPx);
      let cellY = spacingPx + row * (tileH + spacingPx);
      // Step odd rows
      if (row % 2 === 1) {
        cellX += Math.floor((tileW + spacingPx) / 2);
      }
      const centerX = cellX + tileW / 2;
      const centerY = cellY + tileH / 2;
      // Rotated tile’s top-left so that its center aligns at (centerX, centerY)
      const pasteX = centerX - rtW / 2;
      const pasteY = centerY - rtH / 2;
      pastePositions.push({ pasteX, pasteY });
    }
  }

  // Determine bounding box of all rotated‐tile placements
  let minX = Infinity, minY = Infinity;
  let maxX = -Infinity, maxY = -Infinity;
  for (const { pasteX, pasteY } of pastePositions) {
    minX = Math.min(minX, pasteX);
    minY = Math.min(minY, pasteY);
    maxX = Math.max(maxX, pasteX + rtW);
    maxY = Math.max(maxY, pasteY + rtH);
  }

  // Compute intermediate canvas dimensions
  const extW = Math.ceil(maxX - minX);
  const extH = Math.ceil(maxY - minY);

  // Create transparent intermediate canvas extW×extH
  const intermediate = sharp({
    create: {
      width: extW,
      height: extH,
      channels: 4,
      background: { r: 0, g: 0, b: 0, alpha: 0 },
    },
  });

  // Compose: shift each tile by (−minX, −minY) so it fits inside extW×extH
  const composites = pastePositions.map(({ pasteX, pasteY }) => ({
    input: tileBuffer,
    left: Math.round(pasteX - minX),
    top: Math.round(pasteY - minY),
  }));

  // Draw all tiles onto intermediate
  const withTilesBuffer = await intermediate.composite(composites).png().toBuffer();

  // Now “logical” origin (0,0) in the final image corresponds to (−minX, −minY) in intermediate
  let cropLeft = Math.round(-minX);
  let cropTop = Math.round(-minY);

  // **CLAMP** both cropLeft and cropTop to at least 0 (this fixes when minX>0 or minY>0)
  cropLeft = Math.max(0, cropLeft);
  cropTop = Math.max(0, cropTop);

  // Ensure the final crop rectangle [cropLeft..cropLeft+wRes, cropTop..cropTop+hRes] fits inside extW×extH
  if (
    cropLeft + wRes > extW ||
    cropTop  + hRes > extH
  ) {
    throw new Error(
      `Calculated crop falls outside intermediate canvas. ` +
      `extW=${extW}, extH=${extH}, cropLeft=${cropLeft}, cropTop=${cropTop}`
    );
  }

  // Extract exactly wRes×hRes from intermediate
  await sharp(withTilesBuffer)
    .extract({ left: cropLeft, top: cropTop, width: wRes, height: hRes })
    .png()
    .toFile(outputPath);

  console.log(`Saved stepped pattern to: ${outputPath}`);
}

// ─ Entry Point ───────────────────────────────────────────────────────────────
if (process.argv[1].endsWith("parallax.js")) {
  const args = process.argv.slice(2);
  if (args.length !== 7) {
    console.error("Usage:");
    console.error("  ./parallax.js <input_path> <n_rows> <n_cols> <resolution> <rotate_deg> <spacing_px> <output_path>");
    console.error("Example:");
    console.error("  ./parallax.js static-sitegen/assets/logo-rostar.png 20 8 1920x1080 -30 20 logo-rostar-parallax.png");
    process.exit(1);
  }

  const [
    inputPath,
    nRowsStr,
    nColsStr,
    resolution,
    rotateDegStr,
    spacingPxStr,
    outputPath
  ] = args;

  const nRows    = parseInt(nRowsStr, 10);
  const nCols    = parseInt(nColsStr, 10);
  const rotateDeg = parseFloat(rotateDegStr);
  const spacingPx = parseInt(spacingPxStr, 10);

  if (
    isNaN(nRows) || nRows <= 0 ||
    isNaN(nCols) || nCols <= 0 ||
    isNaN(rotateDeg) ||
    isNaN(spacingPx) || spacingPx < 0
  ) {
    console.error("Error: rows, cols, rotate, and spacing must be valid numbers.");
    process.exit(1);
  }

  if (!existsSync(inputPath)) {
    console.error(`Error: Input file not found: ${inputPath}`);
    process.exit(1);
  }

  generateSteppedPattern(inputPath, nRows, nCols, resolution, rotateDeg, spacingPx, outputPath)
    .catch(err => {
      console.error("Error generating stepped pattern:", err.message);
      process.exit(1);
    });
}

