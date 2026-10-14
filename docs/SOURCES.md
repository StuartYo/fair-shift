# Fair Shift: sources and retrieval details

Moved out of the README to keep it short. Everything here is unchanged from the README of 2026-10-14 except the headings.

## Freshness check (Tavily search)

The seed pages are a snapshot, so each check also runs one Tavily search, restricted to official domains, and code decides what the results change:

- A rate for a future year whose approval may be under way (Taiwan 2027): the search looks for the Executive Yuan's news release, code fetches it, and if the sentence with the rate and year and the release date can both be quoted word for word, the rate's status becomes "announced by the Executive Yuan on 2026-10-01; formal notice pending", with those two quotes. Before 2026-10-01 or without the release, it stays "decided, awaiting approval".
- Shift dates after the newest year the seeds cover (2027 for both places): result pages that talk about that year's minimum wage are handed to the agent as extra pages to read.
- Otherwise the page says the search found no newer notice than the pages used.

The result page lists the query, the top results and the outcome, and every quote is labelled "Read live with Tavily extract" (a seed page), "Found by Tavily search, read with Tavily extract", or "Tavily search result".

Models are tried in order Nano, Super, Ultra on failure (for example a renamed model); out-of-credit (HTTP 402) stops the run at once.

## Taiwan lunar-calendar holidays

The act states these by lunar day, so the solar date is a table in `lib/wage/holidays-tw.ts`, copied from the official government office calendars of the Directorate-General of Personnel Administration (行政院人事行政總處) and pinned by a test:

| Year | 除夕前一日 to 春節 (5 days) | 清明節 | 端午節 | 中秋節 |
|---|---|---|---|---|
| 2026 | 02-15 to 02-19 | 04-05 | 06-19 | 09-25 |
| 2027 | 02-04 to 02-08 | 04-05 | 06-09 | 09-15 |

Only statutory holiday dates are listed. The bridge and substitute days in the DGPA calendar (for example 2027-02-09 and 02-10) apply to government offices; the same DGPA page says private employers follow the Labor Standards Act and agree days off with their workers. The legal basis (which lunar day, and that it is a day off) is still quoted from the act retrieved during the run.

## Official sources (seed list)

Read on 2026-10-13 unless marked. Every seed was retrieved with Tavily extract and checked by the verifier (`npm run probe:sources`, results in `eval/results/sources-*.md`). Tavily gets only the page frame from law.moj.gov.tw, so the agent reads the Labor Standards Act and its Enforcement Rules one article at a time from the Ministry of Labor's own law database (laws.mol.gov.tw, about 1,000 characters per page, which the model can quote from without paging through the whole act), and the holiday act from the DGPA calendar pages, which quote Art. 3 to 9 verbatim. The law.moj.gov.tw links below are for people.

- LSA Art. 24, 39, 40, MOL law database (agent seeds, read 2026-10-14): https://laws.mol.gov.tw/FLAW/FLAWDOC01.aspx?id=FL014930&flno=24 (flno=39, flno=40)
- LSA Enforcement Rules Art. 20-1, MOL law database (agent seed, read 2026-10-14): https://laws.mol.gov.tw/FLAW/FLAWDOC01.aspx?id=FL014931&flno=20-1
- Taiwan MOL, rate history: https://www.mol.gov.tw/1607/28162/28166/28180/70460/76761/ (the 2025 and 2026 rates as text)
- Taiwan MOL, 基本工資之制訂與調整經過 (PDF, every basic wage adjustment up to the 2024 rate; added to the task only for shift dates before 2025): https://www.mol.gov.tw/media/idxna0og/%E5%9F%BA%E6%9C%AC%E5%B7%A5%E8%B3%87%E4%B9%8B%E5%88%B6%E8%A8%82%E8%88%87%E8%AA%BF%E6%95%B4%E7%B6%93%E9%81%8E.pdf?mediaDL=true
- Taiwan MOL, 2027 decision (2026-09-24): https://www.mol.gov.tw/1607/1632/1633/99195/post
- Executive Yuan news release, 2026-10-01, cabinet heard the minimum wage report (found by the app's Tavily search; read 2026-10-14): https://www.ey.gov.tw/Page/9277F759E41CCD91/59848ab4-676b-41b7-898e-9f5207325f0a
- MOL Q&A on national holidays (holiday hours beyond 8 are overtime under Art. 24), read 2026-10-14: https://www.mol.gov.tw/1607/28690/2282/2284/2292/7239
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
- NYS DOL, History of the Minimum Wage in New York State (rates by region from 2016; added only for dates before 2026): https://dol.ny.gov/history-minimum-wage-new-york-state
- NYS DOL minimum wage: https://dol.ny.gov/minimum-wage-0 ; fact sheet P700 (12/25): https://dol.ny.gov/system/files/documents/2025/12/p700_12-25.pdf
- NYS Hospitality Industry Wage Order, 12 NYCRR 146, CR 146 (09/24): https://forms.labor.ny.gov/WP/CR146.pdf ; Miscellaneous Industries Wage Order, 12 NYCRR 142: https://forms.labor.ny.gov/WP/CR142.pdf (both linked from https://dol.ny.gov/wage-orders, read 2026-10-14)
- NYS DOL, unpaid wages and the LS223 complaint form (claims for wages from the last three years; help line 888-525-2267), read 2026-10-14: https://dol.ny.gov/unpaidwithheld-wages-and-wage-supplements

## Day-one feasibility test

`npm run feasibility` automates the checks from the topic review: Tavily finds the 2027 hourly rate on `mol.gov.tw`, extracts `每小時最低工資為196元` from the rate history page, finds `$17.00` for New York City on `dol.ny.gov`, and Nemotron Nano parses at least 4 of 5 synthetic Chinese schedules exactly. Tavily retrieval of every seed was checked on 2026-10-14 (`eval/results/sources-*.md`): law.moj.gov.tw returns only the page frame, so the laws come from laws.mol.gov.tw and the holiday act from the DGPA calendar pages. laws.mol.gov.tw sometimes times out on basic extract, so a failed extract is retried once with advanced extract. The DGPA calendar dates are in xlsx/pdf attachments that Tavily could not fetch; they stay a table in code.

## Holidays added in 2025

Teachers' Day (9/28), Retrocession Day (10/25) and Constitution Day (12/25) became national days off with the amendment of 紀念日及節日實施條例 passed 2025-05-09 and promulgated 2025-05-28 (in force 2025-05-30). The agent's holiday records come from the act as it stands now, so code treats those dates as normal days before 2025-05-30 (`lib/wage/holidays-tw.ts`).
