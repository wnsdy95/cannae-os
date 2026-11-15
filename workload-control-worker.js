#!/usr/bin/env node
const { LIMITS, assessInput, assertJsonLimits } = require("./workload-control-contract");
const { validatePayload } = require("./validator-cli-prototype/validate");
let bytes = 0, chunks = [], ended = false;
function fail(code) {
  if (ended) return; ended = true;
  process.stdin.destroy(); process.stdout.end(JSON.stringify({ type: "WorkloadControlFailure", schema_version: "0.1", code }) + "\n"); process.exitCode = 1;
}
process.stdin.on("data", chunk => {
  bytes += chunk.length;
  if (bytes > LIMITS.input_bytes) fail("WORKLOAD_INPUT_BYTES_EXCEEDED"); else if (!ended) chunks.push(chunk);
});
process.stdin.on("error", () => fail("WORKLOAD_INPUT_UNAVAILABLE"));
process.stdin.on("end", () => {
  if (ended) return;
  try {
    const data = Buffer.concat(chunks); chunks = [];
    if (!Buffer.from(data.toString("utf8")).equals(data)) return fail("WORKLOAD_INPUT_ENCODING_INVALID");
    const input = JSON.parse(data.toString("utf8"));
    assertJsonLimits(input);
    if (!validatePayload(input, "workload-control-input").valid) return fail("WORKLOAD_INPUT_INVALID");
    const assessment = assessInput(input);
    if (!validatePayload(assessment, "workload-policy-assessment").valid) return fail("WORKLOAD_ASSESSMENT_INVALID");
    ended = true; process.stdout.end(JSON.stringify(assessment) + "\n"); process.exitCode = assessment.status === "passed" ? 0 : 1;
  } catch { fail("WORKLOAD_EVALUATION_FAILED"); }
});
