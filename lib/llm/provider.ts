// Minimal OpenAI-compatible chat types, so the agent loop works the same with
// the real Nebius client and the scripted mock.

export interface ToolCall {
  id: string;
  type: "function";
  function: { name: string; arguments: string };
}

export type ChatMessage =
  | { role: "system"; content: string }
  | { role: "user"; content: string }
  | { role: "assistant"; content: string | null; tool_calls?: ToolCall[] }
  | { role: "tool"; tool_call_id: string; content: string };

export interface ToolSchema {
  type: "function";
  function: { name: string; description: string; parameters: Record<string, unknown> };
}

export interface ChatResult {
  message: { content: string | null; tool_calls?: ToolCall[] };
  model: string;
  promptTokens: number;
  completionTokens: number;
}

export interface ChatOptions {
  tools?: ToolSchema[];
  maxTokens?: number;
  temperature?: number;
  jsonMode?: boolean;
}

export interface ChatProvider {
  readonly kind: "nebius" | "mock";
  /** models: fallback chain, tried in order until one succeeds. */
  chat(models: string[], messages: ChatMessage[], opts?: ChatOptions): Promise<ChatResult>;
}
