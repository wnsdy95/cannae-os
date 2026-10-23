#!/usr/bin/env node
const assert = require("node:assert/strict"), fs = require("node:fs"), path = require("node:path");
const { chromium } = require("playwright");
const { createConsole } = require("../operator-console-server");
const support = require("../order-adoption-fixtures/support");
const { orderForPlan } = require("../order-adoption-controller");

async function main() {
  assert.equal(process.argv[2], "--output"); assert(process.argv[3]);
  const output = path.resolve(process.argv[3]); fs.mkdirSync(output, { recursive: true });
  const browser = await chromium.launch({ headless: true }), results = [], pageErrors = [];
  try {
    for (const [name, viewport, disposition, expected] of [["desktop", { width: 1440, height: 1000 }, "approve", "Plan adopted"],
      ["mobile", { width: 390, height: 844 }, "reject", "Plan rejected"]]) {
      const env = support.environment(Date.now() - 120000); let service, context;
      try {
        support.propose(env); support.retainBriefs(env); support.rehearse(env);
        service = await createConsole({ repository: env.options.repository, artifactRoot: env.options.artifactRoot,
          stateDir: path.join(fs.realpathSync(env.root), "private"), port: 0 });
        await service.app.listen({ host: "127.0.0.1", port: 0 });
        context = await browser.newContext({ viewport }); const page = await context.newPage();
        page.on("pageerror", error => pageErrors.push(error.message));
        await page.goto(`${service.origin()}/#setup=${service.auth.createBootstrap()}`);
        await page.locator("#auth-form input[name=username]").fill("testowner");
        await page.locator("#auth-form input[name=password]").fill("synthetic-browser-owner-password-2026");
        await page.locator("#auth-form button[type=submit]").click();
        await page.locator("#workspace").waitFor({ state: "visible" });
        await page.getByRole("button", { name: "Order Proposals", exact: true }).click();
        await page.getByRole("button", { name: env.proposed.proposal.id, exact: true }).click();
        await page.locator("#decision-preview-form").waitFor({ state: "visible" });
        await page.locator(`#decision-preview-form input[value=${disposition}]`).check();
        if (disposition === "approve") await page.locator("#rehearsal-select").selectOption({ label: env.rehearsal.id });
        await page.getByRole("button", { name: "Preview Decision", exact: true }).click();
        await page.locator("#decision-confirmation").waitFor({ state: "visible" });
        const review = JSON.parse(await page.locator("#consent-content").textContent());
        assert.deepEqual(review.proposal.request.plan, env.plan); assert.equal(review.request.disposition, disposition);
        assert.equal(review.semantic_review.coverage.review_class, "human_inventory_and_coverage");
        assert.equal(review.semantic_review.coverage.model_calibrated_for_admission, false);
        assert(review.semantic_review.inventory.requirements.some(item => item.kind === "prohibition"));
        assert.equal(review.request.schema_version, "0.2");
        assert.equal(new URL(page.url()).hash, "");
        await page.screenshot({ path: path.join(output, `${name}-preview.png`), fullPage: true });
        await page.locator("#decision-commit-form textarea[name=rationale]").fill("Synthetic browser decision only; not real USER consent.");
        await page.locator("#decision-commit-form input[name=password]").fill("synthetic-browser-owner-password-2026");
        await page.locator("#decision-commit-form button[type=submit]").click();
        await page.locator("#decision-status").filter({ hasText: expected }).waitFor({ timeout: 45000 });
        assert.equal(await page.locator("#detail-title").textContent(), expected);
        assert(await page.getByRole("button", { name: "Close", exact: true }).isVisible());
        assert.equal(await page.locator("#decision-commit-form input[name=password]").inputValue(), "");
        const result = JSON.parse(await page.locator("#detail-content").textContent());
        assert.equal(result.execution_authorized, false); assert.equal(result.release_authorized, false);
        if (disposition === "approve") assert.equal(orderForPlan(env.plan, env.options).payload.id, result.adoption_ref.artifact_id);
        else assert.throws(() => orderForPlan(env.plan, env.options), /ORDER_ADOPTION_REQUIRED/);
        await page.screenshot({ path: path.join(output, `${name}-applied.png`), fullPage: true });
        await page.getByRole("button", { name: "Close", exact: true }).click();
        await page.getByRole("button", { name: "Decisions", exact: true }).click();
        await page.getByRole("cell", { name: "applied", exact: true }).waitFor();
        await page.screenshot({ path: path.join(output, `${name}-history.png`), fullPage: true });
        const retainedCount = require("../campaign-supervisor").loadVerifiedStore(env.options.repository, env.options.artifactRoot).manifest.artifacts.length;
        await page.locator("#decisions .artifact-button").first().click();
        await page.getByRole("button", { name: "Inspect Outcome", exact: true }).click();
        await page.locator("#detail-title").filter({ hasText: "Recorded Outcome" }).waitFor({ timeout: 45000 });
        const inspected = JSON.parse(await page.locator("#detail-content").textContent());
        assert.equal(inspected.outcome, "applied"); assert.deepEqual(inspected.adoption_ref, result.adoption_ref);
        assert.equal(inspected.mutation_authorized, false); assert.equal(inspected.execution_authorized, false);
        assert.equal(require("../campaign-supervisor").loadVerifiedStore(env.options.repository, env.options.artifactRoot).manifest.artifacts.length, retainedCount);
        await page.screenshot({ path: path.join(output, `${name}-inspected.png`), fullPage: true });
        assert(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth));
        assert.equal(await page.locator("#detail-error").textContent(), "");
        results.push(`${name}: real authenticated ${disposition} preview, controller result, action history and read-only outcome replay`);
      } finally {
        if (context) await context.close(); if (service) await service.app.close(); fs.rmSync(env.root, { force: true, recursive: true });
      }
    }
    assert.deepEqual(pageErrors, []);
    const result = { passed: results.length, failed: 0, results, page_errors: pageErrors, real_user_consent_created: false, execution_authorized: false, release_authorized: false };
    fs.writeFileSync(path.join(output, "browser-results.json"), JSON.stringify(result, null, 2) + "\n"); console.log(JSON.stringify(result, null, 2));
  } finally { await browser.close(); }
}
main().catch(error => { console.error(error.stack); process.exitCode = 1; });
