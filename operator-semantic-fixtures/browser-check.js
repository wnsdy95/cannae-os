#!/usr/bin/env node
const fs = require("node:fs"), path = require("node:path"), assert = require("node:assert/strict");
const { chromium } = require("playwright");
const { environment, password } = require("./support");
const { captureRequest, compileOrder } = require("../request-order-compiler");
const { completeAnalysis, REQUEST_TEXT } = require("../request-order-compiler-fixtures/support");
async function main() {
  assert.equal(process.argv[2], "--output"); assert(process.argv[3]);
  const output = path.resolve(process.argv[3]); fs.mkdirSync(output, { recursive: true });
  const env = await environment({ initialize: false, port: 0 });
  let browser, closing = false; const errors = [], routeErrors = [], results = [], releases = [];
  try {
    const request = captureRequest({ ...env.options, requestId: "MR-BROWSER-MODEL", text: REQUEST_TEXT + "\n<img src=x onerror=window.compromised=true>" });
    const draft = compileOrder(completeAnalysis(request.artifact_ref), env.options);
    await env.service.app.listen({ host: "127.0.0.1", port: 0 });
    browser = await chromium.launch({ headless: true });
    const page = await browser.newPage({ viewport: { width: 1440, height: 1000 } });
    page.on("pageerror", error => errors.push(error.message));
    const setup = env.service.auth.createBootstrap();
    await page.goto(`${env.service.origin()}/#setup=${setup}`);
    async function auth(username, token) {
      await page.locator("#auth-form input[name=username]").fill(username);
      await page.locator("#auth-form input[name=password]").fill(password);
      if (token) await page.locator("#auth-form input[name=token]").fill(token);
      await page.locator("#auth-form button[type=submit]").click();
      await page.locator("#workspace").waitFor({ state: "visible" });
    }
    async function selectDraft() {
      await page.getByRole("button", { name: "Evidence", exact: true }).click();
      await page.getByRole("button", { name: draft.id, exact: true }).click();
      await page.getByRole("button", { name: "Evaluate Omissions", exact: true }).waitFor();
    }
    await auth("owner"); await selectDraft();
    const previewResponse = page.waitForResponse(response => response.url().endsWith("/api/model-evaluations/preview") && response.status() === 200);
    await page.getByRole("button", { name: "Evaluate Omissions", exact: true }).click();
    const prepared = await (await previewResponse).json();
    await page.locator("#semantic-confirmation").waitFor({ state: "visible" });
    assert.equal(await page.locator("#semantic-prompt").textContent(), prepared.invocation.preview.prompt);
    assert.equal(await page.evaluate(() => window.compromised), undefined);
    assert.equal(await page.locator("#semantic-profile").textContent().then(text => text.includes("Not enforced")), true);
    assert.equal(await page.locator("#semantic-profile").textContent().then(text => text.includes("Not attested")), true);
    await page.screenshot({ path: path.join(output, "transfer-preview-desktop.png"), fullPage: true });
    results.push("actual owner preview displays the exact transmitted text, profile and risk without executing markup");
    await page.locator("#semantic-commit-form input[name=acknowledge]").check();
    await page.locator("#semantic-commit-form textarea[name=rationale]").fill("Synthetic browser owner approves this exact evaluator packet only.");
    await page.locator("#semantic-commit-form input[name=password]").fill(password);
    await page.getByRole("button", { name: "Approve One Evaluation", exact: true }).click();
    await page.locator("#detail-title").filter({ hasText: "Model Evaluation / evaluated" }).waitFor({ timeout: 20000 });
    const current = JSON.parse(await page.locator("#detail-content").textContent());
    assert.equal(current.result_verified, true); assert.equal(current.result.collection.process_group_absent, true);
    assert.equal(current.execution_authorized, false); assert.equal(current.release_authorized, false);
    assert.equal(await page.locator("#semantic-commit-form input[name=password]").inputValue(), "");
    await page.screenshot({ path: path.join(output, "evaluation-result-desktop.png"), fullPage: true });
    results.push("real browser password/nonce approval reaches the collector and signed queryable result");
    await page.getByRole("button", { name: "Close", exact: true }).click(); await page.setViewportSize({ width: 390, height: 844 });
    await selectDraft(); await page.getByRole("button", { name: "Evaluate Omissions", exact: true }).click();
    await page.locator("#semantic-confirmation").waitFor({ state: "visible" });
    await page.screenshot({ path: path.join(output, "transfer-preview-mobile.png"), fullPage: true });
    assert(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth));
    assert(await page.locator("#detail").evaluate(element => { const r = element.getBoundingClientRect(); return r.left >= 0 && r.right <= innerWidth && r.bottom <= innerHeight; }));
    await page.getByRole("button", { name: "Approve One Evaluation", exact: true }).scrollIntoViewIfNeeded();
    assert(await page.locator("#semantic-commit-form button").evaluate(element => element.scrollWidth <= element.clientWidth));
    await page.screenshot({ path: path.join(output, "transfer-confirm-mobile.png"), fullPage: true });
    results.push("mobile exact-packet review, checkbox and approval controls stay inside the viewport");
    await page.getByRole("button", { name: "Close", exact: true }).click();
    await page.getByRole("button", { name: "Access", exact: true }).click();
    await page.locator("#invite-form input[name=missions]").fill(env.options.mission);
    await page.locator("#invite-form input[name=password]").fill(password);
    await page.getByRole("button", { name: "Create Invitation", exact: true }).click();
    await page.locator("#invitation-link").waitFor({ state: "visible" });
    const token = new URL(await page.locator("#invitation-link").inputValue()).hash.split("=")[1];
    let release, observed, delivered;
    const seen = new Promise(resolve => { observed = resolve; }), held = new Promise(resolve => { release = resolve; });
    const delivery = new Promise(resolve => { delivered = resolve; }); releases.push(() => release());
    await page.route("**/api/model-evaluations", async route => {
      try { const response = await route.fetch(); observed(); await held; if (!closing) await route.fulfill({ response }); }
      catch (error) { if (!closing) routeErrors.push(error.message); }
      finally { delivered(); }
    });
    await page.getByRole("button", { name: "Model Evaluations", exact: true }).click(); await seen;
    await page.getByRole("button", { name: "Sign out", exact: true }).click();
    await page.locator("#auth").waitFor({ state: "visible" });
    await page.getByRole("button", { name: "Use Invitation", exact: true }).click();
    await auth("viewer", token); release(); await delivery; await page.unroute("**/api/model-evaluations");
    await page.waitForTimeout(100);
    assert.equal(await page.locator("#semantic-entries").textContent(), "");
    assert.equal(await page.locator("#semantic-prompt").textContent(), "");
    assert.equal(await page.getByRole("button", { name: "Model Evaluations", exact: true }).count(), 0);
    assert.equal(await page.locator("body").textContent().then(text => text.includes(current.id)), false);
    results.push("a delayed actual owner list cannot repaint the same browser after viewer registration");
    await page.getByRole("button", { name: "Sign out", exact: true }).click(); await page.locator("#auth").waitFor({ state: "visible" });
    if (await page.locator("#auth-title").textContent() === "Accept Invitation") await page.getByRole("button", { name: "Back to Sign In", exact: true }).click();
    await auth("owner"); await selectDraft();
    let releasePreview, observedPreview, deliveredPreview;
    const previewSeen = new Promise(resolve => { observedPreview = resolve; }), previewHeld = new Promise(resolve => { releasePreview = resolve; });
    const previewDelivery = new Promise(resolve => { deliveredPreview = resolve; }); releases.push(() => releasePreview());
    await page.route("**/api/model-evaluations/preview", async route => {
      try { const response = await route.fetch(); observedPreview(); await previewHeld; if (!closing) await route.fulfill({ response }); }
      catch (error) { if (!closing) routeErrors.push(error.message); }
      finally { deliveredPreview(); }
    });
    await page.getByRole("button", { name: "Evaluate Omissions", exact: true }).click(); await previewSeen;
    await page.getByRole("button", { name: "Close", exact: true }).click();
    await page.getByRole("button", { name: "Sign out", exact: true }).click(); await page.locator("#auth").waitFor({ state: "visible" });
    await auth("viewer"); releasePreview(); await previewDelivery; await page.unroute("**/api/model-evaluations/preview"); await page.waitForTimeout(100);
    assert.equal(await page.locator("#semantic-confirmation").isVisible(), false);
    assert.equal(await page.locator("#semantic-prompt").textContent(), "");
    assert.equal(await page.locator("#semantic-profile").textContent(), "");
    await page.screenshot({ path: path.join(output, "viewer-after-delayed-owner-preview.png"), fullPage: true });
    results.push("a delayed actual owner transfer preview cannot restore hidden packet or consent fields after account replacement");
    assert.deepEqual(errors, []); assert.deepEqual(routeErrors, []);
    const summary = { passed: results.length, failed: 0, results, page_errors: errors, actual_model_invocations: 0,
      provider: "measured_fake_process", actual_owner_account_touched: false, release_authorized: false };
    fs.writeFileSync(path.join(output, "browser-results.json"), JSON.stringify(summary, null, 2) + "\n"); console.log(JSON.stringify(summary, null, 2));
  } catch (error) {
    fs.writeFileSync(path.join(output, "browser-failure.json"), JSON.stringify({ error: error.stack, completed_scenarios: results,
      page_errors: errors, route_errors: routeErrors, all_scenarios_passed: false }, null, 2) + "\n"); throw error;
  } finally { closing = true; releases.forEach(release => release()); if (browser) await browser.close(); await env.service.app.close(); fs.rmSync(env.root, { recursive: true, force: true }); }
}
main().catch(error => { console.error(error.stack); process.exitCode = 1; });
