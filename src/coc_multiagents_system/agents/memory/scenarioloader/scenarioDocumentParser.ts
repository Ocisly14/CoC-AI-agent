/**
 * Scenario Document Parser
 * Extracts scenario information from DOCX and PDF files using LLM
 */

import fs from "fs";
import path from "path";
import { ChatOpenAI } from "@langchain/openai";
import { ChatGoogleGenerativeAI } from "@langchain/google-genai";
import mammoth from "mammoth";
import pdfParse from "pdf-parse";
import { createChatModel, ModelProviderName, ModelClass } from "../../../../models/index.js";
import type { ParsedScenarioData } from "../../models/scenarioTypes.js";

/**
 * Supported document formats
 */
export type SupportedFormat = "docx" | "pdf";

/**
 * Document parser for scenario information extraction
 */
export class ScenarioDocumentParser {
  private llm: ChatOpenAI | ChatGoogleGenerativeAI;

  constructor(model?: ChatOpenAI | ChatGoogleGenerativeAI) {
    // Use provided model or create one using the unified model configuration system
    if (!model) {
      const geminiApiKey = process.env.GOOGLE_API_KEY;
      const openaiApiKey = process.env.OPENAI_API_KEY;
      
      if (geminiApiKey) {
        // Use small model for document parsing (cost-effective for this task)
        this.llm = createChatModel(ModelProviderName.GOOGLE, ModelClass.SMALL);
      } else if (openaiApiKey) {
        this.llm = createChatModel(ModelProviderName.OPENAI, ModelClass.SMALL);
      } else {
        throw new Error("No API key found. Please set either GOOGLE_API_KEY or OPENAI_API_KEY environment variable.");
      }
    } else {
      this.llm = model;
    }
  }

  /**
   * Parse a document and extract scenario data
   */
  async parseDocument(filePath: string): Promise<ParsedScenarioData> {
    const ext = path
      .extname(filePath)
      .toLowerCase()
      .slice(1) as SupportedFormat;

    if (!["docx", "pdf"].includes(ext)) {
      throw new Error(
        `Unsupported file format: ${ext}. Only .docx and .pdf are supported.`
      );
    }

    // Extract text from document
    const text = await this.extractText(filePath, ext);

    // Use LLM to parse structured data from text
    const scenarioData = await this.extractScenarioData(text, path.basename(filePath));

    return scenarioData;
  }

  /**
   * Extract text content from document
   */
  private async extractText(
    filePath: string,
    format: SupportedFormat
  ): Promise<string> {
    const buffer = fs.readFileSync(filePath);

    if (format === "docx") {
      const result = await mammoth.extractRawText({ buffer });
      return result.value;
    } else if (format === "pdf") {
      const data = await pdfParse(buffer);
      return data.text;
    }

    throw new Error(`Unsupported format: ${format}`);
  }

  /**
   * Use LLM to extract structured scenario data from raw text.
   */
  private async extractScenarioData(
    text: string,
    fileName: string
  ): Promise<ParsedScenarioData> {
    const CHUNK_SIZE = 5000;
    const OVERLAP = 1000;

    if (text.length > CHUNK_SIZE) {
      const chunks = this.splitTextWithOverlap(text, CHUNK_SIZE, OVERLAP);
      let merged: ParsedScenarioData | null = null;

      for (let i = 0; i < chunks.length; i++) {
        console.log(
          `Chunking ${fileName}: processing part ${i + 1}/${chunks.length} (${chunks[i].length} chars)`
        );
        const partName = `${fileName} (part ${i + 1}/${chunks.length})`;
        const partial = await this.extractScenarioDataFromText(
          chunks[i],
          partName
        );
        merged = merged ? this.mergeScenarioResults(merged, partial) : partial;
      }

      if (!merged) {
        throw new Error(`Failed to parse any scenario data for ${fileName}`);
      }

      return merged;
    }

    return this.extractScenarioDataFromText(text, fileName);
  }

  /**
   * Core extraction for a single text chunk
   */
  private async extractScenarioDataFromText(
    text: string,
    fileName: string
  ): Promise<ParsedScenarioData> {
    const prompt = `You are a scenario data extractor for a Call of Cthulhu 7th Edition TRPG game.

Extract scenario information from the following document and return it as a JSON object.

The JSON should follow this structure (no category field; the scenario name/description is the location anchor):
{
  "name": "AAA Hospital / BBB Factory / CCC Plaza ...",
  "description": "Overall scenario description (the environment as a whole)",
  "timeline": [
    {
      "timePoint": {
        "timestamp": "Time description (e.g., '1925-03-15', 'Dawn', 'Day 3')",
        "notes": "Additional time notes"
      },
      "name": "Scene name at this time (optional)",
      "location": "Primary location (same site; use description for sub-areas, not separate rooms)",
      "description": "Detailed scene description for this time",
      "characters": [
        {
          "name": "Character name",
          "role": "Role in scene (witness, victim, suspect, etc.)",
          "status": "Character status (alive, missing, unconscious, etc.)",
          "location": "Character's specific location",
          "notes": "Notes about character in this scene"
        }
      ],
      "clues": [
        {
          "clueText": "Description of the clue",
          "category": "physical" | "witness" | "document" | "environment" | "knowledge" | "observation",
          "difficulty": "automatic" | "regular" | "hard" | "extreme",
          "location": "Where clue can be found",
          "discoveryMethod": "Required skill or method (optional)",
          "reveals": ["What this clue points to"]
        }
      ],
      "conditions": [
        {
          "type": "weather" | "lighting" | "sound" | "smell" | "temperature" | "other",
          "description": "Environmental condition description",
          "mechanicalEffect": "Game mechanical effect if any"
        }
      ],
      "events": ["List of notable events at this time"],
      "exits": [
        {
          "direction": "Direction or exit name",
          "destination": "Where it leads",
          "description": "Exit description",
          "condition": "locked/hidden/etc (optional)"
        }
      ],
      "keeperNotes": "Notes for the Keeper"
    }
  ],
  "tags": ["tag1", "tag2", "descriptive tags"],
  "connections": [
    {
      "scenarioName": "Related scenario name",
      "relationshipType": "leads_to" | "concurrent" | "prerequisite" | "alternate",
      "description": "How they're connected"
    }
  ]
}

Important extraction guidelines:
1. **Timeline Ordering**: Look for temporal indicators (time of day, dates, "later", "meanwhile", "the next day", etc.)
2. **Character Tracking**: Note how characters move between locations and change status over time
3. **Clue Evolution**: Some clues may only be available at certain times or after certain events
4. **Environmental Changes**: Weather, lighting, sounds that change over time
5. **Multiple Time Points**: If the document describes the same location at different times, create separate timeline entries
6. **Keeper Information**: Separate player-visible information from Keeper-only notes
7. **Clue Scope**: Only include clues that can be discovered in the scene/location/timeline entry itself. Do NOT include clues that belong solely to an NPC's private knowledge.
8. **Partial Inputs**: The text you see may be only a fragment of the full scenario. If information is missing or incomplete, leave the field blank or omit it—do NOT fabricate details.
9. **Scene Granularity**: Treat a scene as a whole area/building (e.g., a hotel, a plaza, a home, a hospital, a lumberyard). Do NOT split into individual rooms; fold room-level details into the description/clues of the parent location. Story background or meta setup is not itself a scene—only concrete places/areas that investigators can visit.
10. **Location-First Modeling**: Each scenario maps to a single location/environment (e.g., “医院”, “工厂”, “广场”). Do NOT create separate scenarios for events. Use the timeline to capture different time states of the same location (what time, which people, what events/clues), not to jump across different places. Do not add a category field—only the name/description identify the place.

Pay special attention to:
- Time markers and chronological sequence
- Character movements and status changes
- When clues become available or discoverable
- Environmental/atmospheric changes
- Events that trigger scene changes

Extract ALL time points mentioned in the document, even if subtle. Look for phrases like:
- "Later that evening..."
- "The next morning..."
- "Meanwhile, in the library..."
- "After the investigators leave..."
- "During the night..."

Document content:
---
${text}
---

File name: ${fileName}

Return ONLY the JSON object, no additional text.`;

    let lastError: unknown;

    for (let attempt = 1; attempt <= 3; attempt++) {
      try {
        const response = await this.llm.invoke(prompt);
        const content = response.content as string;

        // Extract JSON from response (in case LLM wraps it in markdown code blocks)
        const jsonText =
          content.match(/```(?:json)?\s*([\s\S]*?)```/i)?.[1] ||
          content.match(/\{[\s\S]*\}/)?.[0];

        if (!jsonText) {
          throw new Error(`Failed to extract JSON from LLM response: ${content}`);
        }

        const scenarioData: ParsedScenarioData = JSON.parse(jsonText);

        // Validate required fields
        if (!scenarioData.name) {
          throw new Error(
            `Scenario name is required but not found in document: ${fileName}`
          );
        }

        if (!scenarioData.timeline || scenarioData.timeline.length === 0) {
          throw new Error(
            `At least one timeline entry is required but not found in document: ${fileName}`
          );
        }

        return scenarioData;
      } catch (err) {
        lastError = err;
        const detail =
          err instanceof Error ? err.message : typeof err === "string" ? err : "Unknown error";
        console.warn(
          `Retry ${attempt}/3 for ${fileName} due to error: ${detail}`
        );
        if (attempt === 3) {
          throw err;
        }
      }
    }

    throw lastError instanceof Error ? lastError : new Error(String(lastError));
  }

  /**
   * Parse multiple documents from a directory
   */
  async parseDirectory(dirPath: string): Promise<ParsedScenarioData[]> {
    if (!fs.existsSync(dirPath)) {
      throw new Error(`Directory does not exist: ${dirPath}`);
    }

    const files = fs.readdirSync(dirPath);
    const scenarioFiles = files.filter((f) => {
      const ext = path.extname(f).toLowerCase();
      return ext === ".docx" || ext === ".pdf";
    });

    const results: ParsedScenarioData[] = [];

    for (const file of scenarioFiles) {
      try {
        const filePath = path.join(dirPath, file);
        console.log(`Parsing scenario document: ${file}...`);
        const scenarioData = await this.parseDocument(filePath);
        results.push(scenarioData);
        console.log(`✓ Successfully parsed: ${scenarioData.name} (${scenarioData.timeline.length} time points)`);
      } catch (error) {
        console.error(`✗ Failed to parse ${file}:`, error);
      }
    }

    return results;
  }

  /**
   * Split text into overlapping chunks to preserve context across boundaries
   */
  private splitTextWithOverlap(
    text: string,
    chunkSize: number,
    overlap: number
  ): string[] {
    const chunks: string[] = [];
    let start = 0;

    while (start < text.length) {
      const end = Math.min(start + chunkSize, text.length);
      let chunk = text.slice(start, end);

      if (end < text.length) {
        const boundary = chunk.lastIndexOf("\n\n");
        if (boundary > 0 && boundary > chunkSize - 800) {
          chunk = chunk.slice(0, boundary);
        }
      }

      chunks.push(chunk);
      if (end >= text.length) break;
      start += chunk.length - overlap;
      if (start < 0) start = 0;
    }

    return chunks;
  }

  /**
   * Merge scenario results from multiple chunks
   */
  private mergeScenarioResults(
    base: ParsedScenarioData,
    incoming: ParsedScenarioData
  ): ParsedScenarioData {
    const norm = (v?: string) => (v ? v.toLowerCase().trim() : "");
    const makeTimelineKey = (entry: ParsedScenarioData["timeline"][number]) => {
      const ts = norm(entry.timePoint.timestamp);
      const loc = norm(entry.location);
      const name = norm(entry.name);
      const desc = norm(entry.description?.slice(0, 32));

      if (ts || loc || name) {
        return `ts:${ts}|loc:${loc}|name:${name}`;
      }
      return `desc:${desc}`;
    };

    const merged: ParsedScenarioData = {
      name: base.name || incoming.name,
      description: this.pickLonger(base.description, incoming.description) || "",
      timeline: [],
      tags: this.mergeStringArrays(base.tags, incoming.tags) || [],
      connections: this.mergeByKey(
        base.connections,
        incoming.connections,
        (c) => `${c.scenarioName}-${c.relationshipType}-${c.description ?? ""}`
      ),
    };

    const timelineMap = new Map<string, typeof base.timeline[number]>();
    const addTimeline = (entry: typeof base.timeline[number]) => {
      const key = makeTimelineKey(entry);
      if (timelineMap.has(key)) {
        const existing = timelineMap.get(key)!;
        timelineMap.set(key, this.mergeTimelineEntry(existing, entry));
      } else {
        timelineMap.set(key, entry);
      }
    };

    base.timeline.forEach(addTimeline);
    incoming.timeline.forEach(addTimeline);

    merged.timeline = Array.from(timelineMap.values());
    return merged;
  }

  private mergeTimelineEntry(
    a: ParsedScenarioData["timeline"][number],
    b: ParsedScenarioData["timeline"][number]
  ): ParsedScenarioData["timeline"][number] {
    return {
      ...a,
      timePoint: {
        timestamp: a.timePoint.timestamp || b.timePoint.timestamp || "",
        notes: this.pickLonger(a.timePoint.notes, b.timePoint.notes),
      },
      name: a.name || b.name,
      location: a.location || b.location,
      description: this.pickLonger(a.description, b.description) || "",
      characters: this.mergeByKey(
        a.characters,
        b.characters,
        (c) => c.name
      ),
      clues: this.mergeByKey(a.clues, b.clues, (c) => c.clueText),
      conditions: this.mergeByKey(
        a.conditions,
        b.conditions,
        (c) => `${c.type}-${c.description}`
      ),
      events: this.mergeStringArrays(a.events, b.events) || [],
      exits: this.mergeByKey(
        a.exits,
        b.exits,
        (e) => `${e.direction}-${e.destination}`
      ),
      keeperNotes: this.pickLonger(a.keeperNotes, b.keeperNotes),
    };
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

  private mergeByKey<T extends Record<string, any>>(
    a: T[] | undefined,
    b: T[] | undefined,
    keyFn: (item: T) => string
  ): T[] {
    const map = new Map<string, T>();
    (a || []).forEach((item) => map.set(keyFn(item), item));
    (b || []).forEach((item) => {
      const key = keyFn(item);
      if (!map.has(key)) {
        map.set(key, item);
      }
    });
    return Array.from(map.values());
  }
}
