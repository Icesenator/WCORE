 = Get-Content -Path 'K:\ProjetIA\WCORE\wcore-web\apps\api\src\server.ts' -Encoding UTF8
 = -1
for ( = 0;  -lt .Length; ++) {
    if ([] -eq 'app.get("/health", async () => ({') {
         = 
        break
    }
}
if ( -ge 0) {
     = 
    while ( -lt .Length -and -not ([] -eq '});')) { ++ }
    if ( -lt .Length) {
         = @()
         += [0..(-1)]
         += @'
app.get("/health", async () => {
  const dbOk = await prisma.SELECT 1.then(() => true).catch(() => false);
  const redisOk = await checkRedis();
  const circuits = Object.fromEntries(Array.from(circuitBreakers.entries()).map(([k, v]) => [k, v.getStatus()]));
  const openCircuits = Object.values(circuits).filter((c) => c.state === "OPEN").length;
  const status = dependencyHealthStatus(dbOk, redisOk, openCircuits);
  return {
    status,
    service: "wcore-api",
    coreVersion: CORE_VERSION,
    uptimeSec: Math.round(process.uptime()),
    chainCount: chainList.length,
  };
}
'@
         += [(+1)..(.Length-1)]
        Set-Content -Path 'K:\ProjetIA\WCORE\wcore-web\apps\api\src\server.ts.new' -Value  -Encoding UTF8
        Move-Item -Force 'K:\ProjetIA\WCORE\wcore-web\apps\api\src\server.ts.new' 'K:\ProjetIA\WCORE\wcore-web\apps\api\src\server.ts'
    }
}
