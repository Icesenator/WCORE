// Sonde observationnelle : aucune requête provider, aucune purge ni flush 26B.
function HTTP_ATTRIBUTION_SAME_EXECUTION() {
  var started = Date.now();
  var sum = function(map) { var total = 0; for (var k in (map || {})) { var v = Number(map[k]); if (!isFinite(v) || v < 0) return null; total += v; } return total; };
  var parse = function(raw) { try { var m = raw ? JSON.parse(raw) : {}; if (!m || typeof m !== 'object' || Array.isArray(m)) return { total: null, corrupt: true }; return { total: sum(m), corrupt: sum(m) === null }; } catch(e) { return { total: null, corrupt: true }; } };
  var lock = LockService.getUserLock();
  if (!lock.tryLock(100)) return JSON.stringify({startedAt:new Date(started).toISOString(),available:false,reason:'LOCK_UNAVAILABLE'});
  var daily;
  try {
    var d = new Date(started - 9 * 3600000);
    var day = d.getUTCFullYear() + '-' + (d.getUTCMonth()+1) + '-' + d.getUTCDate();
    var props = PropertiesService.getScriptProperties().getProperties();
    daily = {dayKey:day,window:'DAY_09_UTC',global:Number(props['WCORE_HTTP_DAY_'+day] || 0),hosts:parse(props['WCORE_HTTP_HOST_'+day]),triggers:parse(props['WCORE_HTTP_TRIGGER_'+day]),readMode:'ONE_GET_PROPERTIES_UNDER_USER_LOCK',flush:'NONE',buffer:'OTHER_EXECUTIONS_NOT_OBSERVABLE'};
  } finally { lock.releaseLock(); }
  var snapshot = HttpCounter.snapshot();
  var rolling = {window:'ROLLING_HOURLY_BUCKETS_24H',total:snapshot.total,hostTotal:sum(snapshot.hosts),triggerTotal:sum(snapshot.categories),available:snapshot.available,corrupt:snapshot.corrupt || false,dropped:snapshot.dropped,countSeparately:HttpCounter.count(),buffer:'INCLUDED_BY_SNAPSHOT; PROBE_GENERATES_NO_CALL'};
  return JSON.stringify({startedAt:new Date(started).toISOString(),endedAt:new Date().toISOString(),daily:daily,rolling:rolling,crossWindowEqualityRequired:false,externalHttpCalls:0});
}
