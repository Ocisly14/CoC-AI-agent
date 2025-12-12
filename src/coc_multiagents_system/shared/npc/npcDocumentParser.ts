/**
 * NPC Document Parser
 * Extracts NPC information from DOCX and PDF files using LLM
 */

import fs from "fs";
import path from "path";
import { ChatOpenAI } from "@langchain/openai";
import mammoth from "mammoth";
import pdfParse from "pdf-parse";
import type { ParsedNPCData } from "../models/gameTypes.js";

/**
 * Supported document formats
 */
export type SupportedFormat = "docx" | "pdf";

/**
 * Document parser for NPC information extraction
 */
export class NPCDocumentParser {
  private llm: ChatOpenAI;

  constructor(model?: ChatOpenAI) {
    this.llm =
      model ||
      new ChatOpenAI({
        modelName: "gpt-4o-mini",
        temperature: 0,
      });
  }

  /**
   * Parse a document and extract NPC data
   */
  async parseDocument(filePath: string): Promise<ParsedNPCData> {
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
    const npcData = await this.extractNPCData(text, path.basename(filePath));

    return npcData;
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
   * Use LLM to extract structured NPC data from raw text
   */
  private async extractNPCData(
    text: string,
    fileName: string
  ): Promise<ParsedNPCData> {
    const prompt = `You are an NPC data extractor for a Call of Cthulhu 7th Edition TRPG game.

Extract NPC information from the following document and return it as a JSON object.

The JSON should follow this structure:
{
  "name": "NPC name",
  "occupation": "NPC occupation",
  "age": number,
  "appearance": "physical description",
  "personality": "personality traits",
  "background": "backstory",
  "goals": ["goal 1", "goal 2"],
  "secrets": ["secret 1", "secret 2"],
  "attributes": {
    "STR": number (0-100),
    "CON": number,
    "DEX": number,
    "APP": number,
    "POW": number,
    "SIZ": number,
    "INT": number,
    "EDU": number
  },
  "status": {
    "hp": number,
    "maxHp": number,
    "sanity": number,
    "maxSanity": number,
    "luck": number,
    "mp": number,
    "conditions": []
  },
  "skills": {
    "skill name": value (0-100)
  },
  "inventory": ["item 1", "item 2"],
  "clues": [
    {
      "clueText": "information this NPC knows",
      "category": "knowledge" | "observation" | "rumor" | "secret",
      "difficulty": "regular" | "hard" | "extreme",
      "relatedTo": ["related character or location"]
    }
  ],
  "relationships": [
    {
      "targetName": "related character name",
      "relationshipType": "ally" | "enemy" | "neutral" | "family" | "friend" | "rival" | "employer" | "employee" | "stranger",
      "attitude": number (-100 to 100),
      "description": "relationship description",
      "history": "relationship backstory"
    }
  ],
  "notes": "additional notes"
}

Important notes:
1. Only include fields that are present in the document
2. For missing numerical attributes, you can infer reasonable values based on the NPC description
3. If skills are not specified, include only the most relevant skills for this NPC
4. Extract all clues and relationships mentioned in the document
5. Ensure all numerical values are within valid CoC 7e ranges (attributes: 0-100, hp: derived from CON+SIZ/10, sanity: typically POW*5, luck: typically 50-99)

Document content:
---
${text}
---

File name: ${fileName}

Return ONLY the JSON object, no additional text.`;

    const response = await this.llm.invoke(prompt);
    const content = response.content as string;

    // Extract JSON from response (in case LLM wraps it in markdown code blocks)
    const jsonMatch = content.match(/\{[\s\S]*\}/);
    if (!jsonMatch) {
      throw new Error(`Failed to extract JSON from LLM response: ${content}`);
    }

    const npcData: ParsedNPCData = JSON.parse(jsonMatch[0]);

    // Validate required field
    if (!npcData.name) {
      throw new Error(
        `NPC name is required but not found in document: ${fileName}`
      );
    }

    return npcData;
  }

  /**
   * Parse multiple documents from a directory
   */
  async parseDirectory(dirPath: string): Promise<ParsedNPCData[]> {
    if (!fs.existsSync(dirPath)) {
      throw new Error(`Directory does not exist: ${dirPath}`);
    }

    const files = fs.readdirSync(dirPath);
    const npcFiles = files.filter((f) => {
      const ext = path.extname(f).toLowerCase();
      return ext === ".docx" || ext === ".pdf";
    });

    const results: ParsedNPCData[] = [];

    for (const file of npcFiles) {
      try {
        const filePath = path.join(dirPath, file);
        console.log(`Parsing NPC document: ${file}...`);
        const npcData = await this.parseDocument(filePath);
        results.push(npcData);
        console.log(`✓ Successfully parsed: ${npcData.name}`);
      } catch (error) {
        console.error(`✗ Failed to parse ${file}:`, error);
      }
    }

    return results;
  }
}
