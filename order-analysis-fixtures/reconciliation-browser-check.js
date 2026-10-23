#!/usr/bin/env node
const fs = require("node:fs"), path = require("node:path"), assert = require("node:assert/strict"), { chromium } = require("playwright");
const { environment, password, row } = require("./reconciliation-support"), { digest } = require("../operator-consent-contract");
async function main() {
  assert.equal(process.argv[2], "--output"); assert(process.argv[3]); const output = path.resolve(process.argv[3]); fs.mkdirSync(output, { recursive: true });
  const env = await environment({ initialize: false, model: "analysis-valid", port: 0 }), generator = require("../order-analysis-generator"), compile = generator.compileAnalysis;
  const results = [], errors = [], routeErrors = [], releases = []; let browser, page, closing = false, commits = 0, compiled = 0;
  generator.compileAnalysis = (...args) => { compile(...args); compiled++; throw new Error("SEMANTIC_ANALYSIS_PUBLICATION_UNKNOWN"); };
  try {
    await env.service.app.listen({ host: "127.0.0.1", port: 0 }); browser = await chromium.launch({ headless: true }); page = await browser.newPage({ viewport: { width: 1440, height: 1000 } });
    page.on("pageerror", error => errors.push(error.message)); page.on("request", request => { if (request.method() === "POST" && request.url().endsWith("/api/analysis-reconciliations/commit")) commits++; });
    await page.goto(`${env.service.origin()}/#setup=${env.service.auth.createBootstrap()}`);
    async function authenticate(username, token) {
      await page.locator("#auth-form input[name=username]").fill(username); await page.locator("#auth-form input[name=password]").fill(password);
      if (token) await page.locator("#auth-form input[name=token]").fill(token);
      await page.locator("#auth-form button[type=submit]").click(); await page.locator("#workspace").waitFor({ state: "visible" });
    }
    async function collectFailure(delayEvidence = false) {
      let releaseEvidence, observedEvidence, deliveredEvidence;
      const evidenceUrl = url => url.pathname === "/api/evidence";
      const observed = new Promise(resolve => { observedEvidence = resolve; }), heldEvidence = new Promise(resolve => { releaseEvidence = resolve; }), delivered = new Promise(resolve => { deliveredEvidence = resolve; });
      if (delayEvidence) {
        releases.push(releaseEvidence);
        await page.route(evidenceUrl, async route => { try { const response = await route.fetch(); assert.equal(response.status(), 200); observedEvidence(); await heldEvidence; if (!closing) await route.fulfill({ response }); }
          catch (error) { if (!closing) routeErrors.push(error.message); } finally { deliveredEvidence(); } });
      }
      await page.getByRole("button", { name: "Evidence", exact: true }).click();
      if (delayEvidence) {
        await observed; assert.equal(await page.locator("#artifacts button").count(), 0); assert.equal(await page.locator("#revision").textContent(), "");
        await page.screenshot({ path: path.join(output, "evidence-refresh-fences-stale-list.png"), fullPage: true });
        releaseEvidence(); await delivered; await page.unroute(evidenceUrl);
        results.push("actual manifest refresh removes prior evidence actions until the new verified list arrives");
      }
      await page.getByRole("button", { name: env.request.id, exact: true }).click();
      await page.getByRole("button", { name: "Propose Order Analysis", exact: true }).click(); await page.locator("#semantic-confirmation").waitFor({ state: "visible" });
      await page.locator("#semantic-commit-form input[name=acknowledge]").check(); await page.locator("#semantic-commit-form textarea[name=rationale]").fill("Synthetic browser approves one exact proposed analysis.");
      await page.locator("#semantic-commit-form input[name=password]").fill(password); await page.getByRole("button", { name: "Approve One Analysis", exact: true }).click();
      await page.locator("#detail-title").filter({ hasText: "Order Analysis / held" }).waitFor({ timeout: 20000 });
      const value = JSON.parse(await page.locator("#detail-content").textContent()); assert.equal(value.result_verified, true); return value;
    }
    async function openReview() { await page.getByRole("button", { name: "Review Model Hold", exact: true }).click(); await page.locator("#model-hold-confirmation").waitFor({ state: "visible" }); }
    async function acknowledgmentFields() {
      await page.locator("#model-hold-form input[name=acknowledge]").check();
      await page.locator("#model-hold-form textarea[name=rationale]").fill("Synthetic analysis acknowledgment <img src=x onerror=window.compromised=true> preserves the draft and failure.");
      await page.locator("#model-hold-form input[name=password]").fill(password);
    }
    async function acknowledged() { await page.waitForFunction(() => { try { return JSON.parse(document.querySelector("#detail-content").textContent).reconciliation_verified === true; } catch { return false; } }); }
    await authenticate("owner"); const first = await collectFailure(), original = digest(row(env, first.id));
    assert.equal(first.result.error, "SEMANTIC_ANALYSIS_PUBLICATION_UNKNOWN"); assert.equal(first.result.draft_ref, null); assert.equal(compiled, 1);
    results.push("actual request-analysis transfer can fail after real compiler publication while preserving the held original");
    const reviewUrl = `**/api/order-analyses/${first.id}/reconciliation/preview`;
    for (const malformed of ["purpose", "publication"]) {
      await page.route(reviewUrl, async route => { const response = await route.fetch(), value = await response.json();
        if (malformed === "purpose") value.purpose = "semantic_omission"; else value.subject.publication.publication_state = "not_in_verified_manifest";
        await route.fulfill({ response, json: value }); });
      await page.getByRole("button", { name: "Review Model Hold", exact: true }).click(); await page.locator("#detail-error").filter({ hasText: "CONSOLE_MODEL_RECONCILIATION_PREVIEW_INVALID" }).waitFor();
      assert.equal(await page.locator("#model-hold-confirmation").isVisible(), false); assert.equal(await page.locator("#model-hold-subject").textContent(), "");
      assert.equal(commits, 0); await page.unroute(reviewUrl);
      results.push(`misleading ${malformed} projection cannot expose an actionable analysis acknowledgment`);
    }
    await openReview(); const subject = JSON.parse(await page.locator("#model-hold-subject").textContent());
    assert.equal(subject.original_action_sha256, original); assert.equal(subject.publication.publication_state, "published"); assert(subject.publication.draft_ref.sha256);
    assert.equal(subject.publication.draft_adoption_authorized, false); assert.equal(subject.publication.artifact_settlement_authorized, false);
    await page.screenshot({ path: path.join(output, "analysis-hold-review-desktop.png"), fullPage: true });
    results.push("actual owner review binds the published draft and explicitly excludes adoption, cleanup, provider billing and cancellation");
    await page.route("**/api/analysis-reconciliations/commit", async route => { const response = await route.fetch(); assert.equal(response.status(), 200); await route.abort("failed"); });
    await acknowledgmentFields(); await page.locator("#model-hold-form input[name=acknowledge_publication]").check();
    await page.getByRole("button", { name: "Acknowledge Failed Transfer", exact: true }).click(); await acknowledged(); await page.unroute("**/api/analysis-reconciliations/commit");
    const current = JSON.parse(await page.locator("#detail-content").textContent()); assert.equal(current.state, "held"); assert.equal(current.hold_preserved, false);
    assert.equal(current.reconciliation.type, "OperatorAnalysisReconciliationRecord"); assert.equal(digest(row(env, first.id)), original); assert.equal(commits, 1); assert.equal(compiled, 1);
    assert.equal(await page.locator("#model-hold-form input[name=password]").inputValue(), ""); assert.equal(await page.evaluate(() => window.compromised), undefined);
    await page.screenshot({ path: path.join(output, "analysis-failure-preserved-after-ack.png"), fullPage: true });
    results.push("lost actual acknowledgment response is inspected without model/compiler replay or rewriting the original failure");
    await page.getByRole("button", { name: "Close", exact: true }).click(); const second = await collectFailure(true); assert.notEqual(second.id, first.id); assert.equal(compiled, 2);
    await page.setViewportSize({ width: 390, height: 844 }); await openReview(); await acknowledgmentFields();
    await page.getByRole("button", { name: "Acknowledge Failed Transfer", exact: true }).scrollIntoViewIfNeeded();
    assert(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth));
    assert(await page.locator("#detail").evaluate(element => { const r = element.getBoundingClientRect(); return r.left >= 0 && r.right <= innerWidth && r.bottom <= innerHeight; }));
    assert(await page.locator("#model-hold-form button").evaluate(element => element.scrollWidth <= element.clientWidth));
    await page.getByRole("button", { name: "Acknowledge Failed Transfer", exact: true }).click(); assert.equal(commits, 1);
    await page.screenshot({ path: path.join(output, "analysis-hold-review-mobile.png"), fullPage: true });
    await page.locator("#model-hold-form input[name=acknowledge_publication]").check(); await page.getByRole("button", { name: "Acknowledge Failed Transfer", exact: true }).click(); await acknowledged();
    assert.equal(commits, 2); assert.equal(compiled, 2);
    results.push("mobile review fits the viewport and cannot POST until the separate draft-publication acknowledgment is checked");
    await page.getByRole("button", { name: "Close", exact: true }).click(); const third = await collectFailure();
    await page.getByRole("button", { name: "Close", exact: true }).click(); await page.getByRole("button", { name: "Access", exact: true }).click();
    await page.locator("#invite-form input[name=missions]").fill(env.options.mission); await page.locator("#invite-form input[name=password]").fill(password);
    await page.getByRole("button", { name: "Create Invitation", exact: true }).click(); await page.locator("#invitation-link").waitFor({ state: "visible" });
    const token = new URL(await page.locator("#invitation-link").inputValue()).hash.split("=")[1];
    await page.getByRole("button", { name: "Model Actions", exact: true }).click(); await page.getByRole("button", { name: third.id, exact: true }).click();
    let release, seen, delivered; const observed = new Promise(resolve => { seen = resolve; }), held = new Promise(resolve => { release = resolve; }), delivery = new Promise(resolve => { delivered = resolve; }); releases.push(release);
    const delayed = `**/api/order-analyses/${third.id}/reconciliation/preview`;
    await page.route(delayed, async route => { try { const response = await route.fetch(); assert.equal(response.status(), 200); seen(); await held; if (!closing) await route.fulfill({ response }); }
      catch (error) { if (!closing) routeErrors.push(error.message); } finally { delivered(); } });
    await page.getByRole("button", { name: "Review Model Hold", exact: true }).click(); await observed;
    await page.getByRole("button", { name: "Close", exact: true }).click(); await page.getByRole("button", { name: "Sign out", exact: true }).click(); await page.locator("#auth").waitFor({ state: "visible" });
    await page.getByRole("button", { name: "Use Invitation", exact: true }).click(); await authenticate("viewer", token); release(); await delivery; await page.unroute(delayed); await page.waitForTimeout(100);
    assert.equal(await page.locator("#model-hold-confirmation").isVisible(), false); assert.equal(await page.locator("#model-hold-subject").textContent(), "");
    assert.equal(await page.locator("#model-hold-meta").textContent(), ""); assert.equal(await page.locator("#model-hold-form input[name=password]").inputValue(), "");
    assert.equal(await page.locator("#model-hold-form input[name=acknowledge_publication]").isChecked(), false); assert.equal(await page.locator("#analysis-publication-check").isVisible(), false);
    assert.equal(await page.locator("body").textContent().then(text => text.includes(third.id)), false);
    await page.screenshot({ path: path.join(output, "viewer-after-delayed-analysis-hold.png"), fullPage: true });
    results.push("delayed owner analysis recovery cannot restore a publication packet, password or approval after viewer sign-in");
    assert.equal(compiled, 3); assert.deepEqual(errors, []); assert.deepEqual(routeErrors, []);
    const summary = { passed: results.length, failed: 0, results, page_errors: errors, acknowledgment_posts: commits, synthetic_compiler_calls: compiled,
      actual_model_invocations: 0, real_owner_actions: 0, release_authorized: false };
    fs.writeFileSync(path.join(output, "browser-results.json"), JSON.stringify(summary, null, 2) + "\n"); console.log(JSON.stringify(summary, null, 2));
  } catch (error) {
    if (page && !page.isClosed()) { try { await page.screenshot({ path: path.join(output, "analysis-hold-browser-failure.png"), fullPage: true, timeout: 5000 }); } catch { /* Preserve the original browser failure. */ } }
    fs.writeFileSync(path.join(output, "browser-failure.json"), JSON.stringify({ error: error.stack, completed_scenarios: results, page_errors: errors, route_errors: routeErrors, all_scenarios_passed: false }, null, 2) + "\n"); throw error;
  } finally { closing = true; releases.forEach(release => release()); generator.compileAnalysis = compile; if (browser) await browser.close(); await env.service.app.close(); fs.rmSync(env.root, { recursive: true, force: true }); }
}
main().catch(error => { console.error(error.stack); process.exitCode = 1; });
