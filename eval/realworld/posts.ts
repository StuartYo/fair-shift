import type { PostCase } from "./types";

// Messy real-world text, for parsing robustness only (no amounts are scored).
// Source: public PTT posts, Salary board (workers asking about pay, 2014-2025)
// and part-time board (employers' job ads with dates and hours, October 2026).
// Text is minimally paraphrased: user names, shop and company names, addresses,
// contact details, signatures and image links are removed; the wording and the
// way times are written are kept. Source URLs are only in the gitignored file
// eval/realworld/_sources_private.md, never in the repo.
//
// Expected shifts were labelled by hand before Fair Shift ran on these texts.
// "ask" means no shift can be read without guessing a date or a time; the right
// behavior is to say so (no shift, or a low-confidence reading with the problem
// named), not to invent one. Hours-only entries (no clock times in the text)
// match a shift on that date with the same hours.
//
// Posts rarely state an hourly rate; the rate box is filled so the run gets past
// the rate check and the parse can be seen. It does not affect parsing.

export const POST_CASES: PostCase[] = [
  // ---- Salary board: workers' questions ----
  {
    id: "post-q-saturday-holiday",
    kind: "question",
    board: "Salary",
    postYear: 2024,
    scheduleText:
      "時薪制，\n平日上班是禮拜一~禮拜五，每天6.5小時，時薪計算\n禮拜六上班3.5小時\n(前2小時加發時薪1/3的薪水，加班第3個小時，加發原本時薪2/3的薪水)\n明年兒童節4/4禮拜五，清明節4/5禮拜六，上班是用時薪*2下去給；\n還是用4/3補假跟4/4兩天用時薪*2下去給，4/5用原本禮拜六的給薪方式給\n平時國定假日是直接用時薪*2沒甚麼問題\n遇到補班的算法就不懂了",
    payslipText: "",
    hourlyRate: 200,
    expected: { outcome: "ask" },
    why: "A weekly pattern (6.5 hours on weekdays, 3.5 on Saturday) with no clock times, and holiday dates that are questions, not shifts.",
  },
  {
    id: "post-q-labor-day",
    kind: "question",
    board: "Salary",
    postYear: 2023,
    scheduleText:
      "幫朋友代問\n朋友5/1勞動節被公司要求上班，但他們公司7月底要出國旅遊4天\n公司說5/1勞動節的假會挪到公司旅遊的時間補休1天\n不過朋友6月底就要離職了，那這樣等於補休沒休到\n想問5/1號的薪水是不是要依照勞基法國定假日多一倍的薪資呢?\n因為公司5/1號上班的薪水是沒有多給，就是依照平日薪水這樣發",
    payslipText: "",
    hourlyRate: 200,
    expected: { outcome: "ask" },
    why: "5/1 was worked but no hours or times are given.",
  },
  {
    id: "post-q-seventh-day",
    kind: "question",
    board: "Salary",
    postYear: 2024,
    scheduleText: "我是時薪制的工作\n勞基法有規定連續上班第七天必須是強制休假\n但我是這樣\n（附兩張班表截圖）\n第七天有上班，但只有1.5小時\n請問這樣有違法嗎？",
    payslipText: "",
    hourlyRate: 200,
    expected: { outcome: "ask" },
    why: "The schedule was in screenshots; the text has only '1.5 hours on the seventh day' with no date.",
  },
  {
    id: "post-q-training-rate",
    kind: "question",
    board: "Salary",
    postYear: 2022,
    scheduleText:
      "這陣子想換個打工的工作 在網路上的人力銀行看到一間網咖在徵人\n後來去面試的時候跟我說什麼正式上班前要先上三天課 然後每天都八小時\n但因為是上課所以不會讓我操作太繁瑣複雜的東西\n於是說每小時只有100塊的時薪\n本來想說第一天去看看是不是真的沒做什麼 結果好像因為太忙 我完全做跟其他pt做一樣的事情\n甚至問了同事 他說他之前上課是一個禮拜都只領100的時薪 而近期改成三天這樣\n這是沒問題的嗎？",
    payslipText: "每小時只有100塊的時薪",
    hourlyRate: 100,
    expected: { outcome: "ask" },
    why: "Three 8-hour training days with no dates or times.",
  },
  {
    id: "post-q-tutor-holiday",
    kind: "question",
    board: "Salary",
    postYear: 2019,
    scheduleText:
      "幫妹妹代問\n大學生的她目前在補習班當數學助教 每日工時三小時 每周上六天班(一~六)\n4/4雇主把原先4/5, 4/6的課全集中在4/4日上完\n加上原先4/4日的工時 當天實際上班時間為9小時\n前幾日看到國定假日雙倍薪的消息 她想問PT工讀生適用嗎?\n若雇主不願給雙倍薪 要求員工\"自願移休\" 是不是就規避掉雙倍薪了?",
    payslipText: "",
    hourlyRate: 200,
    expected: { outcome: "shifts", shifts: [{ md: "04-04", hours: 9 }] },
    why: "One dated day with a stated length: 4/4, 9 hours. No clock times; the 3-hour weekday pattern has no dates.",
  },
  {
    id: "post-q-three-holidays",
    kind: "question",
    board: "Salary",
    postYear: 2017,
    scheduleText:
      "我是時薪排班的員工\n上週問了帶工讀生的人說：請問國定假日10/4.9.10有沒有薪資加給?\n對方跟我說：\n依ㄧ例ㄧ休，協議休息日與例假日\n所以沒有加給，但是再幫我問公司。\n請問她的說法依一例一休，協議休息日與例假日，是合理的嗎？\n我應該就領平日時薪，還是可以再爭取看看?",
    payslipText: "",
    hourlyRate: 200,
    expected: { outcome: "ask" },
    why: "Holiday dates written as 10/4.9.10 with no hours.",
  },
  {
    id: "post-q-store-pt-dates",
    kind: "question",
    board: "Salary",
    postYear: 2021,
    scheduleText:
      "小弟我在某賣場當PT\n4/3,4/4國定有休，我們是採彈性排班\n上個月我4/2,4/5,4/30皆有上班\n請問這3天是不是有雙倍薪資？\n上網查有些說公司會幫我另外補假\n但我是時薪應該不適用？\n休假日有超過1例一休8天",
    payslipText: "",
    hourlyRate: 200,
    expected: { outcome: "ask" },
    why: "Three dates worked (4/2, 4/5, 4/30) without hours or times.",
  },
  {
    id: "post-q-mid-autumn-shift",
    kind: "question",
    board: "Salary",
    postYear: 2022,
    scheduleText:
      "大家好，以下想請問排班制遇國定假日補休問題：\n若是每週固定休假日為週五週六，週日至週四為上班日，由於9月適逢中秋連假（9/10週六為中秋節），但公司以週一至週五班別及周日到週四班別休假日需一樣（9月為10天）而無補假，導致9月無連假，請問是否符合勞基法呢？\n實際狀況比較：\n1. 週一至週五班別，固定休六日，且9/10(六)中秋節於9/9(五)補假，9月共休假9天，含一個三天連假。\n2. 週日至週四班別，固定休五六，但9/10(六)中秋節並未安排補假，9月休假共9天，無三天連假，9/11(日)需出勤。\n備註：非變形工時，每天工作時數八小時，每週五天",
    payslipText: "",
    hourlyRate: 200,
    expected: { outcome: "ask" },
    why: "8 hours a day, 5 days a week, with no clock times; 9/11 'must work' has no hours.",
  },
  {
    id: "post-q-new-year-day",
    kind: "question",
    board: "Salary",
    postYear: 2017,
    scheduleText:
      "目前剛在台南找到一份打工的工作，雖然是打工，但是基本上公司是說大概月休8天，而且只能休平日(因為是服務業)，但是我跟雇主詢問元旦那天有沒有依照勞基法給付加倍的薪資時，雇主是說我這個算是正職班但是採用計時制，所以元旦那天上班是沒有加給的，想請益這樣公司是對的嗎？",
    payslipText: "",
    hourlyRate: 200,
    expected: { outcome: "ask" },
    why: "New Year's Day worked, no hours.",
  },
  {
    id: "post-q-late-rounding",
    kind: "question",
    board: "Salary",
    postYear: 2019,
    scheduleText:
      "原本公司對工讀生遲到並沒有特別規範，彈性上下班。\n例如：\n遲到1至10分鐘內，就延後1至10分鐘下班，超過10分鐘以下個半點計薪。\n以工讀生一天上4個小時的班為例：\n17：05到班至21：05下班\n算4小時(150*4=600)\n17：10到班，從17：30計薪至21：00整\n算3.5小時(150*3.5=525)\n但是！\n公司突然說要訂定規章，而規章內容為：\n工讀生遲到1分鐘，直接從下個半點計薪\n亦即\n17：01到班，薪水從17：30算\n像是21：18分是否也比照上班規定以下個整點計薪，公司卻說不算，必須打整點的卡。\n亦即21：18打卡下班還是算到21：00而已\n最後補充\n17：00-21：00工作4小時，原本內含用餐時間40分鐘是計薪的。",
    payslipText: "150*4=600",
    hourlyRate: 150,
    expected: { outcome: "ask" },
    why: "Several example times (17:05-21:05, 17:10, 17:00-21:00) with no dates; they illustrate a rule, they are not shifts.",
  },
  {
    id: "post-q-split-shift-cut",
    kind: "question",
    board: "Salary",
    postYear: 2018,
    scheduleText:
      "最近我在某連鎖餐廳打工\n排班表示一個月出一次\n假如說我今天排班是9點到4點\n6點到10點的兩頭班\n但是因為生意不太好\n或是人手不需要那麼多之類的原因\n從9點上班到12點就要我打卡下班\n請問像這種\n因為某些因素沒有照預定的排班表走而提早下班\n有違反規定嗎",
    payslipText: "",
    hourlyRate: 200,
    expected: { outcome: "ask" },
    why: "A hypothetical day ('假如說我今天') with times written without AM/PM (9點到4點, 6點到10點); no real date.",
  },
  {
    id: "post-q-drink-shop-hours",
    kind: "question",
    board: "Salary",
    postYear: 2014,
    scheduleText:
      "我妹最近找到一份飲料店的早班計時\n我就問問她待遇如何?\n她跟我說月休只有四天，還只能休一天假日\n時間是1000~1800\n這工時根本和正職沒甚麼差別了吧?\n薪水算一算也大約就只接近24K\n我再問她那國定假日上班薪水有雙倍嗎? 如果外送有沒有補貼油錢?\n她都說忘記問了",
    payslipText: "薪水算一算也大約就只接近24K",
    hourlyRate: 200,
    expected: { outcome: "ask" },
    why: "Daily hours 1000~1800 with no dates.",
  },
  {
    id: "post-q-rest-day-break",
    kind: "question",
    board: "Salary",
    postYear: 2016,
    scheduleText:
      "關於休息日加班的加班費算法已經有概念\n但不確定的是，休息日一樣規定連續四小時工作需半小時休息嗎？\n若我8:30上班到13:00下班，\n我只能報4小時or報4.5(且進位至8)小時呢？\n因為就我所知，舊制都會扣掉休息時間，例如打卡連續上班11小時，報加班11小時，公司會自動幫我扣掉1小時",
    payslipText: "",
    hourlyRate: 200,
    expected: { outcome: "ask" },
    why: "8:30 to 13:00 on an unnamed rest day; no date.",
  },
  {
    id: "post-q-one-hour-days",
    kind: "question",
    board: "Salary",
    postYear: 2021,
    scheduleText: "如果是計時工且上班場所的每日工作時數較彈性\n是否可以星期一～星期五 排上班1小時\n星期六排上班8小時來賺取加班費？\n是否有瑕疵？",
    payslipText: "",
    hourlyRate: 200,
    expected: { outcome: "ask" },
    why: "A hypothetical weekly pattern with no dates or times.",
  },
  {
    id: "post-q-saturday-math",
    kind: "question",
    board: "Salary",
    postYear: 2016,
    scheduleText:
      "一例一休通過了 想知道就是週六上班的加班費如何算\n假設時薪＄150 一天工作8小時 週六上班的薪水是多少？\n目前小弟公司的算法是：150*8*1.66＝＄1992\n新制：150*2*2.33 + 150*6*2.66＝＄3093？\n是這樣嗎？有請高手賜教 謝謝～",
    payslipText: "時薪＄150",
    hourlyRate: 150,
    expected: { outcome: "ask" },
    why: "A hypothetical Saturday of 8 hours, no date or times.",
  },
  // ---- part-time board: job ads with dates and hours ----
  {
    id: "post-ad-expo-two-days",
    kind: "job_ad",
    board: "part-time",
    postYear: 2026,
    scheduleText:
      "工作或交件期：11/06（五）、11/09（一）\n預定排班方式：全天8小時\n每日工作時間：10:00~18:00\n每日休息時間︰工作滿4小時休息30分鐘\n休息計薪供餐：皆有\n國定假日：依法加倍\n延長工時：依法加成\n工作內容︰派發活動DM及介紹並銷售商品",
    payslipText: "",
    hourlyRate: 196,
    expected: {
      outcome: "shifts",
      shifts: [
        { md: "11-06", start: "10:00", end: "18:00" },
        { md: "11-09", start: "10:00", end: "18:00" },
      ],
    },
    why: "Two dates on one line with the same daily time.",
  },
  {
    id: "post-ad-weekday-range",
    kind: "job_ad",
    board: "part-time",
    postYear: 2026,
    scheduleText:
      "工作或交件期：10/14-10/30(不六日)\n預定排班方式：期間皆能配合為佳\n每日工作時間：08:30-18:00\n每日休息時間︰工作滿4小時休息30分鐘\n休息計薪供餐：皆無\n工資或報酬：時薪200",
    payslipText: "時薪200",
    hourlyRate: 200,
    expected: {
      outcome: "shifts",
      shifts: ["10-14", "10-15", "10-16", "10-19", "10-20", "10-21", "10-22", "10-23", "10-26", "10-27", "10-28", "10-29", "10-30"].map((md) => ({
        md,
        start: "08:30",
        end: "18:00",
      })),
    },
    why: "A date range without weekends (不六日): the 13 weekdays from Wednesday 2026-10-14 to Friday 2026-10-30, each 08:30-18:00.",
  },
  {
    id: "post-ad-one-day-lunch",
    kind: "job_ad",
    board: "part-time",
    postYear: 2026,
    scheduleText: "工作或交件期：2026/10/17\n每日工作時間：08:00-17:00\n每日休息時間︰午休一小時\n工資或報酬：200時薪",
    payslipText: "200時薪",
    hourlyRate: 200,
    expected: { outcome: "shifts", shifts: [{ md: "10-17", start: "08:00", end: "17:00" }] },
    why: "One full date, one time range, lunch break on its own line.",
  },
  {
    id: "post-ad-two-day-range",
    kind: "job_ad",
    board: "part-time",
    postYear: 2026,
    scheduleText: "工作或交件期：10/17-10/18\n每日工作時間：09:00-18:00\n每日休息時間︰工作滿4小時休息60分鐘(中午休息)\n工資或報酬：新台幣14000元（勞務報酬）",
    payslipText: "",
    hourlyRate: 200,
    expected: {
      outcome: "shifts",
      shifts: [
        { md: "10-17", start: "09:00", end: "18:00" },
        { md: "10-18", start: "09:00", end: "18:00" },
      ],
    },
    why: "A two-day range with one daily time.",
  },
  {
    id: "post-ad-split-day",
    kind: "job_ad",
    board: "part-time",
    postYear: 2026,
    scheduleText: "工作或交件期：10/16 8:30-11:00   12:40-16:10 2300元/6hr 現領\n預定排班方式：就一天\n每日工作時間：如上述時間\n每日休息時間︰工作滿4小時休息30分鐘\n工資或報酬：6hr 2300元  現領  如果早做完早結束",
    payslipText: "6hr 2300元 現領",
    hourlyRate: 383,
    expected: {
      outcome: "shifts",
      shifts: [
        { md: "10-16", start: "08:30", end: "11:00" },
        { md: "10-16", start: "12:40", end: "16:10" },
      ],
    },
    why: "Two time ranges on one line for one date (6 hours in total, as the ad says).",
  },
  {
    id: "post-ad-afternoon-words",
    kind: "job_ad",
    board: "part-time",
    postYear: 2026,
    scheduleText: "工作或交件期：10/13 星期二\n每日工作時間：下午1點到晚上6點\n每日休息時間︰工作滿4小時休息30分鐘\n工資或報酬：時薪220元",
    payslipText: "時薪220元",
    hourlyRate: 220,
    expected: { outcome: "shifts", shifts: [{ md: "10-13", start: "13:00", end: "18:00" }] },
    why: "Date on one line, time in words on the next (下午1點到晚上6點).",
  },
  {
    id: "post-ad-fullwidth-colon",
    kind: "job_ad",
    board: "part-time",
    postYear: 2026,
    scheduleText: "工作或交件期：10/11（日）\n每日工作時間：下午2：00~4:00\n工資或報酬：一小時350X2小時=700元+車馬費100元=800元",
    payslipText: "一小時350X2小時=700元",
    hourlyRate: 350,
    expected: { outcome: "shifts", shifts: [{ md: "10-11", start: "14:00", end: "16:00" }] },
    why: "下午 applies to both ends; one full-width colon and one ASCII colon.",
  },
  {
    id: "post-ad-recurring-week",
    kind: "job_ad",
    board: "part-time",
    postYear: 2026,
    scheduleText:
      "工作或交件期：長期\n預定排班方式：一週上班五日。星期一、二、四、五下午4:00~9:00，\n星期三和星期六隔週輪班，\n（例，本週三上班休週六，下週三休息並上週六的班。若需調班，要和同事討論換班）\n星期日休息\n每日工作時間：週一～週五　下午４：００～９：００，週六下午１：００～８：００\n每日休息時間︰工作滿4小時休息30分鐘\n工資或報酬：200元/小時",
    payslipText: "200元/小時",
    hourlyRate: 200,
    expected: { outcome: "ask" },
    why: "A long-term weekly pattern with alternating weeks and no dates; full-width digits.",
  },
  {
    id: "post-ad-duration-only",
    kind: "job_ad",
    board: "part-time",
    postYear: 2026,
    scheduleText: "工作或交件期：10/15（四）\n預定排班方式：無\n每日工作時間：5小時\n每日休息時間︰工作滿4小時休息30分鐘\n休息計薪供餐：僅計薪\n工資或報酬：NTD300/H",
    payslipText: "NTD300/H",
    hourlyRate: 300,
    expected: { outcome: "shifts", shifts: [{ md: "10-15", hours: 5 }] },
    why: "A date and a length (5 hours) but no clock times.",
  },
];
