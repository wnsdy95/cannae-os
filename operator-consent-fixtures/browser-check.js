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
      ["mobile", { width: 390, height: 844 }, "reject", "Plan rejected"], ["session-race", { width: 390, height: 844 }, "reject", null],
      ["malformed-preview", { width: 1440, height: 1000 }, "reject", null]]) {
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
        if (name === "malformed-preview") {
          await page.route("**/api/order-decisions/preview", async route => {
            const response = await route.fetch(); assert.equal(response.status(), 200);
            const body = await response.json(); body.review.semantic_review.coverage.coverage.pop();
            await route.fulfill({ status: 200, contentType: "application/json", body: JSON.stringify(body) });
          });
          await page.getByRole("button", { name: "Preview Decision", exact: true }).click();
          await page.locator("#detail-error").filter({ hasText: "CONSOLE_COVERAGE_DISPLAY_INVALID" }).waitFor();
          assert.equal(await page.locator("#decision-confirmation").isVisible(), false);
          assert.equal(await page.locator("#coverage-rows").textContent(), ""); assert.equal(await page.locator("#consent-content").textContent(), "");
          assert.equal(await page.evaluate(() => decisionPreview), null);
          results.push("malformed-preview: a response missing one coverage row cannot expose an actionable partial approval display");
          continue;
        }
        if (name === "session-race") {
          const password = "synthetic-browser-owner-password-2026";
          const token = await page.evaluate(async password => {
            const session = await (await fetch("/api/session")).json();
            const response = await fetch("/api/invites", { method: "POST", headers: { "Content-Type": "application/json", "X-CSRF-Token": session.csrf_token }, body: JSON.stringify({ password, missions: ["MIS-ADOPTION"] }) });
            if (!response.ok) throw new Error("Synthetic viewer invitation failed"); return (await response.json()).token;
          }, password);
          const registration = await browser.newContext();
          try {
            const viewer = await registration.newPage(); await viewer.goto(`${service.origin()}/#invite=${token}`);
            await viewer.locator("#auth-form input[name=username]").fill("testviewer"); await viewer.locator("#auth-form input[name=password]").fill(password);
            await viewer.locator("#auth-form button[type=submit]").click(); await viewer.locator("#workspace").waitFor({ state: "visible" });
          } finally { await registration.close(); }
          let captured, release, delivered;
          const received = new Promise(resolve => { captured = resolve; }), gate = new Promise(resolve => { release = resolve; });
          const finished = new Promise(resolve => { delivered = resolve; });
          await page.route("**/api/order-decisions/preview", async route => {
            const response = await route.fetch(), body = await response.text(); assert.equal(response.status(), 200);
            captured(); await gate; await route.fulfill({ status: 200, contentType: "application/json", body }); delivered();
          });
          try {
            await page.getByRole("button", { name: "Preview Decision", exact: true }).click(); await received;
            await page.getByRole("button", { name: "Close", exact: true }).click();
            await page.getByRole("button", { name: "Sign out", exact: true }).click(); await page.locator("#auth").waitFor({ state: "visible" });
            await page.locator("#auth-form input[name=username]").fill("testviewer"); await page.locator("#auth-form input[name=password]").fill(password);
            await page.locator("#auth-form button[type=submit]").click(); await page.locator("#identity").filter({ hasText: "testviewer" }).waitFor();
            release(); await finished; await page.evaluate(() => new Promise(resolve => requestAnimationFrame(() => requestAnimationFrame(resolve))));
            assert.equal(await page.locator("#coverage-review").isVisible(), false);
            for (const id of ["coverage-summary", "coverage-binding", "coverage-rows", "coverage-source-rows", "coverage-order", "coverage-plan", "consent-content"]) assert.equal(await page.locator(`#${id}`).textContent(), "");
            assert.equal(await page.evaluate(() => decisionPreview), null); assert.equal(await page.locator("#decision-confirmation").isVisible(), false);
            await page.screenshot({ path: path.join(output, "late-owner-preview-viewer.png"), fullPage: true });
            results.push("session-race: delayed real owner approval response cannot restore coverage, source, plan, raw subject or consent in a viewer session");
            continue;
          } finally { release(); }
        }
        const previewResponse = page.waitForResponse(response => new URL(response.url()).pathname === "/api/order-decisions/preview");
        await page.getByRole("button", { name: "Preview Decision", exact: true }).click();
        await page.locator("#decision-confirmation").waitFor({ state: "visible" });
        const prepared = await (await previewResponse).json();
        const review = JSON.parse(await page.locator("#consent-content").textContent());
        assert.deepEqual(review.proposal.request.plan, env.plan); assert.equal(review.request.disposition, disposition);
        assert.equal(review.semantic_review.coverage.review_class, "human_inventory_and_coverage");
        assert.equal(review.semantic_review.coverage.model_calibrated_for_admission, false);
        assert(review.semantic_review.inventory.requirements.some(item => item.kind === "prohibition"));
        assert.equal(review.request.schema_version, "0.2");
        assert.equal(new URL(page.url()).hash, "");
        assert.equal(await page.locator("#coverage-review").isVisible(), true);
        assert.match(await page.locator("#coverage-summary").textContent(), new RegExp(`${review.semantic_review.inventory.requirements.length} requirements`));
        assert.equal(await page.locator("#coverage-rows tr").count(), review.semantic_review.coverage.coverage.length);
        const before = JSON.stringify(await page.evaluate(() => decisionPreview));
        await page.locator("#coverage-target").selectOption("TASK-S2"); await page.locator("#coverage-disposition").selectOption("not_applicable");
        const notApplicable = review.semantic_review.coverage.coverage.filter(item => item.target_id === "TASK-S2" && item.disposition === "not_applicable");
        assert.equal(await page.locator("#coverage-rows tr").count(), notApplicable.length);
        assert.match(await page.locator("#coverage-count").textContent(), new RegExp(`${notApplicable.length} of ${review.semantic_review.coverage.coverage.length}`));
        await page.getByRole("tab", { name: "Source", exact: true }).click();
        const quotes = await page.locator("#coverage-source-rows blockquote").allTextContents();
        assert.deepEqual(quotes, review.semantic_review.inventory.fragments.map(item => item.quote));
        await page.getByRole("tab", { name: "Source", exact: true }).press("ArrowRight");
        assert.equal(await page.getByRole("tab", { name: "Plan", exact: true }).getAttribute("aria-selected"), "true");
        assert.deepEqual(JSON.parse(await page.locator("#coverage-plan").textContent()), env.plan);
        assert.deepEqual(JSON.parse(await page.locator("#coverage-order").textContent()), review.draft.opord);
        await page.getByRole("tab", { name: "Plan", exact: true }).press("Home");
        await page.locator("#coverage-target").selectOption(""); await page.locator("#coverage-disposition").selectOption("");
        assert.equal(JSON.stringify(await page.evaluate(() => decisionPreview)), before);
        assert.deepEqual(JSON.parse(await page.locator("#consent-content").textContent()), prepared.review);
        assert(await page.evaluate(() => { const element = document.querySelector("#coverage-review"); return element.scrollWidth <= element.clientWidth; }));
        await page.screenshot({ path: path.join(output, `${name}-preview.png`), fullPage: true });
        await page.evaluate(review => {
          const synthetic = structuredClone(review), { inventory, coverage } = synthetic.semantic_review;
          const originals = [...inventory.requirements];
          for (const requirement of originals) {
            const copy = structuredClone(requirement); copy.id += "-DISPLAY"; copy.instruction += '\n<img src=x onerror="window.coverageXss=true">';
            inventory.requirements.push(copy);
            for (const id of copy.source_fragment_ids) inventory.fragments.find(item => item.id === id).requirement_ids.push(copy.id);
            for (const row of [...coverage.coverage].filter(item => item.requirement_id === requirement.id)) coverage.coverage.push({ ...row, requirement_id: copy.id });
          }
          for (const classification of ["context", "unknown"]) {
            const start = inventory.fragments.at(-1).end_byte, quote = `<img src=x onerror="window.coverageXss=true"> Synthetic ${classification}.\n`;
            inventory.fragments.push({ id: `FR-${classification}`, start_byte: start, end_byte: start + new TextEncoder().encode(quote).length, quote, classification, requirement_ids: [], rationale: "Synthetic display-only fragment." });
          }
          coverageUi.show(synthetic);
        }, review);
        assert.equal(await page.locator("#coverage-rows tr").count(), 25);
        await page.getByRole("button", { name: "Next review page", exact: true }).click();
        assert.equal(await page.locator("#coverage-rows tr").count(), review.semantic_review.coverage.coverage.length * 2 - 25);
        assert.match(await page.locator("#coverage-rows").textContent(), /<img src=x/);
        assert.equal(await page.locator("#coverage-review img:not([src^='/icons/'])").count(), 0);
        assert.equal(await page.evaluate(() => window.coverageXss), undefined);
        await page.getByRole("tab", { name: "Source", exact: true }).click();
        assert.equal(await page.locator("#coverage-source-rows tr").count(), review.semantic_review.inventory.fragments.length + 2);
        assert.match(await page.locator("#coverage-source-rows").textContent(), /Synthetic context/); assert.match(await page.locator("#coverage-source-rows").textContent(), /Synthetic unknown/);
        assert(await page.evaluate(() => { const element = document.querySelector("#coverage-review"); return element.scrollWidth <= element.clientWidth; }));
        await page.screenshot({ path: path.join(output, `${name}-synthetic-source-display.png`), fullPage: true });
        await page.evaluate(review => coverageUi.show(review), review);
        assert.equal(JSON.stringify(await page.evaluate(() => decisionPreview)), before);
        await page.locator("#decision-commit-form textarea[name=rationale]").fill("Synthetic browser decision only; not real USER consent.");
        await page.locator("#decision-commit-form input[name=password]").fill("synthetic-browser-owner-password-2026");
        const commitRequest = page.waitForRequest(request => new URL(request.url()).pathname === "/api/order-decisions/commit");
        await page.locator("#decision-commit-form button[type=submit]").click();
        const committed = (await commitRequest).postDataJSON();
        assert.deepEqual(Object.keys(committed).sort(), ["challenge_id", "nonce", "password", "rationale"]);
        assert.equal(committed.challenge_id, prepared.challenge_id); assert.equal(committed.nonce, prepared.nonce);
        await page.locator("#decision-status").filter({ hasText: expected }).waitFor({ timeout: 45000 });
        assert.equal(await page.locator("#detail-title").textContent(), expected);
        assert(await page.getByRole("button", { name: "Close", exact: true }).isVisible());
        assert.equal(await page.locator("#decision-commit-form input[name=password]").inputValue(), "");
        assert.equal(await page.locator("#coverage-rows").textContent(), ""); assert.equal(await page.locator("#coverage-plan").textContent(), "");
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
        results.push(`${name}: real authenticated ${disposition}, exact source/receiver/plan display, filter-invariant consent, synthetic pagination/inert markup, controller result and read-only outcome replay`);
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
