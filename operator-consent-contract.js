const crypto = require("node:crypto");
const { canonicalJsonBytes } = require("./verifier-identity-evidence");
const { NONE } = require("./order-adoption-contract");
const { strictBase64 } = require("./verification-attestation");
const digest = value => crypto.createHash("sha256").update(canonicalJsonBytes(value)).digest("hex");
function unsigned(record) { const value = { ...record }; delete value.signature; return value; }
function keyDigest(publicKey) {
  const key = publicKey instanceof crypto.KeyObject ? publicKey : crypto.createPublicKey(publicKey);
  return crypto.createHash("sha256").update(key.export({ type: "spki", format: "der" })).digest("hex");
}
function signConsent(value, privateKey) {
  const key = crypto.createPrivateKey(privateKey), body = unsigned(value);
  return { ...body, signature: { algorithm: "Ed25519", key_sha256: keyDigest(crypto.createPublicKey(key)),
    value: crypto.sign(null, canonicalJsonBytes(body), key).toString("base64") } };
}
function consentIssues(value, type) {
  if (type !== "operator-consent-record") return [];
  const issues = [], add = code => issues.push({ code, severity: "critical", path: "$", message: code });
  if (value.id !== `OCR-${value.challenge_id}` || value.request.id !== `OADR-${value.challenge_id}` ||
      value.decision_log_id !== `DL-OPERATOR-${value.challenge_id}` || value.mission_id !== value.request.mission_id ||
      value.wave_id !== value.request.wave_id || digest(value.request.decision_ref) !== digest(NONE)) add("OPERATOR_CONSENT_SCOPE_BINDING_INVALID");
  const start = Date.parse(value.created_at), end = Date.parse(value.expires_at);
  if (!Number.isFinite(start) || !Number.isFinite(end) || end <= start || end - start > 120000) add("OPERATOR_CONSENT_VALIDITY_INVALID");
  return issues;
}
function verifyConsent(record, trustedPublicKey, decision) {
  const validation = require("./validator-cli-prototype/validate").validatePayload(record, "operator-consent-record");
  if (!validation.valid) throw new Error("OPERATOR_CONSENT_SCHEMA_INVALID");
  const publicKey = crypto.createPublicKey(trustedPublicKey);
  const signature = strictBase64(record.signature.value);
  if (publicKey.asymmetricKeyType !== "ed25519" || record.signature.key_sha256 !== keyDigest(publicKey) ||
      !signature || signature.length !== 64 || !crypto.verify(null, canonicalJsonBytes(unsigned(record)), publicKey, signature)) {
    throw new Error("OPERATOR_CONSENT_SIGNATURE_INVALID");
  }
  if (decision && (decision.id !== record.decision_log_id || digest(decision) !== record.decision_payload_sha256)) {
    throw new Error("OPERATOR_CONSENT_DECISION_SUBSTITUTED");
  }
  return { valid: true, human_final_decision_authority: "USER", execution_authorized: false, release_authorized: false };
}
module.exports = { consentIssues, digest, keyDigest, signConsent, verifyConsent };
