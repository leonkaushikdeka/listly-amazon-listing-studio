#!/usr/bin/env node
"use strict";

const fs = require("node:fs");
const path = require("node:path");
const { spawnSync } = require("node:child_process");
const { PNG } = require("pngjs");
const { GIFEncoder, quantize, applyPalette } = require("gifenc");

const projectRoot = path.resolve(__dirname, "..");
const tutorialRoot = path.join(projectRoot, "docs", "tutorial");
const source = path.join(tutorialRoot, "listly-amazon-workbook-walkthrough.webm");
const destination = path.join(tutorialRoot, "listly-amazon-workbook-walkthrough.gif");

function findFfmpeg(directory) {
  if (!fs.existsSync(directory)) return null;
  const entries = fs.readdirSync(directory, { withFileTypes: true });
  for (const entry of entries) {
    const candidate = path.join(directory, entry.name);
    if (entry.isFile() && /^ffmpeg(?:-win64)?(\.exe)?$/i.test(entry.name)) return candidate;
    if (entry.isDirectory()) {
      const nested = findFfmpeg(candidate);
      if (nested) return nested;
    }
  }
  return null;
}

if (!fs.existsSync(source)) {
  throw new Error("Tutorial video is missing. Run npm run tutorial:record first.");
}

const playwrightTools = path.join(
  process.env.LOCALAPPDATA || "",
  "ms-playwright"
);
const ffmpeg = findFfmpeg(playwrightTools);
if (!ffmpeg) {
  throw new Error("Could not find Playwright's bundled ffmpeg executable.");
}

const framesRoot = path.join(tutorialRoot, ".tutorial-gif-frames");
fs.rmSync(framesRoot, { recursive: true, force: true });
fs.mkdirSync(framesRoot, { recursive: true });

try {
  const extraction = spawnSync(ffmpeg, [
    "-y",
    "-i",
    source,
    "-an",
    "-vf",
    "scale=960:-1:flags=lanczos",
    "-r",
    "6",
    path.join(framesRoot, "frame-%03d.png")
  ], { stdio: "inherit" });

  if (extraction.status !== 0) {
    throw new Error("Could not extract tutorial video frames.");
  }

  const frameNames = fs.readdirSync(framesRoot)
    .filter(function (name) { return /\.png$/i.test(name); })
    .sort();

  if (!frameNames.length) {
    throw new Error("No PNG frames were extracted from the tutorial video.");
  }

  const gif = GIFEncoder();

  frameNames.forEach(function (name, frameNumber) {
    const frame = PNG.sync.read(fs.readFileSync(path.join(framesRoot, name)));
    const palette = quantize(frame.data, 256, { format: "rgb565" });
    const indexed = applyPalette(frame.data, palette, "rgb565");
    gif.writeFrame(indexed, frame.width, frame.height, {
      palette: palette,
      delay: 170,
      repeat: frameNumber === 0 ? 0 : undefined
    });
  });

  gif.finish();
  fs.writeFileSync(destination, Buffer.from(gif.bytes()));
  process.stdout.write("Created tutorial preview: " + path.relative(projectRoot, destination) + "\n");
} finally {
  fs.rmSync(framesRoot, { recursive: true, force: true });
}
