/**
 * Export Translation Map
 *
 * Reads `original-merged-chunks/` and `translated-merged-chunks/`, parses
 * them into matching sections, and builds a JSON mapping of every unique
 * original line to its translated counterpart.
 *
 * Speech source lines (＃ in original, $ in translated) and their following
 * content lines are merged into a single entry:
 *
 *   Original:  ＃宏治                →  key:   "〈宏治〉：はーあぁ……"
 *              「はーあぁ……」         value: "Koji: "Haaah...""
 *
 * Narration lines are mapped directly:
 *
 *   key:   "海沿いの公園のベンチに座り…"
 *   value: "Sitting on a bench at the seaside park…"
 *
 * Empty lines are skipped. First occurrence wins for duplicates.
 *
 * Output: `translation-map.json`
 *
 * Usage:
 *   node export-translation-map.mjs
 */

import { readFile, writeFile } from "fs/promises";
import { glob } from "glob";

const ORIGINAL_CHUNKS_DIR = "original-merged-chunks";
const TRANSLATED_CHUNKS_DIR = "translated-merged-chunks";
const OUTPUT_FILE = "translation-map.json";

async function readChunks(dir) {
  const files = (await glob(`${dir}/part-*.txt`)).sort();
  const parts = await Promise.all(files.map((f) => readFile(f, "utf-8")));
  return parts.join("\n");
}

const SECTION_SEPARATOR = "--------------------";
const HEADER_SEPARATOR = "********************";

const SPEAKER_MAP = new Map([
  ["宏治", "Koji"],
  ["かれん", "Karen"],
  ["恵美子", "Emiko"],
  ["麗子", "Reiko"],
  ["高橋", "Takahashi"],
  ["佐藤部長", "Director Sato"],
  ["同僚", "Colleague"],
  ["沢田", "Sawada"],
  ["片岡", "Kataoka"],
  ["鈴木さん", "Suzuki"],
  ["ナース", "Nurse"],
  ["女の声", "Woman's Voice"],
  ["男の声", "Man's Voice"],
  ["男性", "Man"],
  ["医師", "Doctor"],
  ["患者", "Patient"],
  ["救急隊員", "Paramedic"],
  ["牧師", "Pastor"],
  ["宏治＆恵美子", "Koji & Emiko"],
  ["ケイティ", "Katy"],
  ["ミック", "Mick"],
  ["ランディ", "Randy"],
  ["ユーちゃん", "Yu-chan"],
  ["アナウンス", "Announcement"],
  ["館内放送", "PA System"],
  ["三人", "Three People"],
  ["童顔のナース", "Baby-Faced Nurse"],
  ["背の高いナース", "Tall Nurse"],
  ["ツリ目のナース", "Slant-Eyed Nurse"],
  ["ぽっちゃりしたナース", "Chubby Nurse"],
  ["三つ編みのナース", "Braided Nurse"],
  ["おばさんナース", "Old Nurse"],
  ["ショートヘアの女のコ", "Short-Haired Girl"],
  ["メガネの女のコ", "Glasses Girl"],
  ["部下の女のコ", "Subordinate Girl"],
  ["会社のおばさん", "Office Lady"],
  ["陰気なおばさん", "Gloomy Lady"],
  ["パンチパーマの男", "Punch Perm Man"],
  ["ロングヘアの男", "Long-Haired Man"],
  ["読者代表の２人", "Reader Representatives"],
]);

const JP_BRACKET_PAIRS = [
  ["「", "」"],
  ["『", "』"],
];

function parseSections(text) {
  const raw = text.split(`${SECTION_SEPARATOR}\n`);
  const sections = new Map();

  for (const block of raw) {
    const headerEnd = block.indexOf(`\n${HEADER_SEPARATOR}\n`);
    if (headerEnd === -1) continue;

    const fileName = block.slice(0, headerEnd).trim();
    const body = block.slice(headerEnd + HEADER_SEPARATOR.length + 2);

    sections.set(fileName, body.split("\n"));
  }

  return sections;
}

function stripBracketsJP(line) {
  for (const [open, close] of JP_BRACKET_PAIRS) {
    if (line.startsWith(open) && line.endsWith(close)) {
      return line.slice(1, -1);
    }
  }
  return line;
}

function stripBracketsEN(line) {
  if (line.startsWith("\u201C") && line.endsWith("\u201D")) {
    return line.slice(1, -1);
  }
  return line;
}

async function main() {
  const originalText = await readChunks(ORIGINAL_CHUNKS_DIR);
  const translatedText = await readChunks(TRANSLATED_CHUNKS_DIR);

  const origSections = parseSections(originalText);
  const transSections = parseSections(translatedText);

  const map = new Map();
  let totalPairs = 0;
  let duplicates = 0;
  const unknownSpeakers = new Set();

  for (const [fileName, origLines] of origSections) {
    if (!transSections.has(fileName)) continue;
    const transLines = transSections.get(fileName);

    let i = 0;
    while (i < origLines.length && i < transLines.length) {
      const origLine = origLines[i];
      const transLine = transLines[i];

      if (origLine.length === 0) {
        i++;
        continue;
      }

      if (origLine.startsWith("＃")) {
        const speakerJP = origLine.slice(1);
        const speakerEN = SPEAKER_MAP.get(speakerJP);

        if (!speakerEN) {
          unknownSpeakers.add(speakerJP);
        }

        if (i + 1 < origLines.length && i + 1 < transLines.length) {
          const contentOrig = origLines[i + 1];
          const contentTrans = transLines[i + 1];

          const key = `〈${speakerJP}〉：${stripBracketsJP(contentOrig)}`;
          const value = `${speakerEN || speakerJP}: \u201C${stripBracketsEN(contentTrans)}\u201D`;

          if (!map.has(key)) {
            map.set(key, value);
            totalPairs++;
          } else {
            duplicates++;
          }

          i += 2;
        } else {
          i++;
        }
        continue;
      }

      if (!map.has(origLine)) {
        map.set(origLine, transLine);
        totalPairs++;
      } else {
        duplicates++;
      }

      i++;
    }
  }

  const obj = Object.fromEntries(map);
  await writeFile(OUTPUT_FILE, JSON.stringify(obj, null, 2), "utf-8");

  console.log("— Summary —");
  console.log(`  Sections processed: ${origSections.size}`);
  console.log(`  Unique entries:     ${totalPairs}`);
  console.log(`  Duplicates skipped: ${duplicates}`);
  console.log(`  Exported to:        ${OUTPUT_FILE}`);

  if (unknownSpeakers.size > 0) {
    console.log(
      `\n  Unknown speakers: ${[...unknownSpeakers].join(", ")}`,
    );
  }
}

main().catch(console.error);
