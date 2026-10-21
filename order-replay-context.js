let activeReplay = null;

// Synchronous operation scope; live publication starts a separate appraisal.
function withinOrderReplay(operation, fresh = false) {
  const previous = activeReplay;
  activeReplay = !fresh && previous ? previous : new Map();
  try { return operation(); }
  finally { activeReplay = previous; }
}

function retainedOrderReplay(store, key, compute) {
  if (!activeReplay) return compute();
  const revisions = [...store.manifestHistory.keys()];
  const tip = store.manifestHistory.get(Math.max(...revisions));
  const identity = `${store.artifactRoot}:${store.verification.repository.identity_fingerprint}:${tip}:${key}`;
  if (!activeReplay.has(identity)) activeReplay.set(identity, compute());
  return activeReplay.get(identity);
}

module.exports = { withinOrderReplay, retainedOrderReplay };
