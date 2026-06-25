# Policy Engine Prototype

Dependency-free ROE policy engine prototype.

The engine classifies tool requests as:

- `Green`: allowed and audited.
- `Amber`: approval required.
- `Red`: approval plus controls required.
- `Black`: prohibited.

## Usage

```bash
node policy-engine-prototype/policy-engine.js sample-payloads/valid-tool-request-green.json
node policy-engine-prototype/policy-engine.js sample-payloads/invalid-tool-request-red-without-approval.json
```

## Rule Priority

```text
Black > Red > Amber > Green
```

Black actions are never downgraded by approval.
