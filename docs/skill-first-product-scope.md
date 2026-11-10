# Skill-First Product Scope

Decision: USER, 2026-11-10. Active development is a document-driven skill/plugin
for existing AI clients, not a separate agent operations application.

This decision supersedes the previous eight-outcome program as the default
development queue. It does not declare those outcomes complete or delete their
code, requirements, failures or evidence. The [completion backlog](completion-backlog.md)
separates active core work from the retained platform program.

## Active Core

1. **Document authoring:** choose a useful format, preserve original intent and
   distinguish evidence, interpretation, assumptions and decisions. Maintain
   ownership, version/supersession, authority and handoff information.
2. **Document routing:** give the human efficient access without an artificial
   AI-role restriction; give delegated agents the references relevant to their
   role, department, task and authority.
3. **Agent work discipline:** support one agent and multiple agents through
   explicit tasking, backbriefs, bounded autonomy, reporting and handoffs.
4. **Corpus maintenance:** keep canonical documents, source maps, indexes,
   links and repository-specific outputs coherent.
5. **Bounded improvement:** use observed failures and AAR findings to improve
   documents, prompts and routes inside the user's scope. Mirror reusable
   procedure changes in both provider skills and test the affected behavior.
6. **Distribution:** maintain equivalent Codex and Claude skills. A plugin, if
   added, packages this same workflow; it does not require a new server product.
   Existing skill installation is not proof of a separately packaged plugin.

Use [Document Authoring Workflow](document-authoring-workflow.md) for ordinary
writing and maintenance. Local schemas, validators, receipts and CLI helpers
remain supporting tools where the selected workflow needs them.

## Deferred Platform Work

- Dashboards, command-post screens, browser polish and operational COP UI.
- Standalone operator login, approval UI, multi-user application and evidence API.
- Console-specific training evaluation and browser/crash acceptance campaigns.
- A separately operated orchestration service or always-running execution backend.
- Production gateways, distributed coordination, protected hosts/keys and
  independently operated monitoring infrastructure.

Do not pick one of these as the next task merely because an older roadmap or
failed platform check remains open. New development needs an explicit USER
scope decision. Retained documentation remains available for inspection and
specifically requested maintenance.

Deferral is not permission to clear an existing hold, replay a decision, bypass
an approval, disable a guard, stop a service or alter credentials. Already
admitted operations retain their original settlement and authority rules.
Actual delegated execution still requires its routing/preflight and applicable
tool controls. Ordinary document drafting is not evidence of execution.

## Core Acceptance

| Criterion | Evidence required before closure |
| --- | --- |
| Authoring | Representative requests create the right document with traceable claims, explicit unknowns, ownership and acceptance criteria; a revision preserves intent and records what changed. |
| Routing | Both providers select the required authoring/task documents; human and delegated modes preserve their distinct authority rules; unknown domains retain capability-gap handling. |
| Handoff | Another agent can identify the objective, approved scope, canonical files, results, unresolved decisions and next action without relying on chat memory. |
| Maintenance | New doctrine is indexed consistently; source, local-link and routing checks pass; a reusable improvement reaches both provider skills. |
| Distribution | Installation/discovery and repository resolution work for both clients; copying a skill is not misrepresented as copying the entire corpus or runtime. |
| End-to-end use | A documented and observed request-to-draft-to-review-to-handoff example works without a dashboard or application login. Actual tool execution is assessed separately. |

This is an acceptance list, not six newly completed features. Record the checks
actually run and residual work in the backlog. Report passed/total criteria
only after reviewing that fixed denominator. Do not use the old 125-candidate
inventory percentage as skill/plugin completion, remove deferred candidates
to inflate progress, or equate inventory coverage with task-level correctness.

## Continuation Rule

For "continue" or "what next", read this scope and the active backlog first.
Choose the smallest dependency-ready core task. Consult the implementation
registry for existing code and claims, not as permission to expand the product.
If a core task appears to require a deferred service, identify the actual
dependency and return the scope decision to the USER rather than silently
building that service.

This is a project decision and local engineering policy, not a new claim about
military doctrine or a change to executable authorization contracts.
