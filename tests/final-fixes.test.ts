import { describe, expect, it } from "vitest";
import { REALSTYLE_CASES } from "../eval/realstyle";
import fixtures from "../fixtures/official-pages.json";
import { MockProvider } from "../lib/llm/mock";
import type { ChatMessage, ChatOptions, ChatProvider } from "../lib/llm/provider";
import { FixtureSearchProvider, type FixtureSet } from "../lib/search/fixture";
import { rulesMockScript } from "../lib/wage/agent";
import { nextSteps } from "../lib/wage/i18n";
import { runFairShift } from "../lib/wage/run";
import type { CheckInput } from "../lib/wage/types";

// Fixes from the final review: the employer message carries its premises, a
// summary that calls holiday pay "overtime" is rejected, and the New York time
// limit is the DOL's. Synthetic data only.

const deps = (llm: ChatProvider) => ({
  llm,
  search: new FixtureSearchProvider(fixtures as FixtureSet),
  mode: "mock" as const,
  modeNote: "test",
  today: "2026-10-14",
});
const line = REALSTYLE_CASES.find((c) => c.id === "rs-tw-line-header-week")!;

describe("message to the employer", () => {
  it("states the holiday and break premises next to the amount", async () => {
    const r = await runFairShift(line.input, deps(new MockProvider(rulesMockScript())));
    const zh = r.explanation.messageToEmployer;
    const en = r.explanation.messageTranslation!;
    expect(zh).toContain("在下面的前提下應領 NT$4,606");
    expect(zh).toContain("10/10（國慶日）算成國定假日出勤");
    expect(zh).toContain("休息日");
    expect(zh).toContain("班表上沒有寫休息時間（10/10）");
    // The premises come before the request for the gross amount and the reasons.
    expect(zh.indexOf("前提：")).toBeLessThan(zh.indexOf("應發金額和扣款明細"));
    expect(en).toContain("and the assumptions below, I expected NT$4,606");
    expect(en).toContain("If that day was my rest day");
    expect(en).toContain("does not list a break for Oct 10");
    // Net pay only: still no claimed difference.
    expect(zh).not.toContain("相差");
  });

  it("says a break lowers holiday pay too, not only overtime", async () => {
    const r = await runFairShift(line.input, deps(new MockProvider(rulesMockScript())));
    const p = r.premises.find((x) => x.id === "break_unstated")!;
    expect(p.en).toContain("holiday");
    expect(p.zh).toContain("假日加倍");
  });

  it("gives the rest day premise when no holiday reading applies and the rest day is unknown", async () => {
    const input: CheckInput = { jurisdiction: "TW", scheduleText: "10/20 18:00-22:00\n10/21 18:00-22:00", payslipText: "時薪 180 應發 1,440" };
    const r = await runFairShift(input, deps(new MockProvider(rulesMockScript())));
    expect(r.explanation.messageToEmployer).toContain("每一天都當一般工作日計算");
  });
});

describe("plain-language summary", () => {
  // A live-like provider: the scripted agent for everything, and a summary that calls holiday pay overtime.
  const liveLike = (summary: { explanation_en: string; explanation_zh: string }): ChatProvider => {
    const inner = new MockProvider(rulesMockScript());
    return {
      kind: "nebius",
      async chat(models: string[], messages: ChatMessage[], opts: ChatOptions = {}) {
        if (String(messages[0]?.content ?? "").startsWith("You explain a pay check result"))
          return { message: { content: JSON.stringify(summary) }, model: "test/ultra", promptTokens: 0, completionTokens: 0 };
        return inner.chat(models, messages, opts);
      },
    };
  };

  it("is rejected when it calls holiday double pay overtime", async () => {
    const r = await runFairShift(
      line.input,
      deps(
        liveLike({
          explanation_en: "Based on what you entered, Oct 10 was National Day, so those 8 hours pay double. The overtime assumes no break.",
          explanation_zh: "照你輸入的，10/10 是國慶日，那天要領兩倍。",
        }),
      ),
    );
    expect(r.explanation.source).toBe("template");
    expect(r.trace.some((t) => t.name === "explanation_rejected" && /overtime/.test(t.detail ?? ""))).toBe(true);
  });

  it("is kept when it names holiday pay correctly", async () => {
    const r = await runFairShift(
      line.input,
      deps(
        liveLike({
          explanation_en: "Based on what you entered, Oct 10 was National Day, so those 8 hours pay double. No break was written, so with a break it would be less.",
          explanation_zh: "照你輸入的，10/10 是國慶日，那天要領兩倍。",
        }),
      ),
    );
    expect(r.explanation.source).toBe("model");
  });
});

describe("New York next steps", () => {
  it("says three years is the DOL's complaint limit", () => {
    const s = nextSteps("US-NY").find((x) => x.en.includes("LS223"))!;
    expect(s.en).toContain("that is the DOL's limit");
    expect(s.zh).toContain("這是勞工局的申訴期限");
  });
});
