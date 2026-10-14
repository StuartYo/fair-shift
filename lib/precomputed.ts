import saved from "../fixtures/precomputed.json";
import type { FairShiftReport } from "./wage/types";

// Saved live results for the page samples (fixtures/precomputed.json, written
// by `npm run eval` in live mode; all inputs are synthetic). When the public
// demo reaches a daily cap, or a live run fails, a sample still shows a real
// result, labelled with when it was computed and why it is shown.

const file = saved as unknown as { ranAt: string | null; reports: Record<string, FairShiftReport> };

export function precomputedFor(sampleId: string, reason: "limit" | "error"): FairShiftReport | undefined {
  const r = file.reports[sampleId];
  if (!r || !file.ranAt) return undefined;
  const when = file.ranAt.slice(0, 10);
  const why =
    reason === "limit"
      ? { en: "the public demo reached its daily limit", zh: "公開示範今天的額度已用完" }
      : { en: "the live run did not finish", zh: "這次線上計算沒有跑完" };
  return {
    ...r,
    precomputed: {
      reason,
      ranAt: file.ranAt,
      en: `Saved result: ${why.en}, so this is the live result Fair Shift computed for this sample on ${when} (same models, same checks). Your own input is never answered from saved results.`,
      zh: `存檔結果：${why.zh}，所以這裡顯示 Fair Shift 在 ${when} 為這個範例實際跑出的線上結果（同樣的模型和檢查）。你自己輸入的資料不會用存檔回答。`,
    },
  };
}
