/**
 * Merge Original Scripts
 *
 * Reads every text file in `original-script/`, splits inline speech
 * patterns, and writes a single `merged-original.txt`.
 *
 * Lines in each file are either:
 *   - Speech:    speaker「content」  → ＃{speaker} + 「{content}」
 *   - Speech:    speaker『content』  → ＃{speaker} + 『{content}』
 *   - Narration: text…              → kept as-is
 *
 * File sections are separated by `--------------------` and each section
 * starts with the filename followed by `********************`.
 *
 * Usage:
 *   node merge-original-scripts.mjs
 */

import { glob } from "glob";
import { mkdir, readFile, rm, writeFile } from "fs/promises";
import path from "path";

const INPUT_DIR = "original-script";
const OUTPUT_FILE = "merged-original.txt";

const SECTION_SEPARATOR = "--------------------";
const HEADER_SEPARATOR = "********************";

const MAX_CHUNK_LINES = 900;
const CHUNKS_DIR = "original-merged-chunks";

const KNOWN_SPEAKERS = new Set([
  "宏治",
  "かれん",
  "恵美子",
  "麗子",
  "高橋",
  "佐藤部長",
  "同僚",
  "沢田",
  "片岡",
  "鈴木さん",
  "ナース",
  "女の声",
  "男の声",
  "男性",
  "医師",
  "患者",
  "救急隊員",
  "牧師",
  "宏治＆恵美子",
  "ケイティ",
  "ミック",
  "ランディ",
  "ユーちゃん",
  "アナウンス",
  "館内放送",
  "三人",
  "童顔のナース",
  "背の高いナース",
  "ツリ目のナース",
  "ぽっちゃりしたナース",
  "三つ編みのナース",
  "おばさんナース",
  "ショートヘアの女のコ",
  "メガネの女のコ",
  "部下の女のコ",
  "会社のおばさん",
  "陰気なおばさん",
  "パンチパーマの男",
  "ロングヘアの男",
  "読者代表の２人",
]);

const SPEECH_PATTERN = /^(.+?)([「『][\s\S]*[」』])$/;

/**
 * Try to parse an inline speech line into { speaker, content }.
 * Returns null if the line is narration.
 */
function parseSpeech(line) {
  const match = line.match(SPEECH_PATTERN);
  if (!match) return null;

  const speaker = match[1];
  const content = match[2];

  if (!KNOWN_SPEAKERS.has(speaker)) return null;

  return { speaker, content };
}

async function main() {
  const SKIP_PREFIX = "SCENE_";

  const files = (await glob(`${INPUT_DIR}/*.txt`)).sort();

  if (files.length === 0) {
    console.error(`No .txt files found in ${INPUT_DIR}/`);
    process.exit(1);
  }

  const sections = [];
  let skipped = 0;

  for (const filePath of files) {
    const baseName = path.basename(filePath, ".txt");
    if (baseName.startsWith(SKIP_PREFIX)) {
      skipped++;
      continue;
    }

    const raw = await readFile(filePath, "utf-8");
    let srcLines = raw.split("\n");
    if (srcLines.at(-1) === "") srcLines.pop();

    const lines = [];
    for (const srcLine of srcLines) {
      const speech = parseSpeech(srcLine);
      if (speech) {
        lines.push(`＃${speech.speaker}`);
        lines.push(speech.content);
      } else {
        lines.push(srcLine);
      }
    }

    const sectionName = path.relative(INPUT_DIR, filePath).replace(/\.txt$/, "");
    sections.push(`${sectionName}\n${HEADER_SEPARATOR}\n${lines.join("\n")}`);
  }

  const output = sections.map((s) => `${SECTION_SEPARATOR}\n${s}`).join("\n");
  await writeFile(OUTPUT_FILE, output + "\n", "utf-8");

  console.log(`${sections.length} files merged into ${OUTPUT_FILE} (${skipped} scene files skipped)`);

  await rm(CHUNKS_DIR, { recursive: true, force: true });
  await mkdir(CHUNKS_DIR, { recursive: true });

  const chunks = [];
  let currentChunk = [];
  let currentLineCount = 0;

  for (const section of sections) {
    const sectionText = `${SECTION_SEPARATOR}\n${section}`;
    const sectionLineCount = sectionText.split("\n").length;

    if (currentLineCount + sectionLineCount > MAX_CHUNK_LINES && currentChunk.length > 0) {
      chunks.push(currentChunk);
      currentChunk = [];
      currentLineCount = 0;
    }

    currentChunk.push(sectionText);
    currentLineCount += sectionLineCount;
  }

  if (currentChunk.length > 0) {
    chunks.push(currentChunk);
  }

  for (let i = 0; i < chunks.length; i++) {
    const chunkNum = String(i + 1).padStart(3, "0");
    const chunkPath = path.join(CHUNKS_DIR, `part-${chunkNum}.txt`);
    await writeFile(chunkPath, chunks[i].join("\n") + "\n", "utf-8");
  }

  console.log(`${chunks.length} chunks written to ${CHUNKS_DIR}/`);
}

main().catch(console.error);
