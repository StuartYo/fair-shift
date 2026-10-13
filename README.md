# Fair Shift

Fair Shift checks an hourly worker's pay. Paste a schedule (a LINE message from your manager, your own notes, a timesheet) and the payslip. An agent retrieves the **current official minimum wage and overtime, rest day, holiday, tip credit and spread-of-hours rules** for where you work from government websites, **code** computes what you should have been paid line by line, and every rule is shown with its exact quote, link and effective date. It then drafts a polite message to your employer.

Built for the Nebius x NVIDIA Global AI Hackathon (track: Best Apps and Agents; also Best Use of Tavily).

> Not legal advice. Every sample in this repo is **synthetic** (invented schedules and payslips, no real person or employer).

## Why an agent and not just a model

- **Rates change and models do not know.** Taiwan's 2027 hourly minimum wage (NT$205) was decided on 2026-09-24 and still awaits Executive Yuan approval. New York kept $17.00 / $16.00 for 2027 because an inflation "off-ramp" was triggered. Fair Shift reads these from the Ministry of Labor and NYS DOL pages at run time.
- **Tiered premiums are easy to get wrong.** Taiwan rest day work is paid at 4/3 for the first 2 hours and 5/3 after; holiday work is doubled up to 8 hours, then overtime rates apply; hours over 40 in a week are overtime even when no single day goes over 8. New York tipped overtime is 1.5 times the *full* minimum wage minus the tip credit, not 1.5 times the cash wage. Code does this math, checked against the Ministry of Labor's own worked example (NT$150 x 2 x 4/3 + NT$150 x 6 x 5/3 = NT$1,900).
- **Holidays move.** Lunar New Year, Qingming, Dragon Boat and Mid-Autumn fall on different days every year. JavaScript's built-in Chinese calendar (ICU 78) puts lunar new year 2027 on 2027-02-07; the official government calendar has 2027-02-06. Fair Shift uses the official dates.
- **Every number is traceable.** A rule value is accepted only if its quote appears verbatim in text retrieved during that run **and** code can read the same value (and date, region and job type) back out of the quote.

`eval/` compares Fair Shift against the same Nemotron model answering alone (no tools, no retrieval, no code math).

## How it works

| Step | Who | What |
|---|---|---|
| 1. Redact | code | Names, ID numbers, phones, emails, account numbers are removed before any API call. |
| 2. Parse | **Nemotron 3 Nano** + code | The model turns messy text (`10/7(三) 下午5點到10點`) into shifts; a rule-based parser cross-checks it; code computes hours. |
| 3. Find rules | **Nemotron 3 Super** with tools | `fetch_official` / `search_official` (Tavily, official domains only), then `record_rule` / `record_holiday`. Long pages (a whole law, a 40-page wage order) show the model only the parts matching its `focus`, verbatim. Wrong quotes or values are rejected with a reason and the model retries. |
| 4. Fill gaps | code | If the agent missed a rule, code reads it from the retrieved official text through the same checks. Nothing is filled from memory. |
| 5. Compute | code | Expected pay per shift and segment, minimum wage top-up, premiums, tip credit, spread of hours, shortfall. |
| 6. Explain | **Nemotron 3 Ultra** | Plain-language explanation and employer message. Rejected if it uses any number not in the calculation; a code template is used instead. |

Models are tried in order Nano -> Super -> Ultra on failure (e.g. a model is renamed); out-of-credit (HTTP 402) stops immediately rather than escalating.

### Coverage

| Jurisdiction | Rules |
|---|---|
| Taiwan | Hourly minimum wage by date (incl. pending rates); overtime beyond 8 hours a day **or 40 hours a week** (LSA Art. 24, Enforcement Rules Art. 20-1); rest day work (Art. 24 para. 2); national holiday work (Art. 39); work on the regular day off (Art. 40, flagged); fixed-date national holidays and **lunar-calendar holidays for 2026 and 2027** (紀念日及節日實施條例 Art. 4 to 6). A holiday that falls on your rest day is paid as rest day work and flagged for a substitute day off (MOL, 2026-10-07). |
| New York State | Minimum wage by region and date (NYC, Long Island and Westchester, rest of state); overtime over 40 hours per workweek at 1.5x; **tip credit and tipped overtime** for food service workers and service employees (12 NYCRR 146-1.3, 146-1.4), including the make-up when tips plus cash wage fall below the minimum wage; **spread of hours over 10** (146-1.6 for restaurants and hotels, any pay rate; 142-2.4 for other industries, only the part not already covered by pay above the minimum wage). |

Not checked: Taiwan flexible schedules (變形工時), the monthly overtime cap, which day an employer gives as a substitute holiday, lunar holidays outside 2026-2027 (mark them yourself with `國定假日`), indigenous ritual days; New York call-in pay, split-shift pay outside spread of hours, uniform and meal allowances, the tip threshold for service employees, fast food and home care rates.

#### Taiwan lunar-calendar holidays

The act states these by lunar day, so the solar date is a table in `lib/wage/holidays-tw.ts`, copied from the official government office calendars of the Directorate-General of Personnel Administration (行政院人事行政總處) and pinned by a test:

| Year | 除夕前一日 to 春節 (5 days) | 清明節 | 端午節 | 中秋節 |
|---|---|---|---|---|
| 2026 | 02-15 to 02-19 | 04-05 | 06-19 | 09-25 |
| 2027 | 02-04 to 02-08 | 04-05 | 06-09 | 09-15 |

Only statutory holiday dates are listed. The bridge and substitute days in the DGPA calendar (for example 2027-02-09 and 02-10) apply to government offices; the same DGPA page says private employers follow the Labor Standards Act and agree days off with their workers. The legal basis (which lunar day, and that it is a day off) is still quoted from the act retrieved during the run.

### Official sources (seed list)

Read on 2026-10-13 unless marked. On 2026-10-14 every seed was retrieved with Tavily extract and checked by the verifier (`npm run probe:sources`, results in `eval/results/sources-*.md`). Tavily gets only the page frame from law.moj.gov.tw (no article text, basic or advanced extract), so the app fetches the Labor Standards Act and its Enforcement Rules from the Ministry of Labor's own law database (laws.mol.gov.tw), and the holiday act from the DGPA calendar pages, which quote Art. 3 to 9 verbatim. The law.moj.gov.tw links below are for people.

- Labor Standards Act, full text, MOL law database (app seed for Art. 24, 39, 40; read 2026-10-14): https://laws.mol.gov.tw/FLAW/FLAWDAT0201.aspx?id=FL014930
- LSA Enforcement Rules, full text, MOL law database (app seed for Art. 20-1; read 2026-10-14): https://laws.mol.gov.tw/FLAW/FLAWDAT0201.aspx?id=FL014931

- Taiwan MOL, rate history: https://www.mol.gov.tw/1607/28162/28166/28180/70460/76761/
- Taiwan MOL, 2027 decision (2026-09-24): https://www.mol.gov.tw/1607/1632/1633/99195/post
- Labor Standards Act Art. 24 / 39 / 40: https://law.moj.gov.tw/LawClass/LawSingle.aspx?pcode=N0030001&flno=24 (flno=39, flno=40)
- LSA Enforcement Rules Art. 20-1, overtime includes hours over 40 a week (read 2026-10-14): https://law.moj.gov.tw/LawClass/LawSingle.aspx?pcode=N0030002&flno=20-1
- LSA Art. 30, normal hours 8 a day and 40 a week (background, read 2026-10-14): https://law.moj.gov.tw/LawClass/LawSingle.aspx?pcode=N0030001&flno=30
- MOL, hourly workers: https://www.mol.gov.tw/1607/28162/28166/28180/28182/28188/29022/
- MOL, holiday pay: https://www.mol.gov.tw/1607/28162/28166/28180/81521/81533/
- MOL, National Day 2026 on a Saturday, worked example (2026-10-07): https://www.mol.gov.tw/1607/1632/1633/99440/post
- 紀念日及節日實施條例: https://law.moj.gov.tw/LawClass/LawAll.aspx?pcode=D0020095 (the app quotes it from the DGPA calendar page of the shift year)
- DGPA government office calendar 2026 (115年, published 2025-06-13; read 2026-10-14): https://www.dgpa.gov.tw/information?uid=30&pid=12573
- DGPA government office calendar 2027 (116年, published 2026-05-21; read 2026-10-14): https://www.dgpa.gov.tw/information?uid=30&pid=12982
- NYS DOL minimum wage: https://dol.ny.gov/minimum-wage-0
- NYS DOL fact sheet P700 (12/25): https://dol.ny.gov/system/files/documents/2025/12/p700_12-25.pdf
- NYS Hospitality Industry Wage Order, 12 NYCRR 146, CR 146 (09/24), tip credit rates effective 2024-01-01, 2025-01-01, 2026-01-01; overtime and spread of hours (read 2026-10-14): https://forms.labor.ny.gov/WP/CR146.pdf (linked from https://dol.ny.gov/wage-orders)
- NYS Miscellaneous Industries Wage Order, 12 NYCRR 142, as amended effective 2020-06-24, spread of hours (read 2026-10-14): https://forms.labor.ny.gov/WP/CR142.pdf

## NVIDIA models on Nebius Token Factory

All inference runs on Nebius Token Factory (OpenAI-compatible, `https://api.tokenfactory.nebius.com/v1/`).

| Tier | Model ID (catalog, 2026-10-13) | Used for | USD per 1M tokens in / out |
|---|---|---|---|
| Nano | `nvidia/NVIDIA-Nemotron-3-Nano-30B-A3B` | schedule parsing (JSON) | 0.06 / 0.24 |
| Super | `nvidia/nemotron-3-super-120b-a12b` | rule-finding agent (tool calls) | 0.30 / 0.90 |
| Ultra | `nvidia/Nemotron-3-Ultra-550b-a55b` | explanation and employer message | 1.00 / 3.00 |

Override with `NEMOTRON_NANO_MODEL`, `NEMOTRON_SUPER_MODEL`, `NEMOTRON_ULTRA_MODEL`. Each report shows the models used and the estimated cost.

## Results: Fair Shift vs the same model alone

`npm run eval` runs every synthetic case through Fair Shift and through the pure-model baseline: the same Nemotron 3 Super, given today's date and the same schedule and payslip text, one prompt, no tools, no retrieval, no code math. Cited URLs from the baseline are fetched and checked for the minimum wage it used. Results go to `eval/results/<mode>-<time>.json` and `.md`.

Latest run: **scripted model + live Tavily retrieval** (2026-10-14, `eval/results/tavily-mockmodel-*.md`): 13/13 exact, all rule values read from pages retrieved during the run; 100 of 104 rule records went through the agent tools, the other 4 (the NY tip credit rows, which sit in a 10,000-character section of the wage order) filled by code from the same retrieved text. About 3 Tavily credits for all 13 cases with nothing cached. The baseline column fills in on the first live run with `NEBIUS_API_KEY`.

| 13 synthetic cases | Fair Shift (agent + Tavily + code math) | Same Nemotron model alone (no tools) |
|---|---|---|
| Expected pay exactly right | 13/13 | pending (needs API keys) |
| Underpaid amount exactly right | 13/13 | pending (needs API keys) |
| Used the minimum wage in force on the shift dates | 13/13 | pending (needs API keys) |
| Cited sources that contain the number used | 114 quotes, all checked verbatim | pending (needs API keys) |
| Average model cost per check | n/a (demo mode) | pending (needs API keys) |

Cases (all synthetic, hand-computed in `eval/cases.ts`): National Day worked at straight time; old 2025 rate in 2026; rest day; clean Taiwan; January 2027 at the pending NT$205; **weekly 40 hours**; **Mid-Autumn 2026**; **Lunar New Year 2027** (including a government-only substitute day that is not a holiday); NYC weekly overtime; upstate old rate; **NYC tipped overtime**; **restaurant spread of hours**; clean New York.

## Run it

Node 20.9 or newer.

```bash
npm install
npm test             # 96 unit and pipeline tests, never touch the network
npm run eval         # Fair Shift vs pure-model baseline (baseline needs keys)
npm run feasibility  # day-one go / no-go checks (needs keys)
npm run probe:sources  # Tavily only: find, extract and verify every official source
npm run dev          # http://localhost:3000
```

Keys come only from the environment: `NEBIUS_API_KEY` and `TAVILY_API_KEY`. On Windows set them as user environment variables and open a new terminal. With either key missing the app runs in **demo mode**: a scripted agent drives the same tools and checks over text recorded from the official pages (`fixtures/official-pages.json`), and the page says so. `APP_FORCE_MOCK=1` forces demo mode. `APP_LIVE_SEARCH=1` with only `TAVILY_API_KEY` keeps the scripted model but retrieves the official pages live with Tavily (used to test retrieval before model credits exist). `npm run eval` and `probe:sources` cache Tavily results in `.cache/tavily` (gitignored); `TAVILY_CACHE_DIR=` (empty) turns that off. All settings are in `.env.example`.

## Public demo caps

| Setting | Default |
|---|---|
| Checks per visitor | 6 per hour, 20 per day |
| Checks per day, all visitors | 300 |
| Model spend per day | US$2 |
| Tavily credits per day | 300 |
| Model spend per check | US$0.05 (agent stops when reached) |
| Agent steps per check | 24 |
| Tavily calls per check | 12 (extracts cached 6 hours) |

Counters are in memory per server instance, so the real ceiling is caps x warm instances. Fine for a hackathon demo.

## Day-one feasibility test (run as soon as the keys exist, about 2 hours)

`npm run feasibility` automates the checks from the topic review:

1. Tavily search on `mol.gov.tw` finds the 2027 hourly rate (205).
2. Tavily extract of the MOL rate history page contains `每小時最低工資為196元`.
3. Tavily extract of Labor Standards Act Art. 24 from `law.moj.gov.tw` contains `三分之一`.
4. Tavily search on `dol.ny.gov` finds `$17.00` for New York City.
5. Nemotron Nano parses at least 4 of 5 synthetic Chinese schedules exactly.

Then by hand (about 1 hour): `npm run eval` for the live system vs baseline numbers, and one check of each sample in the UI, watching how many rules the Super agent records itself versus code fallback. Also check that Tavily extract of `https://forms.labor.ny.gov/WP/CR146.pdf` returns the tip credit rows (it is a 40-page PDF). Expected cost: about 6 to 40 Tavily credits and under US$0.50 of Nemotron.

**Tavily half, done 2026-10-14** (`npm run probe:sources`, `eval/results/sources-*.md`): MOL rate history (196) and the 2027 decision (205, pending) extract with the numbers verbatim and pass the verifier; NYS DOL page, P700 and both wage order PDFs (CR146 tip credit rows, tipped overtime, spread of hours; CR142) all pass. law.moj.gov.tw fails (page frame only), so the Labor Standards Act and Enforcement Rules now come from laws.mol.gov.tw (all 7 Taiwan multipliers and the 40-hour week pass) and the holiday act from the DGPA calendar pages (all fixed-date holidays plus Mid-Autumn 2026 and Lunar New Year 2027 pass). laws.mol.gov.tw sometimes times out on basic extract, so a failed extract is retried once with advanced extract. The DGPA calendar dates themselves are in xlsx/pdf attachments that Tavily could not fetch; they stay a table in code.

Go / no-go: if Tavily cannot retrieve the MOL rate pages, or Nano gets fewer than half the schedules right, fall back to the backup topic.

## Project layout

```
lib/llm, lib/search, lib/agent   domain-independent core (providers, citations, agent loop, caps)
lib/wage                         Fair Shift: catalog, verification, parsing, computation, agent, report
lib/wage/holidays-tw.ts          official 2026-2027 lunar holiday dates (DGPA calendars)
eval/                            synthetic cases, baseline, comparison tables, eval and feasibility runners
fixtures/official-pages.json     recorded official text for demo mode
app/                             Next.js UI and API (/api/check streams the agent's steps)
```

## License

MIT, see `LICENSE`.
