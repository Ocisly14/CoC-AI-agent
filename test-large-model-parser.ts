#!/usr/bin/env tsx

/**
 * Test script for Large Model Scenario Parser
 * Tests the new one-shot parsing with Large model
 */

import { config } from "dotenv";
config();

import fs from "fs";
import path from "path";
import { CoCDatabase } from "./src/coc_multiagents_system/agents/memory/database/schema.js";
import { ScenarioLoader } from "./src/coc_multiagents_system/agents/memory/scenarioloader/index.js";

const logger = {
  info: (msg: string) => console.log(`ℹ️  ${msg}`),
  success: (msg: string) => console.log(`✅ ${msg}`),
  error: (msg: string) => console.log(`❌ ${msg}`),
  warn: (msg: string) => console.log(`⚠️  ${msg}`),
  section: (msg: string) => console.log(`\n📋 === ${msg} ===\n`)
};

async function testLargeModelParser() {
  logger.section("Testing Large Model Scenario Parser");

  try {
    // Check for API keys
    const hasGoogleApi = !!process.env.GOOGLE_API_KEY;
    const hasOpenAiApi = !!process.env.OPENAI_API_KEY;
    
    if (!hasGoogleApi && !hasOpenAiApi) {
      logger.error("No API keys found. Please set either GOOGLE_API_KEY or OPENAI_API_KEY");
      return;
    }
    
    logger.success(`Using: ${hasGoogleApi ? 'Google Gemini 2.5 Pro (Large)' : 'OpenAI GPT-4o (Large)'}`);

    // Initialize database
    logger.info("Initializing test database...");
    const dbPath = path.join(process.cwd(), "data", "test_scenario_large.db");
    
    // Remove existing test database
    if (fs.existsSync(dbPath)) {
      fs.unlinkSync(dbPath);
      logger.info("Removed existing test database");
    }

    const db = new CoCDatabase(dbPath);
    logger.success("Database initialized");

    // Initialize Scenario Loader with new parser
    const scenarioLoader = new ScenarioLoader(db);
    logger.success("Scenario Loader initialized with Large model parser");

    // Load scenarios from directory
    const scenarioDocDir = path.join(process.cwd(), "data", "scenarios");
    
    if (!fs.existsSync(scenarioDocDir)) {
      logger.error(`Scenarios directory does not exist: ${scenarioDocDir}`);
      return;
    }

    // Force reload to test the new parser
    logger.section("Processing Scenarios with Large Model");
    const startTime = Date.now();
    
    const scenarios = await scenarioLoader.loadScenariosFromDirectory(scenarioDocDir, true);
    
    const duration = ((Date.now() - startTime) / 1000).toFixed(2);
    logger.success(`Completed in ${duration} seconds`);

    // Display results
    logger.section("Results Summary");
    logger.info(`Total scenarios extracted: ${scenarios.length}`);
    
    scenarios.forEach((scenario, index) => {
      console.log(`\n${index + 1}. ${scenario.name}`);
      console.log(`   📝 Description: ${scenario.description.substring(0, 100)}...`);
      console.log(`   📍 Location: ${scenario.snapshot.location}`);
      console.log(`   👥 Characters: ${scenario.snapshot.characters.length}`);
      console.log(`   🔍 Clues: ${scenario.snapshot.clues.length}`);
      console.log(`   🌤️  Conditions: ${scenario.snapshot.conditions.length}`);
      console.log(`   📅 Events: ${scenario.snapshot.events.length}`);
      console.log(`   🏷️  Tags: ${scenario.tags.join(', ')}`);
      
      if (scenario.connections.length > 0) {
        console.log(`   🔗 Connections: ${scenario.connections.length}`);
        scenario.connections.forEach(conn => {
          console.log(`      → ${conn.relationshipType}: ${conn.description}`);
        });
      }
    });

    // Verify data quality
    logger.section("Data Quality Check");
    
    const allTags = new Set<string>();
    scenarios.forEach(s => s.tags.forEach(t => allTags.add(t)));
    logger.info(`Unique tags across all scenarios: ${allTags.size}`);
    logger.info(`Tags: ${Array.from(allTags).join(', ')}`);

    const totalCharacters = scenarios.reduce((sum, s) => sum + s.snapshot.characters.length, 0);
    const totalClues = scenarios.reduce((sum, s) => sum + s.snapshot.clues.length, 0);
    
    logger.info(`Total characters: ${totalCharacters}`);
    logger.info(`Total clues: ${totalClues}`);
    logger.info(`Average characters per scenario: ${(totalCharacters / scenarios.length).toFixed(1)}`);
    logger.info(`Average clues per scenario: ${(totalClues / scenarios.length).toFixed(1)}`);

    // Check for scenario name uniqueness (should all be different)
    const uniqueNames = new Set(scenarios.map(s => s.name));
    if (uniqueNames.size === scenarios.length) {
      logger.success(`✓ All scenario names are unique (${uniqueNames.size} scenarios)`);
    } else {
      logger.warn(`⚠️  Duplicate scenario names detected! (${uniqueNames.size} unique names for ${scenarios.length} scenarios)`);
    }

    // Cleanup
    db.close();
    logger.success("Database connection closed");

    logger.section("🎉 Test Completed Successfully");

  } catch (error) {
    logger.error(`Test failed: ${error}`);
    if (error instanceof Error) {
      console.error(error.stack);
    }
    process.exit(1);
  }
}

// Run the test
if (import.meta.url === `file://${process.argv[1]}`) {
  testLargeModelParser().catch(error => {
    console.error("Unhandled error:", error);
    process.exit(1);
  });
}
