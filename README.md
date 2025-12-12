# LangGraph Multi-Agent Starter (TypeScript)

This repo bootstraps a minimal [LangGraph](https://langchain-ai.github.io/langgraph/) workflow written in TypeScript. It wires up two collaborating OpenAI-powered agents (researcher ➝ writer) that operate over a shared `messages` channel.

## Prerequisites

- Node.js 18+
- An OpenAI-compatible API key exposed as `OPENAI_API_KEY`

## Quickstart

```bash
npm install
cp .env.example .env # fill OPENAI_API_KEY
npm run dev -- --prompt "Explain LangGraph in two paragraphs."
```

For production usage run `npm run build && npm start -- --prompt "..."`.

## Key Files

- `package.json` / `tsconfig.json` – TypeScript + LangGraph dependency setup
- `src/state.ts` – shared messages state annotation
- `src/agents.ts` – helper for creating instruction-tuned LLM nodes
- `src/graph.ts` – LangGraph wiring of the researcher and writer nodes
- `src/index.ts` – CLI entrypoint, handles env loading and graph execution

## Extending the Graph

1. Add more nodes (critics, planners, tool-callers) and connect them inside `src/graph.ts`.
2. Attach tools or different models per agent before invoking them in `src/agents.ts`.
3. Swap `ChatOpenAI` for any LangChain-compatible chat model or expose via CLI flags.
4. Integrate LangGraph checkpoints/memories if you need persistence between runs.
