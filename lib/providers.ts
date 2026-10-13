import { currentMode, liveSearchWithMockModel, modeNote, type Mode } from "./config";
import { MockProvider, type MockScript } from "./llm/mock";
import { NebiusProvider } from "./llm/nebius";
import type { ChatProvider } from "./llm/provider";
import { FixtureSearchProvider, type FixtureSet } from "./search/fixture";
import type { SearchProvider } from "./search/provider";
import { TavilyProvider } from "./search/tavily";

// Picks real or mock providers automatically. Live needs both NEBIUS_API_KEY and
// TAVILY_API_KEY; with either missing (or APP_FORCE_MOCK=1) the app runs on the
// scripted mock model and recorded fixtures, and says so in every response.
// APP_LIVE_SEARCH=1 with only TAVILY_API_KEY: mock model, real Tavily retrieval.

export interface Providers {
  mode: Mode;
  modeNote: string;
  llm: ChatProvider;
  search: SearchProvider;
}

export function getProviders(mock: { fixtures: FixtureSet; script?: MockScript }): Providers {
  const mode = currentMode();
  if (mode === "live") {
    return { mode, modeNote: modeNote(mode), llm: new NebiusProvider(), search: new TavilyProvider() };
  }
  return {
    mode,
    modeNote: modeNote(mode),
    llm: new MockProvider(mock.script),
    search: liveSearchWithMockModel() ? new TavilyProvider() : new FixtureSearchProvider(mock.fixtures),
  };
}
