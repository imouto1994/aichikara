/**
 * Validate Translations (chunk-based)
 *
 * Compares translated chunks in `translated-merged-chunks/` against original
 * chunks in `original-merged-chunks/` to ensure structural consistency.
 *
 * Checks performed per section:
 *   1. Every original section has a matching translated section (by filename).
 *   2. Non-empty line counts match.
 *   3. Line types match (source / speech / normal).
 *   4. Speech source names match via SPEAKER_MAP (JP → EN).
 *
 * Errors are collected and printed in reverse order so the first mismatch
 * appears at the bottom of the terminal (most visible).
 *
 * Usage:
 *   node validate-translations.mjs
 */

import { readFile } from "fs/promises";
import { glob } from "glob";

const ORIGINAL_CHUNKS_DIR = "original-merged-chunks";
const TRANSLATED_CHUNKS_DIR = "translated-merged-chunks";

const SECTION_SEPARATOR = "--------------------";
const HEADER_SEPARATOR = "********************";

/**
 * Classify a line into a structural type:
 *   "source"       — speaker name (＃ in original, $ in translated)
 *   "speech-quote" — quoted speech (「」/『』 or ""/"")
 *   "normal"       — narration / everything else
 */
function lineType(line, isTranslated) {
  if (isTranslated ? line.startsWith("$") : line.startsWith("＃"))
    return "source";

  if (isTranslated) {
    if (line.startsWith("\u201C") && line.endsWith("\u201D"))
      return "speech-quote";
    if (line.startsWith('"') && line.endsWith('"')) return "speech-quote";
  } else {
    if (line.startsWith("「") && line.endsWith("」")) return "speech-quote";
    if (line.startsWith("『") && line.endsWith("』")) return "speech-quote";
  }

  return "normal";
}

const SPEAKER_MAP = new Map([
  ["宏治", "Kouji"],
  ["かれん", "Karen"],
  ["恵美子", "Emiko"],
  ["麗子", "Reiko"],
  ["高橋", "Takahashi"],
  ["佐藤部長", "Director Sato"],
  ["同僚", "Colleague"],
  ["沢田", "Sawada"],
  ["片岡", "Kataoka"],
  ["鈴木さん", "Suzuki-san"],
  ["ナース", "Nurse"],
  ["女の声", "Female Voice"],
  ["男の声", "Male Voice"],
  ["男性", "Man"],
  ["医師", "Doctor"],
  ["患者", "Patient"],
  ["救急隊員", "Paramedic"],
  ["牧師", "Pastor"],
  ["宏治＆恵美子", "Kouji & Emiko"],
  ["ケイティ", "Katie"],
  ["ミック", "Mick"],
  ["ランディ", "Randy"],
  ["ユーちゃん", "Yu-chan"],
  ["アナウンス", "Announcement"],
  ["館内放送", "Public Announcement"],
  ["三人", "Three People"],
  ["童顔のナース", "Baby-Faced Nurse"],
  ["背の高いナース", "Tall Nurse"],
  ["ツリ目のナース", "Slant-Eyed Nurse"],
  ["ぽっちゃりしたナース", "Chubby Nurse"],
  ["三つ編みのナース", "Nurse with Braids"],
  ["おばさんナース", "Old Nurse"],
  ["ショートヘアの女のコ", "Short-Haired Girl"],
  ["メガネの女のコ", "Girl in Glasses"],
  ["部下の女のコ", "Female Subordinate"],
  ["会社のおばさん", "Office Lady"],
  ["陰気なおばさん", "Gloomy Lady"],
  ["パンチパーマの男", "Punch Perm Man"],
  ["ロングヘアの男", "Long-Haired Man"],
  ["読者代表の２人", "The two reader representatives"],
]);

/**
 * Parse all chunk files in a directory into a Map of
 * { fileName → { lines, lineNos, chunkPath, startLine } }.
 */
async function parseSectionsFromChunks(dir) {
  const chunkFiles = (await glob(`${dir}/part-*.txt`)).sort();
  const sections = new Map();

  for (const chunkPath of chunkFiles) {
    const text = await readFile(chunkPath, "utf-8");
    const allLines = text.split("\n");

    let i = 0;
    while (i < allLines.length) {
      if (allLines[i] !== SECTION_SEPARATOR) {
        i++;
        continue;
      }

      const sectionStartLine = i + 1;
      i++;
      if (i >= allLines.length) break;

      const fileName = allLines[i].trim();
      i++;
      if (i >= allLines.length || allLines[i] !== HEADER_SEPARATOR) continue;
      i++;

      const contentLines = [];
      const contentLineNos = [];
      while (i < allLines.length && allLines[i] !== SECTION_SEPARATOR) {
        if (allLines[i].length > 0) {
          contentLines.push(allLines[i]);
          contentLineNos.push(i + 1);
        }
        i++;
      }

      sections.set(fileName, {
        lines: contentLines,
        lineNos: contentLineNos,
        chunkPath,
        startLine: sectionStartLine,
      });
    }
  }

  return sections;
}

async function main() {
  const origSections = await parseSectionsFromChunks(ORIGINAL_CHUNKS_DIR);
  const transSections = await parseSectionsFromChunks(TRANSLATED_CHUNKS_DIR);

  let checked = 0;
  let mismatched = 0;
  const errors = [];

  for (const [fileName, origEntry] of origSections) {
    const {
      lines: origLines,
      lineNos: origLineNos,
      chunkPath: origChunk,
      startLine: origStart,
    } = origEntry;

    if (!transSections.has(fileName)) {
      mismatched++;
      errors.push({
        header: `✗  ${origChunk}:${origStart} > ${fileName}`,
        details: ["   Missing from translated chunks"],
      });
      continue;
    }

    checked++;
    const transEntry = transSections.get(fileName);
    const {
      lines: transLines,
      lineNos: transLineNos,
      chunkPath: transChunk,
      startLine: transStart,
    } = transEntry;
    const sectionErrors = [];
    let firstErrorLineIdx = -1;

    if (origLines.length !== transLines.length) {
      sectionErrors.push(
        `Line count mismatch: original has ${origLines.length} lines, translated has ${transLines.length} lines`,
      );

      const minLen = Math.min(origLines.length, transLines.length);
      for (let i = 0; i < minLen; i++) {
        const origType = lineType(origLines[i], false);
        const transType = lineType(transLines[i], true);
        if (origType !== transType) {
          if (firstErrorLineIdx === -1) firstErrorLineIdx = i;
          sectionErrors.push(
            `First type mismatch at line ${i + 1} (${origType} vs. ${transType}):\n     original:   ${origLines[i]}\n     translated: ${transLines[i]}`,
          );
          break;
        }
      }
    } else {
      for (let i = 0; i < origLines.length; i++) {
        const origLine = origLines[i];
        const transLine = transLines[i];
        const origType = lineType(origLine, false);
        const transType = lineType(transLine, true);

        if (origType !== transType) {
          if (firstErrorLineIdx === -1) firstErrorLineIdx = i;
          sectionErrors.push(
            `Line ${i + 1}: type mismatch (${origType} vs. ${transType})\n     original:   ${origLine}\n     translated: ${transLine}`,
          );
          break;
        } else if (origType === "source") {
          const origName = origLine.slice(1);
          const transName = transLine.slice(1);
          const expectedEN = SPEAKER_MAP.get(origName);

          if (!expectedEN) {
            if (firstErrorLineIdx === -1) firstErrorLineIdx = i;
            sectionErrors.push(
              `Line ${i + 1}: unknown speaker "${origName}" — add to SPEAKER_MAP`,
            );
          } else if (transName !== expectedEN) {
            if (firstErrorLineIdx === -1) firstErrorLineIdx = i;
            sectionErrors.push(
              `Line ${i + 1}: speaker name mismatch\n     expected: $${expectedEN}\n     got:      ${transLine}`,
            );
          }
        }
      }
    }

    if (sectionErrors.length > 0) {
      mismatched++;
      const origErrLine =
        firstErrorLineIdx >= 0 && origLineNos[firstErrorLineIdx]
          ? origLineNos[firstErrorLineIdx]
          : origStart;
      const transErrLine =
        firstErrorLineIdx >= 0 && transLineNos[firstErrorLineIdx]
          ? transLineNos[firstErrorLineIdx]
          : transStart;
      errors.push({
        header: `✗  ${origChunk}:${origErrLine} | ${transChunk}:${transErrLine} > ${fileName}`,
        details: sectionErrors.map((e) => `   ${e}`),
      });
    }
  }

  const extraInTranslated = [...transSections.keys()].filter(
    (f) => !origSections.has(f),
  );
  if (extraInTranslated.length > 0) {
    const details = extraInTranslated.map((f) => {
      const entry = transSections.get(f);
      return `   ${entry.chunkPath}:${entry.startLine} > ${f}`;
    });
    errors.push({
      header: "⚠  Extra sections in translated chunks not in original:",
      details,
    });
  }

  if (errors.length > 0) {
    console.log("\n--- Errors (first mismatch at bottom) ---");
    for (let i = errors.length - 1; i >= 0; i--) {
      console.log(`\n${errors[i].header}`);
      for (const d of errors[i].details) {
        console.log(d);
      }
    }
  }

  console.log("\n— Summary —");
  console.log(`  Sections checked: ${checked}`);
  console.log(`  Mismatched:       ${mismatched}`);

  if (mismatched > 0) {
    process.exit(1);
  }
}

main().catch(console.error);
