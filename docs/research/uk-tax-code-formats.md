# UK PAYE tax code formats

Researched 2026-10-28 from primary sources only (gov.uk, HMRC PAYE Manual, HMRC RTI 2026-27 schema and data item guide, HMRC tax table routines spec v24.0). Source keys like [S1] point to the list at the end.

## TL;DR

- **A tax code is never just numbers.** If a code has a number for an allowance, it must end in a suffix letter (`1257L`). The only other forms are `K`+number, `D`+digit, `BR`, `0T` and `NT`. The FPS XML schema rejects `1257` and `0` outright ([S1]). The 2026-27 data item guide lists exactly "four valid formats", and a bare number isn't one of them ([S2]).
- HMRC's own manual says "Most tax codes are made up of a number followed by a letter" ([S5]). Every rule for picking a suffix ends in L, M, N, T, P or Y, and none leaves the code without one ([S6]). The nearest thing to "zero" is `0T`. There is no `0`, `0L` or `K0` ([S1], [S4] §4.3.1b).
- **If an employer gets a code with no letter**, payroll can't report it: the FPS fails schema validation ([S1]). Primary sources don't give a procedure for a malformed code. The closest is the rule for a new starter with no usable P45 or checklist: use `0T` with starter declaration C ([S13]). See §4.
- **The suffix doesn't change the tax.** It only tells employers which codes HMRC can uplift in bulk. "The suffix plays no part in the actual tax calculations" ([S4] §15.1).
- `S` / `C` prefixes and `W1` / `M1` / `X` markers are **not part of the RTI tax code field**. They go in separate fields (`TaxRegime`, `BasisNonCumulative`), but are printed on payslips, P45s and P60s ([S1], [S2]).
- Length: the FPS code field is 2–7 characters, with at most 6 digits ([S1]). Software should allow 7 characters, e.g. `999999T` ([S4] §3.3.2).

## 1. Is a numbers-only code ever valid?

No, in every primary source checked.

| Source | What it says |
|---|---|
| FPS 2026-27 XSD, `_intermediate_TaxCode` [S1] | `minLength 2`, `maxLength 7`, pattern `([1-9][0-9]{0,5}[LMNPTY])\|(BR)\|(0T)\|(NT)\|(D[0-8])\|([K][1-9][0-9]{0,5})`. A digits-only value, including `0`, matches none of these. |
| RTI Data Item Guide 2026-27, item 55 [S2] | "There are four valid formats: Numbers followed by a suffix letter (L, M, N, P, T or Y)…; K followed by numbers…; D followed by a number…; BR, 0T, NT" |
| PAYE11085 [S5] | "Most tax codes are made up of a number followed by a letter" (e.g. 747L). Every other type is a named special code (D, K, S, C, BR, NT). |
| PAYE11045 [S6] | The system "will always allocate the suffix". All cases end in T, L, M, N, P or Y. |
| PAYE11065 [S7] | The number is the net allowance with its last digit dropped. Allowances of £1–9 use 1, not 0. A nil allowance gives 0, which is issued as `0T` ([S8]). |
| gov.uk (employer) [S9] | A code is "made up of several numbers and one letter". |
| gov.uk (employee) [S10] | HMRC works out the allowance, then "replace[s] the final digit with a letter". |

Only one valid code starts with `0`: the literal `0T`. The XSD forces a numeric part to start with 1–9, so `0L` and `01257L` are invalid ([S1]). The tables spec says "There is no code K0, SK0 or CK0", and negative allowances from −£1 to −£19 are coded `0T`, `S0T` or `C0T` ([S4] §4.3.1b).

## 2. Catalogue of formats

### 2.1 Suffix codes (number + letter)

| Suffix | Meaning | Status | Source |
|---|---|---|---|
| L | Standard Personal Allowance | current; uplifted by general authority (P7X/P9X) | [S3], [S4] §15.1, [S11] |
| M | Marriage Allowance: received 10% of partner's PA | current | [S3], [S11] |
| N | Marriage Allowance: transferred 10% of own PA | current | [S3], [S11] |
| T | Code needs review by HMRC, or the person asked for it; never uplifted by general authority | current | [S11], [S4] §15.5, [S6] |
| P | Age-related allowance (65–74) | historic: valid only up to 5 Apr 2015, "should no longer be used"; **still accepted by the FPS schema** | [S11], [S6], [S1] |
| Y | Age-related allowance (born before 6 Apr 1938) | historic: valid only up to 5 Apr 2016; still accepted by the FPS schema | [S11], [S6], [S1] |
| V | Historic (pre-RTI) | Only mentioned in PAYE11045's T rule ("secondary source code has suffix L, P, V or Y"). **Not** in the FPS schema. Its meaning isn't defined in any primary source I could reach. | [S6], [S1] |

- Numeric part: 1 to 6 digits, first digit 1–9 ([S1]).
- PAYE11015 says codes over 5 characters, ignoring an S/C prefix, need extra manual steps to issue, so they are rare but allowed ([S8]).
- Free pay is (number × £10) + £9 a year. Code 1 covers allowances of £1–£19 ([S4] §4.3.1b).
- gov.uk simplifies this to "multiply the number in the tax code by 10" ([S12]).
- In 2014-15 the RTI guide listed only L, T, P, Y. M and N came with Marriage Allowance from 2015-16 ([S2-1415]).

### 2.2 K codes

- Format is `K` + 1–6 digits, first digit 1–9, with no suffix ([S1]).
- PAYE11015 says K codes have "a number from 1 to 9999", i.e. 4 digits. That is narrower than the schema (see Conflicts) ([S8]).
- A K code means deductions are larger than allowances. Drop the last digit, then reduce the new last digit by 1. Example: 12,570 − 14,120 = −1,550 gives `K154` ([S14]).
- Additional pay uses the same ×10 + 9 rule ([S4] §4.3.1b). gov.uk simplifies it to ×10 (K475 adds £4,750) ([S3]).
- Overriding limit: tax deducted on a payday can't be more than 50% of pay ([S14], [S3], [S15] §1.12).
- `SK…` / `CK…` exist, e.g. SK100 and CK100 ([S14], [S2] 55A).

### 2.3 Flat-rate and special codes (no number, no suffix)

| Code | Meaning | Source |
|---|---|---|
| BR / SBR / CBR | All pay at the basic rate (rUK, Scottish or Welsh) | [S3], [S8] |
| D0 / CD0 | All pay at the higher rate | [S3], [S8] |
| D1 / CD1 | All pay at the additional rate | [S3], [S8] |
| SD0 | All pay at the Scottish intermediate rate | [S3], [S10] |
| SD1 | Scottish higher rate | [S3], [S10] |
| SD2 | Scottish advanced rate | [S3], [S10] |
| SD3 | Scottish top rate | [S3], [S10] |
| D2–D8 | Allowed by the schema (`D[0-8]`). PAYE11015 says they "always carry an S prefix" (Scottish higher rates). In general, Dn = rate (G + n + 1) in that regime's rate table. | [S1], [S8], [S4] §6, §10 |
| 0T / S0T / C0T | No allowance; tax goes through all the bands | [S3], [S8] |
| NT | No tax. UK-wide: "there is no SNT or CNT code" | [S4] §7.1, §11.1, [S8] |

### 2.4 Prefixes S and C

- `S` means a Scottish taxpayer and `C` a Welsh one. The prefix is set automatically from the person's main residence ([S8], [S5]).
- On the FPS the prefix is **not** part of `TaxCode`. It goes in the `TaxRegime` attribute (`S`/`C`) ([S1], [S2] item 55A).
- On payslips, P45s and P60s it is printed in front of the code: `S1060L`, `SK500`, `C1060L`, `CK500` ([S2] 55A).
- No prefix on NT ([S4] §11.1) or on the emergency code ([S4] §12.1).

### 2.5 Emergency and non-cumulative markers (W1, M1, X, NONCUM)

- `W1` (weekly), `M1` (monthly) and `X` (varying pay dates) follow the code, e.g. "1257L W1", "S875L M1", "C663L X". A payslip may show "NONCUM" instead ([S16]).
- "1257L is an emergency tax code only if followed by 'W1', 'M1' or 'X'" ([S9]).
- The emergency code for 2026-27 is 1257L ([S17]).
- These markers aren't part of the code itself. They show the code is being run on a week 1 / month 1 basis.
  - The FPS sends this as `BasisNonCumulative="yes"`. The guide says: "Do not indicate here if the code is non-cumulative" ([S1], [S2] items 55, 56).
  - Any code type can run on a week 1 / month 1 basis: suffix, K, D, BR, NT ([S4] §8–11, [S13a]).
- Codes carried into a new tax year switch back to cumulative ([S4] §15.6, [S13a]).

## 3. Length and value limits

| Limit | Value | Source |
|---|---|---|
| FPS TaxCode string length | 2–7 chars (prefix and W1/M1 not included) | [S1] |
| Digits in suffix / K codes (FPS) | 1–6, no leading zero | [S1] |
| Software field allowance | "up to 7 characters in length (eg 999999T)" | [S4] §3.3.2 |
| K number per PAYE Manual | 1–9999 | [S8] |
| Issuing threshold | Codes over 5 chars (ignoring S/C) need manual steps | [S8] |
| D digit (FPS) | 0–8 | [S1] |
| Tax per payday | ≤ 50% of pay (all codes) | [S15] §1.12, [S14] |

## 4. What if an employer receives a code with no suffix letter?

- **It can't be submitted.** The FPS `TaxCode` element is required (`minOccurs=1`) and must match the pattern, so `1257` fails schema validation ([S1]).
- **No HMRC process creates one.** HMRC tells employers about codes through P6, P9, P7X and P9X notices. Codes are generated with a suffix by rule ([S6], [S7]). General uplifts apply by suffix (L, M, N), so a code with no suffix couldn't be uplifted anyway ([S4] §15.1–15.5).
- **A missing letter almost always means a transcription error**, e.g. a P45 copied wrongly, or the user typing only the number. The calculation would usually still be right, because the suffix "plays no part in the actual tax calculations" ([S4] §15.1). Only the K-vs-suffix distinction and the prefix/flat codes change the maths.
- **What should payroll do?** No primary source spells out a procedure for a malformed code. The closest official rules are:
  - Without a P45 or starter information, "use starter declaration code C and the tax code 0T" ([S13]).
  - A starter checklist decides the temporary code while the P45 is awaited ([S13]).
  - Employers can call the employer helpline when unsure ([S15]).

  Treat any specific "fallback" for an unsuffixed code as unconfirmed.
- **HMRC's own tax code checker accepts one.** On 28 Oct 2026, [get-help-understanding-your-tax-code](https://www.tax.service.gov.uk/guidance/get-help-understanding-your-tax-code/start/about-this-guidance) accepted `1257`, `S1257` and `C1257` and gave the same tax as `1257L` (£4,484 on £35,000), though its explanation text came out blank for the missing letter. It rejected `0`, `K0`, `01257L`, `1257Q` and `L`, and accepted `SNT` (£0 tax).

## Conflicts and uncertainty

1. **K code length.** PAYE11015 says K numbers run 1–9999 (4 digits) [S8]. The FPS schema allows up to 6 digits [S1]. The schema is the binding validation; the manual is HMRC's internal issuing practice.
2. **P/Y validity.** The PAYE Manual says P and Y are historic and "should no longer be used" [S11]. The 2026-27 FPS schema and guide still accept them [S1], [S2]. They are probably kept for late or back-year submissions; I haven't confirmed that.
3. **Multiplier.** gov.uk says ×10 for both suffix and K codes ([S12], [S3]). The tables spec uses ×10 + £9 ([S4] §4.3.1b). PAYE11095's K-code rule ("reduce the new last digit by 1") fits the +9 version.
4. **Emergency code and prefixes.** The tables spec says the emergency code takes no S or C prefix ([S4] §12.1). gov.uk's emergency page shows "S875L M1" and "C663L X" [S16]. These fit together if read as "any code run W1/M1", not "the emergency code itself".
5. **W1/M1/X wording.** gov.uk employee pages call W1, M1 and X "emergency tax codes" [S10], [S16]. In the PAYE Manual, week 1 / month 1 is just a way of applying any code [S13a]. The FPS records it separately [S2].
6. **Suffix V.** It appears only in PAYE11045 [S6]. Its meaning isn't confirmed in any primary source I could reach.
7. **D2–D8 outside Scotland.** The schema allows a bare `D2` [S1]. PAYE11015 says D2–D8 always carry an S prefix [S8], and gov.uk lists only CD0 and CD1 for Wales [S3].

## Implications for `src/engine/taxCode.ts`

I tested the current parser with Node strip-types against the inputs below. **No code changed.**

**Matches the findings**

- `0` throws "Unrecognised tax code". `1257` (and `S1257`, `C1257`) used to throw too; it's now read as ending in L with a warning, matching HMRC's checker (§4).
- Handled correctly: BR/SBR/CBR, 0T/S0T/C0T, NT, K/SK/CK, the S/C prefixes, and stripping W1/M1/X/NONCUM.
- D0/D1 work for rUK and Wales and SD0–SD3 for Scotland. `D2` throws without an S prefix, which fits PAYE11015.
- The letter-only inputs (`L`, `M`, `K`, `S`, etc.) are a deliberate UX convenience. HMRC never issues them, so keep them clearly separate from real codes.

**Gaps (small)**

| Input | Parser now | Primary sources say |
|---|---|---|
| `1257P` | throws | Still valid in the FPS schema; historic since 2015. `Y` is accepted but `P` isn't, which is inconsistent. Accept both or neither. |
| `SNT`, `CNT` | accepted (region set) | "there is no SNT or CNT code" [S4] §11.1. Harmless, but strictly invalid. |
| `K0` | accepted (allowance −0) | "There is no code K0" [S4]. |
| `0L`, `01257L` | accepted | The numeric part must start with 1–9 [S1]. Nil allowance is `0T`. |
| `12345678L` | accepted (£123,456,780) | At most 6 digits / 7 characters [S1], [S4] §3.3.2. Consider capping. |
| `SD4`–`SD8` | throw | The schema allows D0–D8, but only SD0–SD3 map to current Scottish bands [S3]. Rejecting them is fine. |
| allowance = n × 10 | `1257L` gives £12,570; `K475` gives −£4,750 | Payroll uses n × 10 + 9 for both suffix and K codes [S4] §4.3.1b. The gap is at most £9 of allowance, so under £5 a year in tax. **Now fixed:** the parser uses n × 10 + 9, which matches HMRC's checker (`1257L` → £4,484 and `K475` → £8,364 on £35,000). |

## Sources

- [S1] HMRC, RTI RIM 2026-27 v1.0, `FullPaymentSubmission-2027-v1-0.xsd`. See `TaxCode` (line ~900) and `_intermediate_TaxCode` (line ~1652). Zip: https://assets.publishing.service.gov.uk/media/689313c9a34b939141463fa2/RTI-RIM-2027-v1-0.zip. Publication page: https://www.gov.uk/government/publications/real-time-information-internet-submissions-2026-to-2027-technical-specifications
- [S2] HMRC, RTI Data Item Guide 2026-27 v1.0, FPS items 55, 55A, 56: https://assets.publishing.service.gov.uk/media/68c969d107d9e92bc5517b81/RTI-Data-Item-Guide-2026-2027-v1-0.odt
- [S2-1415] HMRC, RTI Data Item Guide 2014-15 v1.4, item 55 ("L, T, P or Y"): https://assets.publishing.service.gov.uk/media/5a7d72d6e5274a7b50ccf08c/RTI_Data_Item_Guide_14-15-v1_4.pdf
- [S3] gov.uk, Understanding your employees' tax codes: letters: https://www.gov.uk/employee-tax-codes/letters
- [S4] HMRC, Specification for PAYE tax table routines v24.0 (Feb 2026), §§3.3.2, 4.3.1, 6, 7, 10–12, 15: https://assets.publishing.service.gov.uk/media/698c9824bd090be481c2879a/PAYErout-v24-0.odt. Index: https://www.gov.uk/government/publications/payroll-technical-specifications-income-tax
- [S5] PAYE11085, Types of code: https://www.gov.uk/hmrc-internal-manuals/paye-manual/paye11085
- [S6] PAYE11045, Rules for deciding code suffix: https://www.gov.uk/hmrc-internal-manuals/paye-manual/paye11045
- [S7] PAYE11065, Suffix codes: calculating the number: https://www.gov.uk/hmrc-internal-manuals/paye-manual/paye11065
- [S8] PAYE11015, Codes for special cases: https://www.gov.uk/hmrc-internal-manuals/paye-manual/paye11015
- [S9] gov.uk, Understanding your employees' tax codes (overview): https://www.gov.uk/employee-tax-codes
- [S10] gov.uk, Tax codes: what your tax code means: https://www.gov.uk/tax-codes/what-your-tax-code-means
- [S11] PAYE11075, Suffix codes: the suffix: https://www.gov.uk/hmrc-internal-manuals/paye-manual/paye11075
- [S12] gov.uk, Understanding your employees' tax codes: numbers: https://www.gov.uk/employee-tax-codes/numbers
- [S13] gov.uk, Employer help card: new starter information: https://www.gov.uk/government/publications/simplifying-the-onboarding-process-for-new-starters-communication-resources/employer-help-card-new-starter-information-helping-employers-get-it-right
- [S13a] PAYE11090, Ways an employer can apply a tax code: https://www.gov.uk/hmrc-internal-manuals/paye-manual/paye11090
- [S14] PAYE11095, K codes: https://www.gov.uk/hmrc-internal-manuals/paye-manual/paye11095
- [S15] HMRC, CWG2 2026-27 Employer further guide to PAYE and NICs, §1.12: https://www.gov.uk/government/publications/cwg2-further-guide-to-paye-and-national-insurance-contributions/2026-to-2027-employer-further-guide-to-paye-and-national-insurance-contributions
- [S16] gov.uk, Tax codes: emergency tax codes: https://www.gov.uk/tax-codes/emergency-tax-codes
- [S17] HMRC, P9X: tax codes to use from 6 April 2026: https://www.gov.uk/government/publications/p9x-tax-codes/p9x-tax-codes-to-use-from-6-april-2026
- PAYE Manual coding index (PAYE11000): https://www.gov.uk/hmrc-internal-manuals/paye-manual/paye11000
