#!/usr/bin/env node
const assert = require("node:assert/strict"), fs = require("node:fs"), path = require("node:path");
const { chromium } = require("playwright");
const shared = require("./support"); let fault; shared.installFaults(() => fault);
const { environment, password, count, store } = require("../operator-consent-fixtures/support");
const { executeReconciliation } = require("../operator-reconciliation-executor");
async function main() {
  assert.equal(process.argv[2], "--output"); assert(process.argv[3]);
  const output = path.resolve(process.argv[3]); fs.mkdirSync(output, { recursive: true });
  const browser = await chromium.launch({ headless: true }), results = [], errors = [];
  try {
    for (const [name, viewport, stage, interrupted, title, terminal] of [
      ["desktop-cancel", { width: 1440, height: 1000 }, "after-decision", false, "Cancel Unconsumed Order", "cancelled"],
      ["mobile-recorded", { width: 390, height: 844 }, "after-adoption", false, "Acknowledge Recorded Result", "applied"],
      ["mobile-prior", { width: 390, height: 844 }, "after-decision", true, "Acknowledge Prior Cancellation", "cancelled"]
    ]) {
      let env, context;
      try {
        env = await environment(); const original = await shared.holdOriginal(env, stage, value => { fault = value; });
        if (interrupted) {
          const prepared = await shared.terminalPreview(env, original.challenge_id);
          await env.service.consent.reconciliation.reserve(env.owner.storedSession(), shared.terminalInput(prepared));
          fault = (options, write) => { const result = write(options);
            if (options.kind === "decision-logs") throw new Error("CONSOLE_FIXTURE_CANCEL_INTERRUPTED"); return result; };
          assert.throws(() => executeReconciliation(env.service.configuration, prepared.reconciliation_id), /CANCEL_INTERRUPTED/); fault = null;
        }
        const priorDecisions = count(env, "decision-logs");
        await env.service.app.listen({ host: "127.0.0.1", port: 0 });
        context = await browser.newContext({ viewport }); const page = await context.newPage(); let challenge;
        page.on("pageerror", error => errors.push(error.message));
        page.on("response", async response => { if (response.url().endsWith("/reconciliation/preview") && response.ok()) challenge = await response.json(); });
        await page.goto(env.service.origin()); await page.locator("#auth-form input[name=username]").fill("owner");
        await page.locator("#auth-form input[name=password]").fill(password); await page.locator("#auth-form button[type=submit]").click();
        await page.locator("#workspace").waitFor({ state: "visible" });
        await page.getByRole("button", { name: "Decisions", exact: true }).click();
        await page.getByRole("button", { name: original.challenge_id, exact: true }).click();
        await page.getByRole("button", { name: "Inspect Outcome", exact: true }).click();
        await page.getByRole("button", { name: "Review Terminal Outcome", exact: true }).click();
        await page.locator("#terminal-confirmation").waitFor({ state: "visible" });
        assert.equal(await page.locator("#terminal-title").textContent(), title);
        await page.locator("#terminal-content").filter({ hasText: original.challenge_id }).waitFor();
        assert(challenge); assert(!(await page.locator("body").textContent()).includes(challenge.nonce));
        assert.equal(challenge.review.subject.original_action_sha256.length, 64);
        await page.screenshot({ path: path.join(output, name + "-preview.png"), fullPage: true });
        await page.locator("#terminal-commit-form textarea[name=rationale]").fill("Synthetic browser terminal decision; not actual USER consent.");
        await page.locator("#terminal-commit-form input[name=password]").fill(password);
        await page.locator("#terminal-commit-form button[type=submit]").click();
        await page.locator("#decision-status").filter({ hasText: terminal }).waitFor({ timeout: 45000 });
        const result = JSON.parse(await page.locator("#detail-content").textContent());
        assert.equal(result.terminal_state, terminal); assert.equal(result.execution_authorized, false); assert.equal(result.release_authorized, false);
        assert.equal(await page.locator("#terminal-commit-form input[name=password]").inputValue(), "");
        assert(await page.getByRole("button", { name: "Close", exact: true }).isVisible());
        await page.screenshot({ path: path.join(output, name + "-terminal.png"), fullPage: true });
        assert.equal(count(env, "operator-reconciliation-records"), 1);
        assert.equal(count(env, "order-adoption-records"), stage === "after-adoption" ? 1 : 0);
        assert.equal(count(env, "decision-logs"), priorDecisions + (title === "Cancel Unconsumed Order" ? 1 : 0));
        const size = store(env).manifest.artifacts.length;
        await page.getByRole("button", { name: "Inspect Outcome", exact: true }).click();
        await page.locator("#detail-title").filter({ hasText: terminal === "cancelled" ? "Original Decision Cancelled" : "Recorded Outcome" }).waitFor();
        await page.locator("#detail-content").filter({ hasText: '"inspection_only": true' }).waitFor();
        const inspected = JSON.parse(await page.locator("#detail-content").textContent());
        assert.equal(inspected.outcome, terminal); assert.equal(inspected.hold_preserved, false);
        assert.equal(store(env).manifest.artifacts.length, size); assert(await page.locator("#review-terminal").isHidden());
        assert(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth));
        await page.screenshot({ path: path.join(output, name + "-inspected.png"), fullPage: true });
        results.push({ name, terminal_state: terminal, original_replayed: false, execution_authorized: false, release_authorized: false });
      } finally { fault = null; if (context) await context.close(); if (env) { await env.service.app.close(); fs.rmSync(env.root, { recursive: true, force: true }); } }
    }
    assert.deepEqual(errors, []);
    const value = { passed: results.length, failed: 0, results, page_errors: errors, actual_owner_account_created: false };
    fs.writeFileSync(path.join(output, "browser-results.json"), JSON.stringify(value, null, 2) + "\n"); console.log(JSON.stringify(value, null, 2));
  } finally { await browser.close(); }
}
main().catch(error => { console.error(error.stack); process.exitCode = 1; });
