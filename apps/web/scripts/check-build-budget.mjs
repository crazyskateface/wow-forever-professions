import { gzipSync } from "node:zlib";
import { readFile, readdir, stat } from "node:fs/promises";
import path from "node:path";

const dist = path.resolve("dist");
const assets = path.join(dist, "assets");
const itemIcons = path.join(dist, "icons", "items");

const limits = {
  bootstrapBytes: 3_250_000,
  cssBytes: 115_000,
  cssGzipBytes: 28_000,
  itemIconBytes: 10_000,
  itemIconManifestBytes: 80_000,
  javascriptBytes: 525_000,
  javascriptGzipBytes: 155_000,
};

async function filesBelow(directory) {
  const entries = await readdir(directory, { withFileTypes: true });
  const files = [];
  for (const entry of entries) {
    const target = path.join(directory, entry.name);
    if (entry.isDirectory()) files.push(...await filesBelow(target));
    else files.push(target);
  }
  return files;
}

function assertWithin(label, actual, maximum) {
  if (actual > maximum) {
    throw new Error(`${label} is ${actual.toLocaleString()} bytes; budget is ${maximum.toLocaleString()} bytes.`);
  }
  console.log(`${label}: ${actual.toLocaleString()} / ${maximum.toLocaleString()} bytes`);
}

const assetFiles = await filesBelow(assets);
const javascript = assetFiles.filter((file) => file.endsWith(".js"));
const stylesheets = assetFiles.filter((file) => file.endsWith(".css"));
const bootstrapFiles = assetFiles.filter((file) => /\.(css|js|png|jpe?g|webp|avif|svg)$/i.test(file));

const javascriptBuffers = await Promise.all(javascript.map((file) => readFile(file)));
const stylesheetBuffers = await Promise.all(stylesheets.map((file) => readFile(file)));
const javascriptBytes = javascriptBuffers.reduce((total, buffer) => total + buffer.byteLength, 0);
const stylesheetBytes = stylesheetBuffers.reduce((total, buffer) => total + buffer.byteLength, 0);
const javascriptGzipBytes = javascriptBuffers.reduce((total, buffer) => total + gzipSync(buffer).byteLength, 0);
const stylesheetGzipBytes = stylesheetBuffers.reduce((total, buffer) => total + gzipSync(buffer).byteLength, 0);
const bootstrapBytes = (await Promise.all(bootstrapFiles.map((file) => stat(file))))
  .reduce((total, file) => total + file.size, 0);

assertWithin("Bootstrap assets", bootstrapBytes, limits.bootstrapBytes);
assertWithin("JavaScript", javascriptBytes, limits.javascriptBytes);
assertWithin("JavaScript gzip", javascriptGzipBytes, limits.javascriptGzipBytes);
assertWithin("CSS", stylesheetBytes, limits.cssBytes);
assertWithin("CSS gzip", stylesheetGzipBytes, limits.cssGzipBytes);

const iconFiles = await filesBelow(itemIcons);
const manifest = iconFiles.find((file) => path.basename(file) === "manifest.json");
if (manifest === undefined) throw new Error("Item icon manifest is missing from the production build.");
assertWithin("Item icon manifest", (await stat(manifest)).size, limits.itemIconManifestBytes);
const webpIcons = iconFiles.filter((file) => file.endsWith(".webp"));
if (webpIcons.length === 0) throw new Error("No item icons were copied into the production build.");
const largestIcon = (await Promise.all(webpIcons.map(async (file) => ({
  file,
  size: (await stat(file)).size,
})))).sort((left, right) => right.size - left.size)[0];
assertWithin(
  `Largest item icon (${path.basename(largestIcon.file)})`,
  largestIcon.size,
  limits.itemIconBytes,
);
