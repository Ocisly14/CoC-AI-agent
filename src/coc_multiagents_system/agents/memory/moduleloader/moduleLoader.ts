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
   * Get database instance for column checks
   */
  private get dbInstance(): CoCDatabase {
    return this.db;
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
   * Check if any JSON files in directory have changed since last load
   */
  private checkForJSONChanges(dirPath: string): { hasChanges: boolean; currentFiles: Map<string, number> } {
    if (!fs.existsSync(dirPath)) {
      return { hasChanges: false, currentFiles: new Map() };
    }

    const currentFiles = new Map<string, number>();
    const files = fs.readdirSync(dirPath).filter(file => file.toLowerCase().endsWith(".json"));

    // Get modification times for all JSON files
    for (const file of files) {
      const filePath = path.join(dirPath, file);
      const stats = fs.statSync(filePath);
      currentFiles.set(file, stats.mtime.getTime());
    }

    // Check if we have existing modules
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
   * Load modules from JSON files in a directory (skip document parsing)
   */
  async loadModulesFromJSONDirectory(dirPath: string, forceReload = false): Promise<ModuleBackground[]> {
    console.log(`\n=== Loading Modules from JSON directory: ${dirPath} ===`);

    if (!fs.existsSync(dirPath)) {
      console.log(`Directory does not exist: ${dirPath}`);
      return [];
    }

    // Check for file changes unless forced reload
    if (!forceReload) {
      const { hasChanges } = this.checkForJSONChanges(dirPath);
      if (!hasChanges) {
        const existingModules = this.getAllModules();
        console.log(`No changes detected. Using ${existingModules.length} existing modules from database.`);
        return existingModules;
      }
    }

    console.log(`📦 找到模块JSON文件，开始加载...`);

    const files = fs.readdirSync(dirPath);
    const jsonFiles = files.filter((f) => f.toLowerCase().endsWith(".json"));

    if (jsonFiles.length === 0) {
      console.log("⚠️  目录中未找到JSON文件。");
      this.updateLastLoadTimestamp(dirPath);
      return [];
    }

    console.log(`📦 找到 ${jsonFiles.length} 个模块JSON文件，开始加载...`);
    const allParsedModules: ParsedModuleData[] = [];

    for (let i = 0; i < jsonFiles.length; i++) {
      const file = jsonFiles[i];
      try {
        console.log(`  [${i + 1}/${jsonFiles.length}] 正在加载: ${file}`);
        const filePath = path.join(dirPath, file);
        const fileContent = fs.readFileSync(filePath, "utf-8");
        const jsonData = JSON.parse(fileContent);

        // Handle both array of modules and single module object
        const modules: ParsedModuleData[] = Array.isArray(jsonData) ? jsonData : [jsonData];

        for (const moduleData of modules) {
          allParsedModules.push(moduleData);
        }
        console.log(`  ✓ 已加载 ${modules.length} 个模块从文件: ${file}`);
      } catch (error) {
        console.error(`  ✗ 加载文件失败 ${file}:`, error);
      }
    }

    if (allParsedModules.length === 0) {
      console.log("⚠️  JSON文件中未找到模块数据。");
      this.updateLastLoadTimestamp(dirPath);
      return [];
    }

    // Convert and store each module
    console.log(`💾 开始保存 ${allParsedModules.length} 个模块到数据库...`);
    const moduleRecords: ModuleBackground[] = [];
    for (let i = 0; i < allParsedModules.length; i++) {
      const parsed = allParsedModules[i];
      try {
        console.log(`  [${i + 1}/${allParsedModules.length}] 正在保存模块: ${parsed.title}`);
        const moduleRecord = this.convertToModuleBackground(parsed);
        this.saveModuleToDatabase(moduleRecord);
        moduleRecords.push(moduleRecord);
        console.log(`    ✓ 已保存模块: ${moduleRecord.title}`);
      } catch (error) {
        console.error(`    ✗ 保存模块失败 ${parsed.title}:`, error);
      }
    }

    // Update timestamp after successful load
    this.updateLastLoadTimestamp(dirPath);

    console.log(`\n=== Successfully loaded ${moduleRecords.length} modules from JSON files ===\n`);
    return moduleRecords;
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
      initialGameTime: row.initial_game_time,
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

    console.log(`📦 开始从目录加载模块: ${dirPath}`);

    const parsedModules = await this.parser.parseDirectory(dirPath);

    if (parsedModules.length === 0) {
      console.log("⚠️  目录中未找到模块文档。");
      this.updateLastLoadTimestamp(dirPath);
      return [];
    }

    console.log(`💾 开始保存 ${parsedModules.length} 个模块到数据库...`);
    const moduleRecords: ModuleBackground[] = [];
    for (let i = 0; i < parsedModules.length; i++) {
      const parsed = parsedModules[i];
      try {
        console.log(`  [${i + 1}/${parsedModules.length}] 正在保存模块: ${parsed.title}`);
        const moduleRecord = this.convertToModuleBackground(parsed);
        this.saveModuleToDatabase(moduleRecord);
        moduleRecords.push(moduleRecord);
        console.log(`    ✓ 已保存模块: ${moduleRecord.title}`);
      } catch (error) {
        console.error(`    ✗ 保存模块失败 ${parsed.title}:`, error);
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
      initialGameTime: parsed.initialGameTime,
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

    // Check if initial_game_time column exists
    const hasInitialGameTime = this.dbInstance.hasColumn("module_backgrounds", "initial_game_time");

    if (hasInitialGameTime) {
      const stmt = database.prepare(`
              INSERT OR REPLACE INTO module_backgrounds (
                  module_id, title, background, story_outline, module_notes,
                  keeper_guidance, story_hook, module_limitations, initial_scenario, initial_game_time, tags, source, created_at
              ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
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
        module.initialGameTime || null,
        JSON.stringify(module.tags || []),
        module.source || null,
        module.createdAt
      );
    } else {
      // Fallback for older schema
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
}
