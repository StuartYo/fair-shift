# Fair Shift

Fair Shift checks an hourly worker's pay. Paste a schedule (a LINE message from your manager, your own notes, a timesheet) and the payslip. An agent built on NVIDIA Nemotron retrieves the current official minimum wage and the overtime, rest day, holiday, tip credit and spread-of-hours rules for where you work from government websites with Tavily. Code then computes what you should have been paid line by line, and every rule is shown with its exact quote, article number, link and effective date. The result page is in Traditional Chinese for Taiwan (with an English switch) and in English for New York. It ends with what to do next and a printable one-page report to hand to an employer.

Built for the Nebius x NVIDIA Global AI Hackathon (track: Best Apps and Agents; also Best Use of Tavily).

> Not legal advice. Every sample in this repo is synthetic (invented schedules and payslips, no real person or employer).

## Why an agent and not just a model

- Underpayment is common where students work. In the Ministry of Labor's 2025 (民國 114 年) inspection of businesses that often hire student and part-time workers, 465 of 1,852 broke labor law (25.11%). The most common violation was not paying double for work on a holiday (134 cases, 21% of violations). Source: Ministry of Labor news release of 2026-07-31, https://www.mol.gov.tw/1607/1632/1633/96453/ (read 2026-10-14). The ministry chose the businesses and put earlier violators first, so this is not a random sample.
- Rates change after a model is trained. Taiwan's 2027 hourly minimum wage (NT$205) was decided on 2026-09-24 and still awaits Executive Yuan approval. New York kept $17.00 / $16.00 for 2027. Fair Shift reads these from the Ministry of Labor and NYS DOL pages at run time.
- Tiered premiums are easy to get wrong. Taiwan rest day work is paid plus 1 1/3 for the first 2 hours and plus 1 2/3 after; holiday work is doubled up to 8 hours; hours over 40 in a week are overtime even when no single day goes over 8. New York tipped overtime is 1.5 times the *full* minimum wage minus the tip credit, not 1.5 times the cash wage. Code does this math, checked against the Ministry of Labor's own worked example (NT$150 x 2 x 4/3 + NT$150 x 6 x 5/3 = NT$1,900).
- Holidays move. Lunar New Year, Qingming, Dragon Boat and Mid-Autumn fall on different days every year. JavaScript's built-in Chinese calendar (ICU 78) puts lunar new year 2027 on 2027-02-07; the official government calendar has 2027-02-06. Fair Shift uses the official dates.
- Every number is traceable. A rule value is accepted only if its quote appears word for word in text retrieved during that run and code can read the same value (and date, region and job type) back out of the quote.

## How it works

| Step | Who | What |
|---|---|---|
| 1. Redact | code | Names (labeled or not), ID numbers, phones (mobile and landline), emails, account and card numbers, tax IDs, shop names and @handles are removed before any API call. |
| 2. Parse | Nemotron 3 Nano + code | The model turns messy text (`週五 18-22`, `下午5點到10點`, `休1小時`, full-width digits, overnight shifts) into shifts; a rule-based parser reads the same text independently. If they disagree, the page says the schedule was read with low confidence. Lines that look like a shift but have no date the parser can place are listed. If no shift can be read, the page says so and shows no amount. |
| 3. Find rules | Nemotron 3 Super with tools | `fetch_pages` (Tavily extract, official domains only, one call for every seed page), then `record_rules` and `record_holidays` with values and exact quotes. Each entry is checked by code; a rejected entry comes back with the reason (for example "the quote states 2 rates; shorten it to the clause for this rule only" or "this quote is on another page") and the model fixes it. `search_official` is there if a page has no usable text. |
| 4. Fill gaps | code | If the agent stops before recording a rule, code reads it from the text already retrieved, through the same checks. Every report and the eval count how many records came from the agent and how many from this fallback. |
| 5. Compute | code | Expected pay per shift and segment, minimum wage top-up, premiums, tip credit, spread of hours, shortfall. |
| 6. Explain | Nemotron 3 Ultra + code | Ultra writes the plain-language explanation in English and Traditional Chinese from a list of facts. It is rejected if it uses any number not in the calculation, and the Chinese is rejected if it contains simplified characters; a code template is used instead. The message to the employer is a code template, so it always cites the article numbers. |

Models are tried in order Nano, Super, Ultra on failure (for example a renamed model); out-of-credit (HTTP 402) stops the run at once.

### What the result page shows

- The headline amount, and right under it what the number depends on: the rest day and regular day off (the form asks for them, and "not fixed / not sure" is one of the answers), a minimum wage that is decided but not yet approved, and a low-confidence schedule read.
- Why, in specific terms: "10/10（國慶日）出勤 6 小時：國定假日出勤，工資應加倍發給，這部分加給 NT$1,176（勞動基準法第 39 條）". Multipliers are written as words (加給三分之一, 加倍).
- Only the rules that changed this result. Other rules retrieved are folded away; an older rate is marked "no longer in force" with the rate that replaced it.
- What to do next. Taiwan: keep evidence and ask for your attendance record (LSA Art. 30 para. 6), the 1955 hotline, the city or county labor bureau for a complaint or mediation, protection from retaliation (LSA Art. 74), and the 5-year limit the Ministry of Labor applies to wage claims (Civil Code Art. 126). New York: NYS DOL complaint form LS223 (wages from the last three years) and the help line. Each item links to the official page it comes from.
- A printable one-page report (print or save as PDF) and a polite message to the employer that cites the articles and attaches that report.
- What the tool does not check.

### Coverage

| Jurisdiction | Rules |
|---|---|
| Taiwan | Hourly minimum wage by date (incl. pending rates); overtime beyond 8 hours a day or 40 hours a week (LSA Art. 24, Enforcement Rules Art. 20-1); rest day work (Art. 24 para. 2); national holiday work (Art. 39); work on the regular day off (Art. 40, flagged); fixed-date national holidays and lunar-calendar holidays for 2026 and 2027 (紀念日及節日實施條例 Art. 4 to 6). A holiday that falls on your rest day is paid as rest day work and flagged for a substitute day off (MOL, 2026-10-07). |
| New York State | Minimum wage by region and date (NYC, Long Island and Westchester, rest of state); overtime over 40 hours per workweek at 1.5x; tip credit and tipped overtime for food service workers and service employees (12 NYCRR 146-1.3, 146-1.4), including the make-up when tips plus cash wage fall below the minimum wage; spread of hours over 10 (146-1.6 for restaurants and hotels, any pay rate; 142-2.4 for other industries, only the part not already covered by pay above the minimum wage). |

Not checked: Taiwan flexible schedules (變形工時), pay for a holiday you were scheduled for but told not to work, the monthly overtime cap, which day an employer gives as a substitute holiday, lunar holidays outside 2026-2027 (mark them yourself with `國定假日`), monthly-paid and Art. 84-1 jobs, indigenous ritual days; New York call-in pay, split-shift pay outside spread of hours, uniform and meal allowances, the tip threshold for service employees, fast food and home care rates.

#### Taiwan lunar-calendar holidays

The act states these by lunar day, so the solar date is a table in `lib/wage/holidays-tw.ts`, copied from the official government office calendars of the Directorate-General of Personnel Administration (行政院人事行政總處) and pinned by a test:

| Year | 除夕前一日 to 春節 (5 days) | 清明節 | 端午節 | 中秋節 |
|---|---|---|---|---|
| 2026 | 02-15 to 02-19 | 04-05 | 06-19 | 09-25 |
| 2027 | 02-04 to 02-08 | 04-05 | 06-09 | 09-15 |

Only statutory holiday dates are listed. The bridge and substitute days in the DGPA calendar (for example 2027-02-09 and 02-10) apply to government offices; the same DGPA page says private employers follow the Labor Standards Act and agree days off with their workers. The legal basis (which lunar day, and that it is a day off) is still quoted from the act retrieved during the run.

### Official sources (seed list)

Read on 2026-10-13 unless marked. Every seed was retrieved with Tavily extract and checked by the verifier (`npm run probe:sources`, results in `eval/results/sources-*.md`). Tavily gets only the page frame from law.moj.gov.tw, so the agent reads the Labor Standards Act and its Enforcement Rules one article at a time from the Ministry of Labor's own law database (laws.mol.gov.tw, about 1,000 characters per page, which the model can quote from without paging through the whole act), and the holiday act from the DGPA calendar pages, which quote Art. 3 to 9 verbatim. The law.moj.gov.tw links below are for people.

- LSA Art. 24, 39, 40, MOL law database (agent seeds, read 2026-10-14): https://laws.mol.gov.tw/FLAW/FLAWDOC01.aspx?id=FL014930&flno=24 (flno=39, flno=40)
- LSA Enforcement Rules Art. 20-1, MOL law database (agent seed, read 2026-10-14): https://laws.mol.gov.tw/FLAW/FLAWDOC01.aspx?id=FL014931&flno=20-1
- Taiwan MOL, rate history: https://www.mol.gov.tw/1607/28162/28166/28180/70460/76761/
- Taiwan MOL, 2027 decision (2026-09-24): https://www.mol.gov.tw/1607/1632/1633/99195/post
- Labor Standards Act Art. 24 / 39 / 40: https://law.moj.gov.tw/LawClass/LawSingle.aspx?pcode=N0030001&flno=24 (flno=39, flno=40)
- LSA Enforcement Rules Art. 20-1 (read 2026-10-14): https://law.moj.gov.tw/LawClass/LawSingle.aspx?pcode=N0030002&flno=20-1
- LSA Art. 30 (attendance records) and Art. 74 (complaints, no retaliation), read 2026-10-14: https://law.moj.gov.tw/LawClass/LawSingle.aspx?pcode=N0030001&flno=30, https://law.moj.gov.tw/LawClass/LawSingle.aspx?pcode=N0030001&flno=74
- Civil Code Art. 126 (5-year limit on periodic payments, applied to wages by MOL interpretations), read 2026-10-14: https://law.moj.gov.tw/LawClass/LawSingle.aspx?pcode=B0000001&flno=126
- MOL, 1955 labor hotline: https://mol.gov.tw/service/32300/32320 ; what to do in a labor dispute (complaint, mediation at the local labor bureau): https://www.mol.gov.tw/1607/28690/89680/nodelist (both read 2026-10-14)
- MOL, hourly workers: https://www.mol.gov.tw/1607/28162/28166/28180/28182/28188/29022/
- MOL, National Day 2026 on a Saturday, worked example (2026-10-07): https://www.mol.gov.tw/1607/1632/1633/99440/post
- MOL, 2025 inspection of businesses hiring student and part-time workers (2026-07-31, read 2026-10-14): https://www.mol.gov.tw/1607/1632/1633/96453/
- 紀念日及節日實施條例: https://law.moj.gov.tw/LawClass/LawAll.aspx?pcode=D0020095 (the app quotes it from the DGPA calendar page of the shift year)
- DGPA government office calendar 2026 (115年): https://www.dgpa.gov.tw/information?uid=30&pid=12573 ; 2027 (116年): https://www.dgpa.gov.tw/information?uid=30&pid=12982 (read 2026-10-14)
- NYS DOL minimum wage: https://dol.ny.gov/minimum-wage-0 ; fact sheet P700 (12/25): https://dol.ny.gov/system/files/documents/2025/12/p700_12-25.pdf
- NYS Hospitality Industry Wage Order, 12 NYCRR 146, CR 146 (09/24): https://forms.labor.ny.gov/WP/CR146.pdf ; Miscellaneous Industries Wage Order, 12 NYCRR 142: https://forms.labor.ny.gov/WP/CR142.pdf (both linked from https://dol.ny.gov/wage-orders, read 2026-10-14)
- NYS DOL, unpaid wages and the LS223 complaint form (claims for wages from the last three years; help line 888-525-2267), read 2026-10-14: https://dol.ny.gov/unpaidwithheld-wages-and-wage-supplements

## NVIDIA models on Nebius Token Factory

All inference runs on Nebius Token Factory (OpenAI-compatible, `https://api.tokenfactory.nebius.com/v1/`).

| Tier | Model ID (catalog, 2026-10-13) | Used for | USD per 1M tokens in / out |
|---|---|---|---|
| Nano | `nvidia/NVIDIA-Nemotron-3-Nano-30B-A3B` | schedule parsing (JSON, reasoning on, up to 4,000 output tokens) | 0.06 / 0.24 |
| Super | `nvidia/nemotron-3-super-120b-a12b` | rule-finding agent (tool calls, reasoning on, up to 4,000 output tokens per turn, temperature 0) | 0.30 / 0.90 |
| Ultra | `nvidia/Nemotron-3-Ultra-550b-a55b` | plain-language explanation (JSON, `enable_thinking: false`) | 1.00 / 3.00 |

Override with `NEMOTRON_NANO_MODEL`, `NEMOTRON_SUPER_MODEL`, `NEMOTRON_ULTRA_MODEL`. Each report shows the models used and the estimated cost.

## Results: Fair Shift vs the same agent without quote checks vs the same model alone

`npm run eval` runs every case three ways:

1. Fair Shift: the full pipeline.
2. Quote checks off: the same Super agent, the same Tavily tools and prompt, but `record_rules` takes whatever value the model proposes and code does not fill gaps. This isolates what checking the quotes adds.
3. Same model alone: Nemotron 3 Super with today's date and the same schedule and payslip text, one prompt, no tools, no retrieval, no code math. Cited URLs are fetched and checked for the minimum wage it used.

<!-- eval:start (generated by npm run readme from the newest eval/results/live-*.json; do not edit by hand) -->
Latest live run: `eval/results/live-2026-10-13T23-08-55-805Z.md` (2026-10-13, 24 cases). Agent models: nvidia/NVIDIA-Nemotron-3-Nano-30B-A3B, nvidia/nemotron-3-super-120b-a12b, nvidia/Nemotron-3-Ultra-550b-a55b. Baseline: nvidia/nemotron-3-super-120b-a12b.

| 24 synthetic cases | Fair Shift (agent + Tavily + quote checks + code math) | Same agent and tools, quote checks off | Same Nemotron model alone (no tools) |
|---|---|---|---|
| Expected pay exactly right | 24/24 | 22/24 | 5/24 |
| Underpaid amount exactly right | 24/24 | n/a | 7/24 |
| Used the minimum wage in force on the shift dates | 24/24 | n/a | 1/24 |
| Cited sources that contain the number used | 180 quotes, all checked verbatim | not checked | 0 of 54 (0%) |
| Average model cost per check | US$0.0252 | US$0.0182 | US$0.0028 |

- Rule and holiday records: 158 made by the agent through its tools, 5 filled by code fallback from the retrieved text (97% by the agent). In 21 of 24 cases the agent recorded everything itself.
- Fair Shift by group: main 13/13, messy formats 5/5, held-out 6/6.
<!-- eval:end -->

How to read this. With the quote checks off, the same agent still got 22 of 24 amounts right. Both misses were New York cases where the amount equals the stated rate times the hours, so the agent did not end up with the 2026 minimum wage for the shift dates. On these cases the checks change the final amount less than they change what can be shown: every number on the page comes with a quote that was found word for word on an official page. The pure model, given the same text and today's date, used the right minimum wage once in 24 cases.

Where code had to step in: in `ny-spread-of-hours` the agent used all 12 turns without recording a rule, and code read all three from the pages it had fetched; in two held-out Taiwan cases the agent hit the US$0.05 per-check spending cap one record short. The per-case table is in the result file.

The 24 cases (`eval/cases.ts`, `eval/heldout.ts`) are synthetic and the truth values were computed by hand by me from the official rule text. Each case's `why` field is the full arithmetic (hours, which rule, multiplier, rounding). Three groups:

- main (13): National Day worked at straight time; old 2025 rate in 2026; rest day; clean Taiwan; January 2027 at the pending NT$205; weekly 40 hours; Mid-Autumn 2026; Lunar New Year 2027 (including a government-only substitute day that is not a holiday); NYC weekly overtime; upstate old rate; NYC tipped overtime; restaurant spread of hours; clean New York.
- messy (5): a LINE message with weekdays only and `18-22` / `休1小時`; overnight shifts; times in words (`晚上6點到11點`); full-width digits; a texted English schedule.
- held-out (6): Dragon Boat 2027, Labor Day 2026, an 11-hour day, a holiday on the rest day, Long Island overtime, NYC tips below the minimum wage. Written and committed with their expected values (commit "Add held-out eval cases with frozen expected values") before Fair Shift was run on them, and not used while tuning prompts or parsers.

What this does not show: the cases were written by the same person who wrote the code, so they test the rules I know about. I did not find an official worked example that fits an hourly worker end to end (the Ministry's NT$1,900 example uses a monthly wage of NT$36,000, which the hourly minimum wage would raise), so that example is a unit test of the math only. No real worker has used the tool yet.

## Privacy

- Before any model or search call, the text goes through `lib/wage/redact.ts` (see step 1). It catches common patterns and can miss a name, so the page asks people to cover names too.
- What leaves the server: the redacted schedule and payslip text go to Nebius Token Factory for parsing; the rule agent sees only the shift dates and the rule list, never the pasted text; Tavily receives only official URLs and queries the agent writes from those; Ultra receives only computed numbers and the reasons.
- What is stored: nothing. The app has no database, writes no files, and does not log request bodies (`app/api/check/route.ts`, no `console` calls in `app/` or `lib/`). Rate-limit counters keep IP addresses in memory for up to a day per server instance. Retrieved official pages are cached in memory for 6 hours. The host (Vercel) keeps its standard request logs (time, path, IP), not the text.

## Run it

Node 20.9 or newer.

```bash
npm install
npm test             # 122 unit and pipeline tests, never touch the network
npm run eval         # Fair Shift vs quote checks off vs pure-model baseline (needs keys for the last two)
npm run readme       # rewrite the README results block from the newest live eval file
npm run feasibility  # day-one go / no-go checks (needs keys)
npm run probe:sources  # Tavily only: find, extract and verify every official source
npm run dev          # http://localhost:3000
```

Keys come only from the environment: `NEBIUS_API_KEY` and `TAVILY_API_KEY`. On Windows set them as user environment variables and open a new terminal. With either key missing the app runs in demo mode: a scripted agent drives the same tools and checks over text recorded from the official pages (`fixtures/official-pages.json`), and the page says so. `APP_FORCE_MOCK=1` forces demo mode. `APP_LIVE_SEARCH=1` with only `TAVILY_API_KEY` keeps the scripted model but retrieves the official pages live with Tavily. `npm run eval` and `probe:sources` cache Tavily results in `.cache/tavily` (gitignored); `TAVILY_CACHE_DIR=` (empty) turns that off. All settings are in `.env.example`.

## Public demo caps

| Setting | Default |
|---|---|
| Checks per visitor | 6 per hour, 20 per day |
| Checks per day, all visitors | 300 |
| Model spend per day | US$2 |
| Tavily credits per day | 300 |
| Model spend per check | US$0.05 (agent stops when reached) |
| Agent turns per check | 12 |
| Tavily calls per check | 12 (extracts cached 6 hours) |

Counters are in memory per server instance, so the real ceiling is caps x warm instances. That is enough for a hackathon demo.

## Day-one feasibility test

`npm run feasibility` automates the checks from the topic review: Tavily finds the 2027 hourly rate on `mol.gov.tw`, extracts `每小時最低工資為196元` from the rate history page, finds `$17.00` for New York City on `dol.ny.gov`, and Nemotron Nano parses at least 4 of 5 synthetic Chinese schedules exactly. Tavily retrieval of every seed was checked on 2026-10-14 (`eval/results/sources-*.md`): law.moj.gov.tw returns only the page frame, so the laws come from laws.mol.gov.tw and the holiday act from the DGPA calendar pages. laws.mol.gov.tw sometimes times out on basic extract, so a failed extract is retried once with advanced extract. The DGPA calendar dates are in xlsx/pdf attachments that Tavily could not fetch; they stay a table in code.

## Project layout

```
lib/llm, lib/search, lib/agent   domain-independent core (providers, citations, agent loop, caps)
lib/wage                         Fair Shift: catalog, verification, parsing, computation, agent, explanation, page text
lib/wage/holidays-tw.ts          official 2026-2027 lunar holiday dates (DGPA calendars)
eval/                            synthetic and held-out cases, baseline, tables, eval and feasibility runners
fixtures/official-pages.json     recorded official text for demo mode
app/                             Next.js UI and API (/api/check streams the agent's steps)
```

## License

MIT, see `LICENSE`.
