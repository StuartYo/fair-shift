import type { ChatMessage, ChatOptions, ChatProvider, ChatResult, ToolCall } from "./provider";

// Scripted stand-in for Nemotron, used only when API keys are missing (or
// APP_FORCE_MOCK=1). It drives the real agent loop and real tool handlers so the
// pipeline can be built and tested offline. It makes no judgement of its own:
// an app supplies a script that decides the next action from the conversation.

export const MOCK_MODEL = "mock/scripted-agent";

export interface MockAction {
  /** Tool to call. Omit (and omit calls) to reply with plain text. */
  tool?: string;
  args?: Record<string, unknown>;
  /** Several tool calls in one turn, like a model making parallel calls. */
  calls?: { tool: string; args?: Record<string, unknown> }[];
  text?: string;
}

export type MockScript = (messages: ChatMessage[], opts: ChatOptions) => MockAction;

/** Plays a fixed list of actions, one per assistant turn, then repeats the last. */
export function playActions(actions: MockAction[]): MockScript {
  return (messages) => {
    const done = messages.filter((m) => m.role === "assistant").length;
    return actions[Math.min(done, actions.length - 1)] ?? { tool: "finish", args: { summary: "done" } };
  };
}

const DEFAULT_SCRIPT: MockScript = (_m, opts) =>
  opts.jsonMode ? { text: "{}" } : { tool: "finish", args: { summary: "Mock run: no app script registered." } };

export class MockProvider implements ChatProvider {
  readonly kind = "mock" as const;
  public calls = 0;
  constructor(private script: MockScript = DEFAULT_SCRIPT) {}

  async chat(_models: string[], messages: ChatMessage[], opts: ChatOptions = {}): Promise<ChatResult> {
    const action = this.script(messages, opts);
    const n = this.calls++;
    const list = action.calls ?? (action.tool ? [{ tool: action.tool, args: action.args }] : []);
    if (list.length === 0) {
      return { message: { content: action.text ?? "" }, model: MOCK_MODEL, promptTokens: 0, completionTokens: 0 };
    }
    const tool_calls: ToolCall[] = list.map((c, i) => ({
      id: `mock_${n}_${i}`,
      type: "function",
      function: { name: c.tool, arguments: JSON.stringify(c.args ?? {}) },
    }));
    return { message: { content: null, tool_calls }, model: MOCK_MODEL, promptTokens: 0, completionTokens: 0 };
  }
}
