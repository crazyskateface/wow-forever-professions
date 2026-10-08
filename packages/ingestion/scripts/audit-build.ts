import { readFile, writeFile } from "node:fs/promises";
import { resolve } from "node:path";
import {
  auditImportedBuildDataset,
  parseRawDatasetBytes,
  renderDataQualityMarkdown,
} from "../src/index.js";

const [inputPath, outputPath] = process.argv.slice(2);
if (!inputPath) throw new Error("Usage: audit-build <input JSON path> [output Markdown path]");
const invocationDirectory = process.env.INIT_CWD
  ? resolve(process.env.INIT_CWD)
  : process.cwd();
const resolvedInputPath = resolve(invocationDirectory, inputPath);
const dataset = parseRawDatasetBytes(await readFile(resolvedInputPath));
const report = auditImportedBuildDataset(dataset);
const markdown = renderDataQualityMarkdown(report);

if (outputPath) {
  const resolvedOutputPath = resolve(invocationDirectory, outputPath);
  await writeFile(resolvedOutputPath, markdown, "utf8");
  process.stdout.write(`${JSON.stringify({ outputPath: resolvedOutputPath, ...report }, null, 2)}\n`);
} else {
  process.stdout.write(markdown);
}
