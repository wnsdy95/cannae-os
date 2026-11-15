const path = require("node:path");
const { isDeepStrictEqual } = require("node:util");
const packets = require("./project-document-packet");

const fail = code => { throw new Error(code); };
const flags = () => ({ authorization_verified: false, execution_authorized: false,
  release_authorized: false, receiver_acceptance_verified: false });

function guarded(operation) {
  try { return operation(); }
  catch (error) {
    fail(/^PROJECT_(?:PACKET|REVIEW|READER)_[A-Z_]+$/.test(error.message)
      ? error.message : "PROJECT_READER_INPUT_UNAVAILABLE");
  }
}

function createDocumentReader(options) {
  return guarded(() => {
    if (!options || !isDeepStrictEqual(Object.keys(options).sort(),
      ["packet_path", "packet_sha256", "recipient", "repository"]) ||
      typeof options.packet_path !== "string" || !path.isAbsolute(options.packet_path) ||
      typeof options.repository !== "string" || !path.isAbsolute(options.repository) ||
      typeof options.packet_sha256 !== "string" || !/^[a-f0-9]{64}$/.test(options.packet_sha256) ||
      !options.recipient || typeof options.recipient !== "object" || Array.isArray(options.recipient)) {
      fail("PROJECT_READER_BINDING_INVALID");
    }
    // Caller-owned configuration and returned catalogs must not change the binding.
    const binding = structuredClone(options);
    const current = () => {
      const bytes = packets.readOutput(binding.packet_path, 1024 * 1024);
      if (packets.sha256(bytes) !== binding.packet_sha256) fail("PROJECT_PACKET_DIGEST_MISMATCH");
      const packet = JSON.parse(bytes);
      if (!isDeepStrictEqual(packet.request?.recipient, binding.recipient)) fail("PROJECT_READER_RECIPIENT_MISMATCH");
      packets.inspect(binding.packet_path, binding.packet_sha256, binding.repository);
      return packets.recipientData(packet);
    };
    current();
    return Object.freeze({
      catalog: () => guarded(() => {
        const data = current();
        return { ...data, documents: data.documents.map(({ content, ...row }) => row),
          required_source_count: data.documents.filter(row => row.required).length, ...flags() };
      }),
      read: sourceId => guarded(() => {
        if (typeof sourceId !== "string" || !sourceId.trim()) fail("PROJECT_READER_SOURCE_INVALID");
        const data = current(), document = data.documents.find(row => row.id === sourceId);
        if (!document || document.delivery_mode === "reference_only") fail("PROJECT_READER_SOURCE_NOT_READABLE");
        return { document, ...flags() };
      })
    });
  });
}

module.exports = { createDocumentReader };
