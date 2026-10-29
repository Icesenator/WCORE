// v1 — métadonnées uniquement ; ne convertit jamais un prix.
function _fxMetadataMerge_(existing, incoming, rate) {
  var candidate = incoming && incoming.fxMetadata;
  if (candidate && Number(candidate.rate) === Number(rate)) return candidate;
  candidate = existing && existing.fxMetadata;
  return candidate && Number(candidate.rate) === Number(rate) ? candidate : null;
}
function _fxMetadataLabel_(rate, metadata, nowMs) {
  var n = Number(rate);
  if (!isFinite(n) || n <= 0) return 'USD->EUR=N/A; available=NO; applied=UNKNOWN; provenance=UNKNOWN';
  var prefix = 'USD->EUR=' + n.toFixed(4);
  if (!metadata || Number(metadata.rate) !== n) return prefix + '; available=YES; applied=UNKNOWN; provenance=UNKNOWN; freshness=UNKNOWN';
  var sources = Array.isArray(metadata.sources) ? metadata.sources : [];
  var names = sources.map(function(s) { return String(s.source || 'UNKNOWN'); }).join(',') || 'UNKNOWN';
  var collected = Number(metadata.sourceCollectedAt);
  var written = Number(metadata.cacheWrittenAt);
  var ttl = Number(metadata.ttlMs);
  var now = Number(nowMs) || Date.now();
  var freshness = collected > 0 && written > 0 && ttl > 0 && now >= collected && now >= written ? ((now-collected < ttl && now-written < ttl) ? 'FRESH' : 'STALE') : 'UNKNOWN';
  return prefix + '; available=YES; applied=' + (metadata.applied === true ? 'YES' : metadata.applied === false ? 'NO' : 'UNKNOWN') + '; sources=' + names + '; selection=' + String(metadata.selection || 'UNKNOWN') + '; collectedAt=' + (collected > 0 ? new Date(collected).toISOString() : 'UNKNOWN') + '; cacheWrittenAt=' + (written > 0 ? new Date(written).toISOString() : 'UNKNOWN') + '; freshness=' + freshness + '; freshnessEvaluatedAt=' + new Date(now).toISOString() + '; freshnessScope=AT_RENDER';
}
