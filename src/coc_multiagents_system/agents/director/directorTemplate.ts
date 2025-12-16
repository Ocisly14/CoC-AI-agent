/**
 * Director Agent Template - for plot progression and scenario management
 */
export function getDirectorTemplate(): string {
    return `# Director Agent - Story Progression Analysis

Monitor game progress and determine when to advance the story while respecting player agency.

## 🎬 Current Scene
{{#if currentScenario}}
**{{currentScenario.name}}** @ {{currentScenario.location}}
🕐 Day {{currentScenario.timePoint.gameDay}}, {{currentScenario.timePoint.timeOfDay}}

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

## 🗺️ Progression Options

### Unvisited Connected Scenes (Next 24h)
{{#if unvisitedScenarios}}
{{#each unvisitedScenarios}}
**{{this.name}}** ({{this.id}})
📍 {{this.location}} | 🕐 +{{this.hoursFromNow}}h (Day {{this.timePoint.gameDay}}, {{this.timePoint.timeOfDay}})
🔗 {{this.connectionType}}: {{this.connectionDescription}}

{{this.description}}

💡 {{this.clueCount}} clues | 👥 {{this.characterCount}} characters
{{#if this.keeperNotes}}🎭 {{this.keeperNotes}}{{/if}}

{{/each}}
{{else}}
*None available within 24 hours*
{{/if}}

### Time Progression (Same Location)
{{#if timeProgressionOptions}}
{{#each timeProgressionOptions}}
**{{this.name}}** ({{this.id}})
🕐 Day {{this.timePoint.gameDay}}, {{this.timePoint.timeOfDay}}
{{this.description}}

{{/each}}
{{else}}
*None available*
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
- Player has meaningful options

**Types**:
- **time_advance**: Next time point in same location
- **scene_change**: Move to different location
- **narrative_push**: Inject events into current scene
- **none**: Continue current scene

## Response
\`\`\`json
{
  "shouldProgress": true/false,
  "targetSnapshotId": "snapshot-id or null",
  "estimatedShortActions": number or null,
  "increaseShortActionCapBy": number or null,
  "reasoning": "Explanation (2-3 sentences)"
}
\`\`\`

**Fields**:
- **shouldProgress**: true to advance story
- **targetSnapshotId**: ID from options above (null if no progress)
- **estimatedShortActions**: Actions available in new scene (null if staying)
- **increaseShortActionCapBy**: Extra actions for current scene (null if progressing)
- **reasoning**: Why progress or stay

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
🕐 Day {{currentScene.gameDay}}, {{currentScene.timeOfDay}}

{{currentScene.description}}

📊 **Status**: {{currentScene.cluesDiscovered}}/{{currentScene.cluesTotal}} clues | {{currentScene.characterCount}} characters | {{currentScene.actionCount}} actions
{{#if currentScene.keeperNotes}}
🎭 {{currentScene.keeperNotes}}
{{/if}}
{{else}}
*No current scene*
{{/if}}

## 🗺️ Available Transitions (Next 24h)
{{#if availableScenes}}
{{#each availableScenes}}

**{{this.name}}** (ID: {{this.id}})
📍 {{this.location}} | 🕐 +{{this.hoursFromNow}}h (Day {{this.gameDay}}, {{this.timeOfDay}})
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
✅ **Transition**: Most clues discovered, story stalled, natural timing, player ready, OR action points exhausted, OR player insists on leaving
❌ **Stay**: Many clues undiscovered (especially easy ones), just arrived, active investigation ongoing, player not expressing desire to leave

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
