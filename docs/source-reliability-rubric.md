# Source Reliability Rubric

## 0. Purpose

This document defines the criteria for evaluating source reliability in the military-style LLM framework.

Hallucination prevention does not end with "attach a source." The source's authority, currency, directness, scope of application, and interpretive risk must all be evaluated together.

## 1. Grades

| Grade | Meaning | Usage |
| --- | --- | --- |
| A | Official primary source | Core evidence |
| B | Official research/academic/specialist institution | Supplementary evidence |
| C | Training material/article/field material | Examples and context |
| D | Informal summary/blog/community | Hypothesis or search lead |
| X | Unclear/verification failed | Do not use |

## 2. Evaluation Dimensions

| Dimension | Question |
| --- | --- |
| Authority | Who published it? |
| Directness | Is it directly related to the claim? |
| Currency | Is it sufficiently up to date? |
| Stability | Is this information that changes frequently? |
| Scope | What is the scope of application of this source? |
| Interpretive risk | Is there a leap of logic in the LLM application interpretation? |
| Accessibility | Can the next worker re-verify it? |

## 3. Grade Criteria

### Grade A

Examples:

- Official military doctrine documents.
- Original text of laws/directives.
- Official standards.
- Official policy announcements.

Conditions:

- Publishing entity is clear.
- Original text is accessible.
- Directly connected to the claim.
- Date or version is verifiable.

### Grade B

Examples:

- Defense research institute reports.
- Peer-reviewed papers.
- Official research institution commentary materials.

Conditions:

- Has expertise.
- Not the direct original text, but has analytical value.
- Suitable for policy/concept interpretation.

### Grade C

Examples:

- Military training materials.
- Field articles.
- Conference presentations.
- Informal but clearly sourced practitioner materials.

Conditions:

- Useful as examples.
- Weak for use as core doctrinal evidence.

### Grade D

Examples:

- Blogs.
- Summary posts.
- Community content.
- Secondary citations without a source.

Conditions:

- Use only as a search lead.
- Prohibited from use as grounds for conclusions.

### Grade X

Examples:

- Link no longer available.
- Source entity unknown.
- Possibility of manipulation.
- Original text cannot be verified.

Conditions:

- Do not use.
- If necessary, record as "verification failed."

## 4. Fields to Include in the Evidence Record

```yaml
reliability:
  grade: A
  authority: "official doctrine"
  directness: "direct"
  currency: "current enough for framework use"
  scope: "US Army doctrine, not Korean doctrine"
  interpretive_risk: "medium"
  note: "LLM application is an analogy, not source claim."
```

## 5. Separating LLM Application Interpretation

Source claim:

```text
Mission command emphasizes commander's intent.
```

LLM interpretation:

```text
LLM agents should receive explicit intent before autonomous execution.
```

Prohibited:

```text
ADP 6-0 says LLM agents need explicit intent.
```

## 6. Special Criteria for Korean Materials

Publicly available materials from the Republic of Korea Armed Forces are evaluated as follows.

| Material | Base grade | Caution |
| --- | --- | --- |
| Laws/directives | A | Actual application is not legal advice |
| Ministry of National Defense (MND) policy materials | A/B | Grounds for policy direction, not grounds for detailed procedure |
| Korea Institute for Defense Analyses (KIDA) research materials | B | Grounds for analysis, not an official order |
| Press articles | C | Use only as examples |
| Blogs/summaries | D | Search lead |

## 7. Red Team Source Check

The Red Team verifies the following.

1. Are there Grade A/B sources for the core claims?
2. Were Grade C/D sources used for core conclusions?
3. Were source claims and LLM interpretation mixed together?
4. Is information that requires currency out of date?
5. Were ROK Armed Forces and US military doctrine inaccurately equated?
6. Can the links be re-verified?

## Quantitative Document Comparisons

These are document-review practices, not additional military-source claims.

- Bind every reported rate to its numerator, denominator, unit and source.
  Keep tasks, attempts, completions and acceptance separate; absent measurements
  are unknown rather than zero.
- Establish matching units, population and source-ID relationships before joining
  an aggregate to individual observations. Two reviewed items do not imply seven
  remaining items in a nine-record inventory unless membership and mapping are
  established. Keep the sets separate when that relationship is unknown; do not
  assign a status to an invented remainder in the plan or follow-up question.
- Distinguish confirmed inclusion, confirmed exclusion and unspecified coverage.
  An unknown tax or shipping amount does not prove it is absent from a quote.
  State that the total payable amount is not established, not that extra charges
  necessarily apply. Check the summary and corrected prose as well as the table;
  an unchanged unknowns column cannot repair a categorical exclusion elsewhere.
- Separate observed group differences, arithmetic scenarios and identified
  causes. Reweighting shows how a chosen composition changes an aggregate; it
  does not establish why the original groups differed or what would happen in
  a new population. Nonrandom records need an explicit limitation, including
  in the headline and conclusion, not only a caveat section.
- Label chosen weights as assumptions. A few scenarios do not establish a
  ranking for every common weighting. Give the supported domain or check the
  formula and crossover before making a universal claim.
- State the assumptions and reproducible calculation behind an added statistical
  test. A correctly calculated value alone does not establish that the test
  applies to these records or identifies a causal effect. Keep unverified
  inferential conclusions out of the operative recommendation.
- Check the final decision summary against these limits as well as the detailed
  table. Correct arithmetic cannot repair an unsupported interpretation.

## 8. Related Documents

- `research-compendium.md`
- `source-map.md`
- `korean-military-sources.md`
- `validator-prototype.md`
- `evaluation-fixtures.md`
