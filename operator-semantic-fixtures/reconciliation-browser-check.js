#!/usr/bin/env node
const fs = require("node:fs"), path = require("node:path"), assert = require("node:assert/strict"), { chromium } = require("playwright");
const { environment, password } = require("./support");
const { digest } = require("../operator-consent-contract");
async function main() {
  assert.equal(process.argv[2], "--output"); assert(process.argv[3]);
  const output = path.resolve(process.argv[3]); fs.mkdirSync(output, { recursive: true });
  const env = await environment({ initialize: false, model: "fixture-invalid", port: 0 });
  const results = [], errors = [], routeErrors = [], releases = []; let browser, closing = false, commitRequests = 0;
  try {
    await env.service.app.listen({ host: "127.0.0.1", port: 0 }); browser = await chromium.launch({ headless: true });
    const page = await browser.newPage({ viewport: { width: 1440, height: 1000 } }); page.on("pageerror", error => errors.push(error.message));
    page.on("request", request => { if (request.method() === "POST" && request.url().endsWith("/api/model-reconciliations/commit")) commitRequests++; });
    await page.goto(`${env.service.origin()}/#setup=${env.service.auth.createBootstrap()}`);
    async function authenticate(username, token) {
      await page.locator("#auth-form input[name=username]").fill(username); await page.locator("#auth-form input[name=password]").fill(password);
      if (token) await page.locator("#auth-form input[name=token]").fill(token);
      await page.locator("#auth-form button[type=submit]").click(); await page.locator("#workspace").waitFor({ state: "visible" });
    }
    async function collectFailure() {
      await page.getByRole("button", { name: "Evidence", exact: true }).click();
      await page.getByRole("button", { name: env.draft.id, exact: true }).click();
      await page.getByRole("button", { name: "Evaluate Omissions", exact: true }).click();
      await page.locator("#semantic-confirmation").waitFor({ state: "visible" });
      await page.locator("#semantic-commit-form input[name=acknowledge]").check();
      await page.locator("#semantic-commit-form textarea[name=rationale]").fill("Synthetic browser approves one exact evaluator packet.");
      await page.locator("#semantic-commit-form input[name=password]").fill(password);
      await page.getByRole("button", { name: "Approve One Evaluation", exact: true }).click();
      await page.locator("#detail-title").filter({ hasText: "Model Evaluation / held" }).waitFor({ timeout: 20000 });
      const value = JSON.parse(await page.locator("#detail-content").textContent()); assert.equal(value.result_verified, true); return value;
    }
    await authenticate("owner"); const first = await collectFailure();
    const original = digest(env.service.auth.db.prepare("SELECT * FROM operator_model_actions WHERE id=?").get(first.id));
    assert.equal(first.hold_preserved, true); assert.equal(first.result.collection.process_group_absent, true);
    results.push("an actual approved fake-provider failure remains held with observed local termination");
    await page.getByRole("button", { name: "Review Model Hold", exact: true }).click();
    await page.locator("#model-hold-confirmation").waitFor({ state: "visible" });
    const subject = JSON.parse(await page.locator("#model-hold-subject").textContent());
    assert.equal(subject.original_action_sha256, original); assert.equal(subject.provider_billing_verified, false);
    assert.equal(subject.child_absence_observed, true); assert.equal(subject.process_group_absence_observed, true);
    await page.screenshot({ path: path.join(output, "model-hold-review-desktop.png"), fullPage: true });
    results.push("actual owner preview shows exact failed subject, local absence and unverified provider effects");
    await page.route("**/api/model-reconciliations/commit", async route => {
      const response = await route.fetch(); assert.equal(response.status(), 200); await route.abort("failed");
    });
    await page.locator("#model-hold-form input[name=acknowledge]").check();
    await page.locator("#model-hold-form textarea[name=rationale]").fill("Synthetic acknowledgment preserves failure <img src=x onerror=window.compromised=true>.");
    await page.locator("#model-hold-form input[name=password]").fill(password);
    await page.getByRole("button", { name: "Acknowledge Failed Transfer", exact: true }).click();
    await page.waitForFunction(() => { try { return JSON.parse(document.querySelector("#detail-content").textContent).reconciliation_verified === true; } catch { return false; } });
    await page.unroute("**/api/model-reconciliations/commit");
    const acknowledged = JSON.parse(await page.locator("#detail-content").textContent());
    assert.equal(acknowledged.state, "held"); assert.equal(acknowledged.hold_preserved, false); assert.equal(acknowledged.result.status, "held");
    assert.equal(acknowledged.reconciliation.provider_billing_verified, false); assert.equal(commitRequests, 1);
    assert.equal(digest(env.service.auth.db.prepare("SELECT * FROM operator_model_actions WHERE id=?").get(first.id)), original);
    assert.equal(await page.locator("#model-hold-form input[name=password]").inputValue(), ""); assert.equal(await page.evaluate(() => window.compromised), undefined);
    await page.screenshot({ path: path.join(output, "failed-original-with-signed-acknowledgment.png"), fullPage: true });
    results.push("a lost actual commit response is inspected without replay; original failure, password cleanup and literal rendering survive");
    await page.getByRole("button", { name: "Close", exact: true }).click(); const second = await collectFailure(); assert.notEqual(second.id, first.id);
    assert.equal(fs.readdirSync(path.join(env.configuration.stateDir, "model-evaluations")).length, 2);
    results.push("a separately approved subsequent evaluation is possible, but acknowledgment itself launched no model");
    await page.setViewportSize({ width: 390, height: 844 });
    await page.getByRole("button", { name: "Review Model Hold", exact: true }).click(); await page.locator("#model-hold-confirmation").waitFor({ state: "visible" });
    await page.getByRole("button", { name: "Acknowledge Failed Transfer", exact: true }).scrollIntoViewIfNeeded();
    assert(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth));
    assert(await page.locator("#detail").evaluate(element => { const rect = element.getBoundingClientRect(); return rect.left >= 0 && rect.right <= innerWidth && rect.bottom <= innerHeight; }));
    assert(await page.locator("#model-hold-form button").evaluate(element => element.scrollWidth <= element.clientWidth));
    await page.screenshot({ path: path.join(output, "model-hold-review-mobile.png"), fullPage: true });
    results.push("mobile failed-transfer review and acknowledgment controls fit without horizontal overflow");
    await page.getByRole("button", { name: "Close", exact: true }).click();
    await page.getByRole("button", { name: "Access", exact: true }).click(); await page.locator("#invite-form input[name=missions]").fill(env.options.mission);
    await page.locator("#invite-form input[name=password]").fill(password); await page.getByRole("button", { name: "Create Invitation", exact: true }).click();
    await page.locator("#invitation-link").waitFor({ state: "visible" }); const token = new URL(await page.locator("#invitation-link").inputValue()).hash.split("=")[1];
    await page.getByRole("button", { name: "Model Evaluations", exact: true }).click(); await page.getByRole("button", { name: second.id, exact: true }).click();
    let release, observed, delivered; const seen = new Promise(resolve => { observed = resolve; }), held = new Promise(resolve => { release = resolve; });
    const delivery = new Promise(resolve => { delivered = resolve; }); releases.push(() => release());
    const url = `**/api/model-evaluations/${second.id}/reconciliation/preview`;
    await page.route(url, async route => {
      try { const response = await route.fetch(); assert.equal(response.status(), 200); observed(); await held; if (!closing) await route.fulfill({ response }); }
      catch (error) { if (!closing) routeErrors.push(error.message); }
      finally { delivered(); }
    });
    await page.getByRole("button", { name: "Review Model Hold", exact: true }).click(); await seen;
    await page.getByRole("button", { name: "Close", exact: true }).click(); await page.getByRole("button", { name: "Sign out", exact: true }).click();
    await page.locator("#auth").waitFor({ state: "visible" }); await page.getByRole("button", { name: "Use Invitation", exact: true }).click();
    await authenticate("viewer", token); release(); await delivery; await page.unroute(url); await page.waitForTimeout(100);
    assert.equal(await page.locator("#model-hold-confirmation").isVisible(), false); assert.equal(await page.locator("#model-hold-subject").textContent(), "");
    assert.equal(await page.locator("#model-hold-meta").textContent(), ""); assert.equal(await page.locator("#model-hold-form input[name=password]").inputValue(), "");
    assert.equal(await page.locator("body").textContent().then(text => text.includes(second.id)), false);
    await page.screenshot({ path: path.join(output, "viewer-after-delayed-model-hold-preview.png"), fullPage: true });
    results.push("a delayed real owner reconciliation preview cannot restore hidden scope or credentials after viewer login");
    assert.deepEqual(errors, []); assert.deepEqual(routeErrors, []);
    const summary = { passed: results.length, failed: 0, results, page_errors: errors, model_reconciliation_commit_requests: commitRequests,
      actual_model_invocations: 0, synthetic_fake_provider_invocations: 2, actual_owner_account_touched: false, release_authorized: false };
    fs.writeFileSync(path.join(output, "browser-results.json"), JSON.stringify(summary, null, 2) + "\n"); console.log(JSON.stringify(summary, null, 2));
  } catch (error) {
    fs.writeFileSync(path.join(output, "browser-failure.json"), JSON.stringify({ error: error.stack, completed_scenarios: results,
      page_errors: errors, route_errors: routeErrors, all_scenarios_passed: false }, null, 2) + "\n"); throw error;
  } finally { closing = true; releases.forEach(release => release()); if (browser) await browser.close(); await env.service.app.close(); fs.rmSync(env.root, { recursive: true, force: true }); }
}
main().catch(error => { console.error(error.stack); process.exitCode = 1; });
