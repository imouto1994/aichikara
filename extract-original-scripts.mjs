/**
 * Extract Original Scripts from Game Scripts
 *
 * Parses each file in `game-script/`, extracts text from `#1-TEXT` entries,
 * and writes one UTF-8 text file per game script into `original-script/`.
 *
 * Game script format (Shift-JIS encoded):
 *
 *   #1-TEXT
 *   [
 *       "Japanese text line here"
 *   ]
 *
 * Most commands between TEXT entries (`#1-A_FLAG_SET`, `#1-RETURN`,
 * `#1-JUMP_IF`) control animation, menu choices, and branching — each
 * `#1-TEXT` is treated as a standalone line. The sole exception is
 * `#1-NEW_LINE`, which inserts a display line break; the following
 * `#1-TEXT` is joined to the current one.
 *
 * Files with no `#1-TEXT` entries are skipped.
 *
 * Usage:
 *   node extract-original-scripts.mjs
 */

import { glob } from "glob";
import { mkdir, readFile, writeFile } from "fs/promises";
import path from "path";

const INPUT_DIR = "game-script";
const OUTPUT_DIR = "original-script";

async function main() {
  const files = (await glob(`${INPUT_DIR}/*.txt`)).sort();

  if (files.length === 0) {
    console.error(`No .txt files found in ${INPUT_DIR}/`);
    process.exit(1);
  }

  await mkdir(OUTPUT_DIR, { recursive: true });

  const sjisDecoder = new TextDecoder("shift_jis");
  let exported = 0;
  let skipped = 0;

  for (const filePath of files) {
    const fileName = path.basename(filePath);

    const raw = await readFile(filePath);
    const text = sjisDecoder.decode(raw);
    const lines = text.split("\n");

    const textEntries = [];
    for (let i = 0; i < lines.length; i++) {
      if (lines[i].trim() !== "#1-TEXT") continue;

      const strLine = lines[i + 2] ? lines[i + 2].trim() : "";
      const match = strLine.match(/^"(.*)"$/);
      if (!match) continue;

      let j = i + 3;
      while (j < lines.length && !lines[j].trim().startsWith("]")) j++;
      j++;
      while (j < lines.length && lines[j].trim() === "") j++;
      const nextCmd = j < lines.length ? lines[j].trim() : "";

      textEntries.push({
        content: match[1],
        isContinuation: nextCmd === "#1-NEW_LINE",
      });
    }

    const extracted = [];
    let pending = "";
    for (const entry of textEntries) {
      pending += entry.content;
      if (!entry.isContinuation) {
        extracted.push(pending);
        pending = "";
      }
    }
    if (pending) extracted.push(pending);

    if (extracted.length === 0) {
      skipped++;
      continue;
    }

    const outputPath = path.join(OUTPUT_DIR, fileName);
    await writeFile(outputPath, extracted.join("\n") + "\n", "utf-8");
    exported++;

    console.log(`${fileName} — ${extracted.length} lines`);
  }

  console.log(
    `\nDone. ${exported} files exported, ${skipped} skipped (no text).`,
  );
}

main().catch(console.error);
