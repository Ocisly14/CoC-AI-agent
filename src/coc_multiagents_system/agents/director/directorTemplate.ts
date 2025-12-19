/**
 * Director Agent Template - for plot progression and scenario management
 */
export function getDirectorTemplate(): string {
    return `# Director Agent - Story Progression Analysis

Monitor game progress and determine when to advance the story while respecting investigator agency.

## 🎬 Current Scene
{{#if currentScenario}}
**{{currentScenario.name}}** @ {{currentScenario.location}}

{{currentScenario.description}}

👥 {{currentScenario.characters.length}} characters | 💡 Clues: {{discoveredCluesCount}}/{{totalCluesCount}} | 🚪 {{currentScenario.exits.length}} exits
{{#if currentScenario.keeperNotes}}
🎭 {{currentScenario.keeperNotes}}
{{/if}}
{{else}}
*No scene loaded*
{{/if}}

## 🕵️ Clues
{{#if discoveredClues}}
{{#each discoveredClues}}
✅ {{this.clueText}}
{{/each}}
{{else}}
*None discovered*
{{/if}}

## 📝 Recent Queries
{{#if recentQueries}}
{{#each recentQueries}}
{{add @index 1}}. "{{this}}"
{{/each}}
{{else}}
*None*
{{/if}}

## 🗺️ Town Map & Spatial Logic
{{#if mapData}}
**Map Name**: {{mapData.map_name}}

**Spatial Logic**: {{mapData.spatial_logic}}

### Road Network
{{#each mapData.road_network}}
**{{this.road_name}}** ({{this.orientation}})
{{#if this.connected_to}}
🔗 Connected to: {{#each this.connected_to}}{{this}}{{#unless @last}}, {{/unless}}{{/each}}
{{/if}}
{{#if this.locations_along_road}}
📍 Locations: {{#each this.locations_along_road}}{{this}}{{#unless @last}}, {{/unless}}{{/each}}
{{/if}}
{{#if this.sub_sections}}
{{#each this.sub_sections}}
  - **{{this.segment}}**: Connected to {{#each this.connected_to}}{{this}}{{#unless @last}}, {{/unless}}{{/each}}
    Locations: {{#each this.locations}}{{this}}{{#unless @last}}, {{/unless}}{{/each}}
{{/each}}
{{/if}}

{{/each}}

### Hidden Connectivity
{{#if mapData.hidden_connectivity}}
{{#each mapData.hidden_connectivity}}
- **{{this.entry_point}}** → {{this.leads_to}}
{{/each}}
{{else}}
*No hidden connections*
{{/if}}

### Visited Scenarios
{{#if visitedScenarioNames}}
{{#each visitedScenarioNames}}
- ✅ {{this}}
{{/each}}
{{else}}
*None visited yet*
{{/if}}
{{else}}
*Map data not available*
{{/if}}

## 📊 Game State
**Player**: HP {{gameStats.playerStatus.hp}}/{{gameStats.playerStatus.maxHp}} | Sanity {{gameStats.playerStatus.sanity}}/{{gameStats.playerStatus.maxSanity}}
**Progress**: {{gameStats.totalCluesDiscovered}} clues found | {{gameStats.visitedScenarioCount}} scenes visited
**Latest Query**: "{{latestUserQuery}}"

## Decision Framework

**Progress When**:
- Stagnation: Multiple "what next" queries, all clues found, no progress
- Natural: Clues point elsewhere, story logic suggests transition
- Forced: Low HP/Sanity, time-sensitive events, safety concerns

**Stay When**:
- Active investigation ongoing
- Key clues remain undiscovered
- Investigator has meaningful options

**Types**:
- **scene_change**: Move to different location
- **narrative_push**: Inject events into current scene
- **none**: Continue current scene

## Response
\`\`\`json
{
  "shouldProgress": true/false,
  "targetSnapshotId": "snapshot-id or null",
  "targetScenarioName": "scenario name from map or null (alternative to targetSnapshotId)",
  "estimatedShortActions": number or null,
  "increaseShortActionCapBy": number or null,
  "reasoning": "Explanation (2-3 sentences, must reference map spatial logic)"
}
\`\`\`

**Fields**:
- **shouldProgress**: true to advance story
- **targetSnapshotId**: Snapshot ID of target scenario (can be null if using targetScenarioName)
- **targetScenarioName**: Name of target scenario from map (alternative to targetSnapshotId, e.g., "Star Hospital", "Train Station", "Helen's Restaurant")
- **estimatedShortActions**: Actions available in new scene (null if staying)
- **increaseShortActionCapBy**: Extra actions for current scene (null if progressing)
- **reasoning**: Why progress or stay (must reference map spatial logic and road connections)

**Important**: 
- Use the map's spatial logic to determine which locations are accessible from the current scene
- Consider road connections and locations_along_road when selecting next scene
- Check visitedScenarioNames to avoid revisiting unless story requires it
- Match scenario names from the map to actual scenario names in the system

*Analyze and decide:*`;
}

/**
 * Scene Transition Template - for deciding scene changes
 */
export function getSceneTransitionTemplate(): string {
    return `# Director Agent - Scene Transition Decision

Decide whether to transition to a new scene based on the current state and available options.

## 📍 Current Scene
{{#if currentScene}}
**{{currentScene.name}}** @ {{currentScene.location}}

{{currentScene.description}}

📊 **Status**: {{currentScene.cluesDiscovered}}/{{currentScene.cluesTotal}} clues | {{currentScene.characterCount}} characters | {{currentScene.actionCount}} actions
{{#if currentScene.keeperNotes}}
🎭 {{currentScene.keeperNotes}}
{{/if}}
{{else}}
*No current scene*
{{/if}}

## 🗺️ Available Transitions
{{#if availableScenes}}
{{#each availableScenes}}

**{{this.name}}** (ID: {{this.id}})
📍 {{this.location}}
🔗 {{this.connectionType}}: {{this.connectionDesc}}

{{this.description}}

💡 {{this.clueCount}} clues | 👥 {{this.characterCount}} characters
{{#if this.keeperNotes}}🎭 {{this.keeperNotes}}{{/if}}

{{/each}}
{{else}}
*No transitions available*
{{/if}}

## 📜 Activity
{{activitySummary}}

## Guidelines
✅ **Transition**: Most clues discovered, story stalled, natural timing, investigator ready, OR action points exhausted, OR investigator insists on leaving
❌ **Stay**: Many clues undiscovered (especially easy ones), just arrived, active investigation ongoing, investigator not expressing desire to leave

## Response
\`\`\`json
{
  "shouldTransition": true/false,
  "targetSceneId": "scene-id",
  "reasoning": "Why transition or stay (2-3 sentences)",
  "urgency": "low|medium|high",
  "transitionType": "immediate|gradual|player-initiated",
  "suggestedTransitionNarrative": "Transition hook (1-2 sentences)"
}
\`\`\`

*Decide:*`;
}

/**
 * Action-Driven Scene Change Template - for validating and selecting scene based on map
 */
export function getActionDrivenSceneChangeTemplate(): string {
    return `# Director Agent - Action-Driven Scene Change Validation

Based on the character's input and previous narrative context, determine the appropriate target scene using the town map and spatial logic.

## 📍 Current Scene
{{#if currentScene}}
**{{currentScene.name}}** @ {{currentScene.location}}
{{else}}
*No current scene*
{{/if}}

## 🗺️ Town Map & Spatial Logic
{{#if mapData}}
**Map Name**: {{mapData.map_name}}

**Spatial Logic**: {{mapData.spatial_logic}}

### Road Network
{{#each mapData.road_network}}
**{{this.road_name}}** ({{this.orientation}})
{{#if this.connected_to}}
🔗 Connected to: {{#each this.connected_to}}{{this}}{{#unless @last}}, {{/unless}}{{/each}}
{{/if}}
{{#if this.locations_along_road}}
📍 Locations: {{#each this.locations_along_road}}{{this}}{{#unless @last}}, {{/unless}}{{/each}}
{{/if}}
{{#if this.sub_sections}}
{{#each this.sub_sections}}
  - **{{this.segment}}**: Connected to {{#each this.connected_to}}{{this}}{{#unless @last}}, {{/unless}}{{/each}}
    Locations: {{#each this.locations}}{{this}}{{#unless @last}}, {{/unless}}{{/each}}
{{/each}}
{{/if}}

{{/each}}

### Hidden Connectivity
{{#if mapData.hidden_connectivity}}
{{#each mapData.hidden_connectivity}}
- **{{this.entry_point}}** → {{this.leads_to}}
{{/each}}
{{else}}
*No hidden connections*
{{/if}}
{{else}}
*Map data not available*
{{/if}}

## 📜 Previous Round Context
{{#if previousNarrative}}
**Previous Keeper Narrative**:
"{{previousNarrative}}"
{{else}}
*No previous narrative available*
{{/if}}

## 💬 Current Character Input
{{#if characterInput}}
"{{characterInput}}"
{{else}}
*No character input available*
{{/if}}

## Guidelines
- Analyze the character's input and the previous narrative to understand the intent for scene change
- Use the map's spatial logic to determine which scene the character wants to reach or should reach
- Check road connections: scenes on the same road or connected roads are accessible from the current location
- Consider hidden connectivity (entry points) if applicable
- Based on the character's intent and the map's spatial logic, determine the most appropriate target scene
- Return the exact scene name as it appears in the map or scenario system

## Response
\`\`\`json
{
  "targetScenarioName": "exact scene name from map (e.g., 'Star Hospital', 'Train Station', 'Helen's Restaurant')",
  "reasoning": "Why this scene is selected based on map spatial logic (2-3 sentences)"
}
\`\`\`

**Important**: 
- Return the exact scene name that matches the scenario names in the system
- Base your decision on the character's input and the context from the previous narrative
- Use the map's spatial logic to determine the most appropriate accessible scene
- If the character's intended destination is not directly accessible, suggest the closest accessible scene based on map connections
- Reference specific roads and connections in your reasoning

*Validate and decide:*`;
}

/**
 * Narrative Direction Template - for generating narrative instruction for keeper agent
 */
export function getNarrativeDirectionTemplate(): string {
    return `# Director Agent - Narrative Direction Guidance

Generate narrative direction instructions for the Keeper Agent based on module constraints, keeper guidance, and current game context.

## 📋 Module Constraints

{{#if moduleLimitations}}
### 🚫 Module Limitations
{{moduleLimitations}}

**IMPORTANT**: These are HARD CONSTRAINTS that must NEVER be violated in the narrative.
{{/if}}

{{#if keeperGuidance}}
### 🎭 Keeper Guidance
{{keeperGuidance}}

**IMPORTANT**: This guidance provides running advice for reveals, pacing levers, fail-forward options, tone cues, and when to call for rolls.
{{/if}}

## 💬 Character Input
"{{characterInput}}"

## 🎯 Action Results
{{#if actionResults}}
{{#each actionResults}}
### Action #{{@index}}: {{character}}
{{#if this.result}}
**Result**: {{this.result}}
{{/if}}
{{#if this.location}}
**Location**: {{this.location}}
{{/if}}
{{#if this.gameTime}}
**Game Time**: {{this.gameTime}}
{{/if}}
{{#if this.timeElapsedMinutes}}
**Time Elapsed**: {{this.timeElapsedMinutes}} minutes
{{/if}}
{{#if this.scenarioChanges}}
**Scenario Changes**: {{#each this.scenarioChanges}}{{this}}{{#unless @last}}; {{/unless}}{{/each}}
{{/if}}

{{/each}}
{{else}}
*No action results available*
{{/if}}

## 🎬 Your Task

Based on the module constraints (limitations, keeper guidance, module notes), the character's input, and the action results, generate a narrative direction instruction for the Keeper Agent.

**The instruction should**:
1. Guide the narrative tone and atmosphere based on keeper guidance
2. Ensure compliance with module limitations (hard constraints)
3. Incorporate module notes considerations (pacing, content warnings, etc.)
4. Provide specific guidance on what to emphasize, reveal, or hint at in the narrative
5. Suggest pacing adjustments if needed based on module notes
6. Reference any relevant constraints from module limitations

**Format**: Provide a concise instruction (2-4 sentences) that the Keeper Agent can use to guide their narrative generation.

## Response
\`\`\`json
{
  "narrativeDirection": "Your narrative direction instruction here (2-4 sentences, specific and actionable)"
}
\`\`\`

*Generate narrative direction instruction:*`;
}
