/**
 * Module Loader
 * Loads module briefing data from documents and stores them in the database
 */

import { randomUUID } from "crypto";
import fs from "fs";
import path from "path";
import type { CoCDatabase } from "../database/schema.js";
import type {
  ModuleBackground,
  ParsedModuleData,
} from "../../models/moduleTypes.js";
import { ModuleDocumentParser } from "./moduleDocumentParser.js";

export class ModuleLoader {
  private db: CoCDatabase;
  private parser: ModuleDocumentParser;

  constructor(db: CoCDatabase, parser?: ModuleDocumentParser) {
    this.db = db;
    this.parser = parser || new ModuleDocumentParser();
  }

  /**
   * Check if any files in directory have changed since last load
   */
  private checkForChanges(dirPath: string): { hasChanges: boolean; currentFiles: Map<string, number> } {
    if (!fs.existsSync(dirPath)) {
      return { hasChanges: false, currentFiles: new Map() };
    }

    const currentFiles = new Map<string, number>();
    const files = fs.readdirSync(dirPath).filter(file => 
      file.endsWith('.docx') || file.endsWith('.pdf')
    );

    // Get modification times for all relevant files
    for (const file of files) {
      const filePath = path.join(dirPath, file);
      const stats = fs.statSync(filePath);
      currentFiles.set(file, stats.mtime.getTime());
    }

    // Check if we have existing modules in database
    const existingModules = this.getAllModules();
    
    // If no modules exist, we need to load
    if (existingModules.length === 0) {
      return { hasChanges: true, currentFiles };
    }

    // Check timestamp file
    const lastLoadFile = path.join(dirPath, '.last_module_load_timestamp');
    let lastLoadTime = 0;
    
    if (fs.existsSync(lastLoadFile)) {
      try {
        lastLoadTime = parseInt(fs.readFileSync(lastLoadFile, 'utf8'));
      } catch {
        return { hasChanges: true, currentFiles };
      }
    }

    // Check if any file is newer than last load
    const hasChanges = Array.from(currentFiles.values()).some(mtime => mtime > lastLoadTime);
    
    return { hasChanges, currentFiles };
  }

  /**
   * Update the last load timestamp
   */
  private updateLastLoadTimestamp(dirPath: string): void {
    const lastLoadFile = path.join(dirPath, '.last_module_load_timestamp');
    const currentTime = Date.now().toString();
    fs.writeFileSync(lastLoadFile, currentTime, 'utf8');
  }

  /**
   * Get all modules from database
   */
  getAllModules(): ModuleBackground[] {
    const database = this.db.getDatabase();
    const modules = database.prepare(`
      SELECT * FROM module_backgrounds ORDER BY created_at DESC
    `).all() as any[];

    return modules.map((row) => ({
      id: row.module_id,
      title: row.title,
      background: row.background,
      storyOutline: row.story_outline,
      moduleNotes: row.module_notes,
      keeperGuidance: row.keeper_guidance,
      storyHook: row.story_hook,
      moduleLimitations: row.module_limitations,
      initialScenario: row.initial_scenario,
      tags: JSON.parse(row.tags || '[]'),
      source: row.source,
      createdAt: row.created_at,
    }));
  }

  /**
   * Load module briefings from a directory (only if files have changed)
   */
  async loadModulesFromDirectory(dirPath: string, forceReload = false): Promise<ModuleBackground[]> {
    console.log(`\n=== Checking Modules in directory: ${dirPath} ===`);

    if (!fs.existsSync(dirPath)) {
      console.log(`Directory does not exist, creating: ${dirPath}`);
      fs.mkdirSync(dirPath, { recursive: true });
      return [];
    }

    // Check for file changes unless forced reload
    if (!forceReload) {
      const { hasChanges } = this.checkForChanges(dirPath);
      if (!hasChanges) {
        const existingModules = this.getAllModules();
        console.log(`No changes detected. Using ${existingModules.length} existing modules from database.`);
        return existingModules;
      }
    }

    console.log(`Loading Modules from directory: ${dirPath}`);

    const parsedModules = await this.parser.parseDirectory(dirPath);

    if (parsedModules.length === 0) {
      console.log("No module documents found in directory.");
      this.updateLastLoadTimestamp(dirPath);
      return [];
    }

    const moduleRecords: ModuleBackground[] = [];
    for (const parsed of parsedModules) {
      try {
        const moduleRecord = this.convertToModuleBackground(parsed);
        this.saveModuleToDatabase(moduleRecord);
        moduleRecords.push(moduleRecord);
        console.log(`✓ Loaded Module: ${moduleRecord.title} (${moduleRecord.id})`);
      } catch (error) {
        console.error(`✗ Failed to load module ${parsed.title}:`, error);
      }
    }

    // Update timestamp after successful load
    this.updateLastLoadTimestamp(dirPath);

    console.log(`\n=== Successfully loaded ${moduleRecords.length} modules ===\n`);
    return moduleRecords;
  }

  private convertToModuleBackground(parsed: ParsedModuleData): ModuleBackground {
    const moduleId = this.generateModuleId(parsed.title);

    return {
      id: moduleId,
      title: parsed.title,
      background: parsed.background,
      storyOutline: parsed.storyOutline,
      moduleNotes: parsed.moduleNotes,
      keeperGuidance: parsed.keeperGuidance,
      storyHook: parsed.storyHook,
      moduleLimitations: parsed.moduleLimitations,
      initialScenario: parsed.initialScenario,
      tags: parsed.tags || [],
      source: parsed.source,
      createdAt: new Date().toISOString(),
    };
  }

  private generateModuleId(title: string): string {
    return `module-${title.toLowerCase().replace(/\s+/g, "-").replace(/[^\w-]/g, "")}-${randomUUID().slice(0, 8)}`;
  }

  private saveModuleToDatabase(module: ModuleBackground): void {
    const database = this.db.getDatabase();

    const stmt = database.prepare(`
            INSERT OR REPLACE INTO module_backgrounds (
                module_id, title, background, story_outline, module_notes,
                keeper_guidance, story_hook, module_limitations, initial_scenario, tags, source, created_at
            ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
        `);

    stmt.run(
      module.id,
      module.title,
      module.background || null,
      module.storyOutline || null,
      module.moduleNotes || null,
      module.keeperGuidance || null,
      module.storyHook || null,
      module.moduleLimitations || null,
      module.initialScenario || null,
      JSON.stringify(module.tags || []),
      module.source || null,
      module.createdAt
    );
  }
}
