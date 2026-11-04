# How the valuation works (plain language, Joby as the example)

This explains every piece of the Valuation page so you can walk an interviewer through it without notes. Numbers quoted here are a **snapshot from Nov 4, 2026** (before Joby's Q3 2026 results). The app recalculates them live from SEC EDGAR and Yahoo Finance.

---

## 1. Why not just use a P/E or EV/Sales multiple?

Joby is **pre-revenue in its core business**. It reported $53M of revenue in FY2025 (flight services, including Blade charter flights acquired in Aug 2025, plus government and engineering work) against a $930M net loss ([FY2025 10-K](https://www.sec.gov/Archives/edgar/data/1819848/000181984826000160/joby-20251231.htm)). A P/E is meaningless with negative earnings, and EV/Sales on today's revenue says nothing about an air-taxi network that doesn't exist yet. So we value **what the business could earn after certification**, then adjust for **the cash it must burn to get there** and **how uncertain that is**.

> Interview line: *"For a pre-revenue company I can't multiply today's earnings, so I project the business at scale, subtract the cash it needs to get there, discount for time and risk, and then weight a few scenarios by probability."*

---

## 2. Cash runway (the first thing to check)

**Runway = cash & short-term investments ÷ quarterly cash burn.**

- **Cash & short-term investments:** $2.26B at June 30, 2026 ([Q2 2026 10-Q](https://www.sec.gov/Archives/edgar/data/1819848/000181984826000435/joby-20260630.htm)).
- **Quarterly burn = −(operating cash flow − capital expenditures)**, i.e. negative free cash flow. Q2 2026 burn was **$201.8M**.
- **Runway ≈ $2,264M ÷ $202M ≈ 11.2 quarters** (about 2.8 years).
- **Pro forma** for the ~$450M cash portion of the pending Resonant Sciences acquisition ([8-K, Aug 2026](https://www.sec.gov/Archives/edgar/data/1819848/000162828026055505/joby-20260808.htm)): ≈ $1,814M ÷ $202M ≈ **9.0 quarters**.

**One subtlety the app handles:** 10-Q cash-flow statements are *year-to-date*. The Q2 10-Q reports January–June, not April–June. To get the quarter alone, subtract the Q1 figure: Q2 = H1 − Q1, Q3 = 9M − H1, Q4 = full year − 9M. Values computed this way are marked with a small "d" in the tables.

**Caveats to mention:** runway assumes flat burn (Joby's burn has been rising) and no new financing (Joby has a $750M at-the-market stock program, [424B5](https://www.sec.gov/Archives/edgar/data/1819848/000162828026055507/atm424b5.htm)).

---

## 3. Dilution

Shares outstanding (from each filing's cover page) went from **603.9M (Aug 2021) to 989.1M (Aug 2026)**, up **64%**, or about **10% a year**. A holder who owned 1% in 2021 owns about **0.61%** today without selling a share. Dilution is how a cash-burning company pays its bills: equity offerings, the Toyota investment, warrant exercises and employee stock awards.

---

## 4. The scenario DCF, step by step

A DCF (discounted cash flow) says **a business is worth the cash it will produce, adjusted for when and how risky that cash is.** The model runs year by year from 2027 to the "scale year".

**Step 1: Fleet.** Before the launch year: 0 aircraft. From launch, the fleet grows in a straight line from *aircraft at launch* to *aircraft at scale* over *years to scale*.
*Base: 20 aircraft in 2027 → 800 by 2035.*

**Step 2: Revenue = average aircraft in service × revenue per aircraft.**
*Base: $3.0M per aircraft per year.* Back-of-envelope: 20 flights/day × 300 days × 4 seats × 70% load × ~$180/seat ≈ $3.0M. This is an assumption: nobody has run an eVTOL network at scale yet.

**Step 3: EBITDA (operating profit before depreciation).** Early on the company still has its full cost base, so the model **blends** from today's burn to the at-scale margin:

```
EBITDA = w × (margin at scale × revenue) − (1 − w) × annual burn
w = 0 in the launch year, rising evenly to 1 in the scale year
```

*Base: 30% margin at scale; burn starts at $743M a year (Joby's actual trailing 4-quarter free-cash-flow burn).*

**Step 4: Free cash flow = EBITDA − tax − capex for new aircraft.**
Tax is 21% of positive EBITDA. This is conservative because Joby's $3B+ accumulated deficit likely gives it loss carryforwards. Capex = new aircraft added × cost per aircraft (*base $2.0M*).

**Step 5: Discount each year's cash flow.**
`PV = FCF ÷ (1 + r)^t`. The discount rate *r* is the return investors demand for the risk. *Base 15%*. Pre-revenue companies typically sit at 12–20%+.

**Step 6: Terminal value**, the value of everything after the scale year:

- *Exit multiple* (default): `TV = EBITDA in final year × multiple` (*base 12x*).
- *Perpetual growth* (Gordon): `TV = next year's FCF ÷ (r − g)`. The model includes the capex needed to keep growing the fleet at *g*.

**Step 7: From enterprise value to price per share.**

```
Enterprise value = Σ PV(FCF) + PV(terminal value)
Equity value    = EV + cash & investments − debt − burn before 2027
Price per share = max(0, equity) ÷ (shares × (1 + future dilution))
```

- **Debt** ($702M) is mostly 0.75% convertible notes due 2032. They convert at roughly $14.20 per share ($690M ÷ ~48.6M shares, per the 10-Q), far above today's price, so we treat them as debt.
- **Burn before 2027** ($404M) covers Q3 and Q4 2026, which happen before the forecast starts.
- **Future dilution:** the DCF already subtracts every dollar of future burn. Dilution here captures stock comp and raising money *below* fair value, *not* the full share issuance, which would double count. Base 20%.
- **Floor at $0:** shareholders can't lose more than their investment (limited liability).

**Base-case walk (snapshot):** Σ PV(FCF) ≈ −$2.28B; PV(terminal) ≈ +$2.31B; EV ≈ $0.03B; + $2.26B cash − $0.70B debt − $0.40B stub ≈ **$1.19B equity ÷ 1,187M diluted shares ≈ $1.00/share.**

> Interview line: *"Almost all of the value is in the terminal value, and almost all of the near-term cash flows are negative. That's why small changes in fleet size, margin or launch year swing the answer so much."*

---

## 5. Scenarios and the probability-weighted target

| | Bear | Base | Bull |
|---|---|---|---|
| Launch year | 2029 | 2027 | 2027 |
| Aircraft at scale | 200 | 800 | 2,500 |
| Revenue / aircraft | $1.8M | $3.0M | $4.0M |
| EBITDA margin at scale | 15% | 30% | 35% |
| Cost / aircraft | $3.0M | $2.0M | $1.5M |
| Discount rate | 18% | 15% | 13% |
| Exit multiple | 8x | 12x | 15x |
| Future dilution | 50% | 20% | 15% |
| **Value / share** | **$0.00** | **$1.00** | **$14.76** |
| Probability | 25% | 50% | 25% |

**Probability-weighted target = Σ probability × price = 0.25 × $0 + 0.50 × $1.00 + 0.25 × $14.76 = $4.19.**

That is an *expected value*, not the most likely outcome. Notice that **$3.69 of the $4.19 comes from the bull case**. The answer depends heavily on how likely you think the bull case is.

**Recommendation rule (disclosed):** upside > +15% → BUY, < −15% → SELL, otherwise HOLD. At $5.16, $4.19 is −19%, so the rule says **SELL**. With the bear case held at 25%, a bull probability above ~26% flips it to HOLD and above ~38% to BUY.

---

## 6. Sensitivity, tornado and reverse DCF

- **Sensitivity table:** price for each combination of discount rate (rows) and launch year (columns). The two "time" assumptions interact: a later launch hurts more when the discount rate is high.
- **Tornado chart:** flex one assumption at a time to a pessimistic and an optimistic value. In the base case the biggest drivers are **fleet at scale, EBITDA margin, launch year and years to scale**, followed by exit multiple and revenue per aircraft. Discount rate matters less in the base case only because its cash flows are mostly negative early and positive late, so the effects partly offset.
- **Reverse DCF:** instead of asking "what is it worth?", ask "what does today's price assume?" Holding everything else at base, **$5.16 requires ~2,640 aircraft at scale** (vs. 800), or ~$8M revenue per aircraft (vs. $3M). This is the most persuasive single number in the pitch.

---

## 7. Comps

The Comps table lists other **listed** eVTOL / advanced-air-mobility companies (Archer, BETA, Eve, EHang, Vertical, New Horizon), re-verified live: a trade in the last 10 days on a major US exchange.

- **EV = market cap + debt − cash.** For pre-revenue companies, EV is the price the market puts on the technology and the option on success.
- **Cash / burn (years)** shows who must raise money soonest.
- Figures reported in other currencies (EHang: CNY, Vertical: GBP, New Horizon: CAD) are converted at Yahoo FX rates.
- Snapshot: Joby EV ≈ $3.6B, second only to BETA (≈ $4.9B); Archer ≈ $1.8B.

> Interview line: *"Comps don't give me a target here because nobody has earnings. They tell me how much the market already pays for Joby's lead, and who is likely to dilute next."*

---

## 8. What I'd say the model gets wrong (show self-awareness)

- Linear fleet ramp. Reality is likely an S-curve.
- A single blended margin hides separate pilot, battery, maintenance and vertiport costs.
- No value is given to defense or Blade revenue separately, or to the pending Resonant Sciences acquisition. It is treated as value-neutral in the DCF and only reduces cash in the pro-forma runway.
- No explicit interest income on cash (small, conservative).
- Tax ignores loss carryforwards (conservative).
