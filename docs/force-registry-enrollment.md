# Force Registry Enrollment

## Boundary

This local candidate provides persistent, repository-isolated definition
enrollment for organizations, capabilities and performers. It replaces neither
training evaluation nor operational admission. Every enrolled definition remains
`qualification_state: unassessed`; execution, release, qualification and standing
activation flags stay false. All eight program outcomes remain open.

The existing force-structure runner produces a planning projection from approval
strings. A ready projection is not authenticated activation or a registry write.
This separate path requires exact, purpose-bound local owner consent. It does not
make an existing organization operational or requalify old readiness history.

## Definitions And Lineage

`ForceRegistryEntity` has a permanent kind-prefixed ID, increasing version,
enrolled/retired state and a complete definition. Label text is not identity.
Organizations name an enrolled parent and maintainers; capabilities name an owner,
METL identity, exact retained standard and explicitly reviewed role/task aliases;
performers name an owner, principal digest and exact declared model revision,
harness, prompt, tool-schema, tool-policy and execution-profile commitments.
These are reviewed declarations, not proof that a provider is running them.

The current operations are enroll, revise and retire definitions. They are not
activate, expand, merge, split, reduce, reassign live work or disband a running
unit. A retired ID cannot be resurrected. An owner must move or retire dependent
definitions before retiring their organization; parent cycles and unavailable
owners hold. Removed capability aliases remain reserved to their historical ID.
An explicit alias lookup can therefore retain identity across reviewed wording
changes and missions, but it does not recognize arbitrary semantic paraphrases.

Each `ForceRegistryEvent` commits to one exact predecessor and sequence, one
proposal, one separately signed authorization and one complete entity revision.
Replay verifies the namespace, hashes, exact IDs/scopes, retained review snapshot,
full signed nested subject, pinned operator key, one-use consent and transition
rules. Path order or caller timestamps cannot select between forks. History is
bounded at 256 events/authorizations/entities; overflow holds, never truncates.
Larger-scale archival/migration is not supplied by this first local contract.

## Proposal And Owner Review

An agent may write a strict `ForceRegistryRequest` and submit a new proposal:

```bash
node codex-skills/controls-doctrine-operator/scripts/operate_controls_force_registry.js \
  propose <force-registry-request.json> --repository <target-repository> \
  --artifact-root <artifact-root>
```

The Claude wrapper is equivalent. Construct a new exact request with
`force-registry-contract.createRequest`; changing its content needs a new ID.
Never rewrite an existing proposal, event or authorization. Requests bind the
expected global registry head; an intervening enrolled revision requires a new
proposal and fresh review, not automatic rebasing of old consent.

The real owner selects the proposal from Evidence, reviews the complete definition,
previous revision, pinned scope and bounded supporting materials, acknowledges
definition-only scope and reauthenticates with the owner password. This is a
separate purpose from order adoption, model transfer, reconciliation or release.
The acting agent must not perform that real owner ceremony.

The server chooses a fresh UUID and 256-bit nonce, binds the owner/session epoch,
source, target, repository and exact manifest, and limits consent to at most two
minutes. The signed `ForceRegistryAuthorization` includes the complete definition
and scope plus exact supporting-material commitments. The worker rechecks
live owner/session/service state and publication bindings before each write.
Passwords and raw nonces are not retained in those artifacts.

The browser hashes the complete JSON actually displayed, checks its preview
commitment and sends that digest with the decision. The server compares it with
the private reserved review before consumption. A missing, incomplete or modified
display cannot authorize the original hidden packet through its nonce alone.
This binds content, not proof that the human read or understood it.

Only the console can consume this purpose's reserved owner action. The CLI has
no approve/apply, actor-override, clock-override, qualification or restore command.
CLI inspection needs a separately trusted public-key file when history exists;
choosing a key yourself does not make its records authoritative to the console.
The console pins its own repository-bound operator identity, not a key in an
incoming proposal. Key rotation requires a separate reviewed migration; never
re-sign history or accept the artifact's embedded key as its trust anchor.

Supporting materials are exact verified UTF-8 artifact references: at most 64 KiB
each and 128 KiB total, with no truncation. Capability standards require the
`capability-standards` kind. A standard is a reviewed requirement, not training
success. Decoding must preserve the exact retained bytes; BOM stripping or other
normalization fails before preview rather than changing the approved material.
Complete records are bounded at 256 KiB. Oversize or malformed input
needs a separately reviewed decomposition, not omitted constraints or a larger
reader. Evidence, definition and enrollment records never count as task work.
Supporting text stays in its original artifact and the owner's private preview,
not in the signed enrollment record. That record binds exact material references,
content digests and the full displayed-review digest; replay reconstructs and
verifies the original subject rather than trusting an unchecked digest. Registry
records and capability standards are owner-only even through the general evidence
API, so a mission viewer cannot obtain cross-mission material through this path.

## Holds And Inspection

Force Registry shows enrolled definitions and enrollment decisions to the owner.
Viewers cannot preview or commit enrollment. Exact state is also inspectable
through the owner-authenticated evidence API. A lost response requires inspection
of the existing action; do not resubmit an old nonce.

If authorization or event publication may have occurred, retain the partial
record and a reconciliation-required action. All later enrollment is held,
including after service restart. Orphan authorizations are also visible in
verified history. No recovery/reset command is supplied here: a distinct exact
terminal-review contract is required before that hold can be discharged.
Expiration, logout, role changes, worker exit and source/target/manifest drift
do not turn a partial change into success or silently renew consent.

## Verification And Full Remaining Scope

Run the contract and runtime force-registry fixtures, generic validator,
operator consent/worker/UI/browser checks, metadata checks and both-provider
skill/routing gates against one frozen source. Use only isolated synthetic owner
accounts for automated tests. Do not touch the real owner's setup, password,
private signing state, installed skill or daemon while accepting this source.

This is local signed-reference enrollment, not protected-host identity, trusted
time, external coordination/fencing, independent training provenance or an
exclusive gateway. Full goal 5 still requires actual training and positive
qualification, supervision, mandatory live plan/lease/tool/approval/delegation
consumers, recurring demand and full organization lifecycle, all ownership
settlement/restoration, CoS/COP linkage, recovery and controlled migration.
Other seven outcomes retain their own independent acceptance requirements.
