# Rehearsal to CCIR Fixtures

These fixtures verify that rehearsal friction points and decision points become commander-facing routing artifacts.

Expected behavior:

- medium friction -> FFIR/Amber alert, no decision packet.
- high or critical friction -> DECISION_POINT/Red or Black alert and decision packet.
- credential or restricted friction -> EEFI/Black alert that blocks execution.

