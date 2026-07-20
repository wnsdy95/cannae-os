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

## 8. Related Documents

- `research-compendium.md`
- `source-map.md`
- `korean-military-sources.md`
- `validator-prototype.md`
- `evaluation-fixtures.md`
