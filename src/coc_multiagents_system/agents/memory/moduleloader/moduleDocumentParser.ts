/**
 * Module Document Parser
 * Extracts module background and briefing information from DOCX and PDF files
 */

import fs from "fs";
import path from "path";
import { ChatOpenAI } from "@langchain/openai";
import { ChatGoogleGenerativeAI } from "@langchain/google-genai";
import mammoth from "mammoth";
import pdfParse from "pdf-parse";
import {
  createChatModel,
  ModelClass,
  ModelProviderName,
} from "../../../../models/index.js";
import type { ParsedModuleData } from "../../models/moduleTypes.js";

export type SupportedModuleFormat = "docx" | "pdf";

/**
 * Parser that extracts module briefings from documents using an LLM
 */
export class ModuleDocumentParser {
  private llm: ChatOpenAI | ChatGoogleGenerativeAI;

  constructor(model?: ChatOpenAI | ChatGoogleGenerativeAI) {
    if (!model) {
      const geminiApiKey = process.env.GOOGLE_API_KEY;
      const openaiApiKey = process.env.OPENAI_API_KEY;

      if (geminiApiKey) {
        this.llm = createChatModel(ModelProviderName.GOOGLE, ModelClass.LARGE);
      } else if (openaiApiKey) {
        this.llm = createChatModel(ModelProviderName.OPENAI, ModelClass.LARGE);
      } else {
        throw new Error(
          "No API key found. Please set either GOOGLE_API_KEY or OPENAI_API_KEY environment variable."
        );
      }
    } else {
      this.llm = model;
    }
  }

  /**
   * Parse a module document and extract structured module data
   */
  async parseDocument(filePath: string): Promise<ParsedModuleData> {
    const ext = path
      .extname(filePath)
      .toLowerCase()
      .slice(1) as SupportedModuleFormat;

    if (!["docx", "pdf"].includes(ext)) {
      throw new Error(
        `Unsupported file format: ${ext}. Only .docx and .pdf are supported.`
      );
    }

    const text = await this.extractText(filePath, ext);
    return this.extractModuleData(text, path.basename(filePath));
  }

  /**
   * Parse every valid document in a directory
   */
  async parseDirectory(dirPath: string): Promise<ParsedModuleData[]> {
    if (!fs.existsSync(dirPath)) {
      throw new Error(`Directory does not exist: ${dirPath}`);
    }

    const files = fs.readdirSync(dirPath);
    const moduleFiles = files.filter((f) => {
      const ext = path.extname(f).toLowerCase();
      return ext === ".docx" || ext === ".pdf";
    });

    const results: ParsedModuleData[] = [];

    for (const file of moduleFiles) {
      try {
        const filePath = path.join(dirPath, file);
        console.log(`Parsing module document: ${file}...`);
        const moduleData = await this.parseDocument(filePath);
        results.push(moduleData);
        console.log(`✓ Parsed module: ${moduleData.title}`);
      } catch (error) {
        console.error(`✗ Failed to parse ${file}:`, error);
      }
    }

    return results;
  }

  /**
   * Extract text from supported document types
   */
  private async extractText(
    filePath: string,
    format: SupportedModuleFormat
  ): Promise<string> {
    const buffer = fs.readFileSync(filePath);

    if (format === "docx") {
      const result = await mammoth.extractRawText({ buffer });
      return result.value;
    }

    const data = await pdfParse(buffer);
    return data.text;
  }

  /**
   * Handle chunking large documents and merging results
   */
  private async extractModuleData(
    text: string,
    fileName: string
  ): Promise<ParsedModuleData> {
    return this.extractModuleDataFromText(text, fileName);
  }

  /**
   * Core LLM extraction for a text slice
   */
  private async extractModuleDataFromText(
    text: string,
    fileName: string
  ): Promise<ParsedModuleData> {
    const prompt = `You are a Module Content Extractor for Call of Cthulhu 7e. Produce a complete, concrete, and directly usable module digest for the Keeper. Summarize where helpful for readability, but keep critical details intact. Keep everything as plain text (no Markdown). Do not add content that is not present.

Return a JSON object with exactly these fields:
{
  "title": "Most specific module title or location name",
  "background": "Brief but complete setting context and pre-play history (who, what happened, why it matters, key factions/forces)",
  "storyOutline": "Ordered scene/beat list with concise specifics: time markers, locations, key NPCs, triggers, consequences, and transitions",
  "moduleNotes": "Concise must-know constraints: safety/content warnings, prerequisites, props/handouts, pacing/clock notes (summarize but keep all key points)",
  "keeperGuidance": "Running advice: reveals, pacing levers, fail-forward options, tone cues, when to call for rolls",
  "storyHook": "Player-facing entry: who contacts them, what they see/hear, immediate actionable choices, why they care",
  "moduleLimitations": "Concise hard constraints: scope limits, time caps, locked areas, forbidden actions, bounded outcomes (summarize but keep all key points)",
  "tags": ["keyword1", "keyword2"]
}

Rules:
- You MUST return ONLY these fields—no extra keys, no nested objects beyond what is shown, no code fences.
- Values must be plain strings or string arrays exactly as specified. If absent, use an empty string or empty array.
- Preserve chronology in storyOutline; include triggers, gating clues, and consequences (summarize lightly if needed, but keep key facts).
- Background/storyHook/keeperGuidance can be lightly summarized for clarity, but must stay faithful to the source.
- ModuleNotes and moduleLimitations should be concise but include every key constraint; summarize without omitting important limits.
- Do NOT fabricate missing information; leave the field empty if absent.
- StoryHook, background, and keeperGuidance must be actionable, not generic platitudes.

Document content:
---
${text}
---

File name: ${fileName}

Return ONLY the JSON object, nothing else.`;

    let lastError: unknown;

    for (let attempt = 1; attempt <= 3; attempt++) {
      try {
        const response = await this.llm.invoke(prompt);
        const content = response.content as string;

        const jsonText =
          content.match(/```(?:json)?\s*([\s\S]*?)```/i)?.[1] ||
          content.match(/\{[\s\S]*\}/)?.[0];

        if (!jsonText) {
          throw new Error(
            `Failed to extract JSON from LLM response: ${content}`
          );
        }

        const moduleData: ParsedModuleData = JSON.parse(jsonText);

        if (!moduleData.title) {
          throw new Error(
            `Module title is required but missing for document: ${fileName}`
          );
        }

        return moduleData;
      } catch (err) {
        lastError = err;
        const detail =
          err instanceof Error
            ? err.message
            : typeof err === "string"
              ? err
              : "Unknown error";
        console.warn(`Retry ${attempt}/3 for ${fileName} due to error: ${detail}`);
        if (attempt === 3) {
          throw err;
        }
      }
    }

    throw lastError instanceof Error ? lastError : new Error(String(lastError));
  }

  private pickLonger(a?: string, b?: string): string | undefined {
    if (a && b) {
      return b.length > a.length ? b : a;
    }
    return a || b;
  }

  private mergeStringArrays(
    a?: string[],
    b?: string[]
  ): string[] | undefined {
    const merged = new Set<string>();
    (a || []).forEach((v) => merged.add(v));
    (b || []).forEach((v) => merged.add(v));
    return merged.size ? Array.from(merged) : undefined;
  }
}
