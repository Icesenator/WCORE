 = Get-Content -Raw -Path 'K:\ProjetIA\WCORE\wcore-web\apps\api\src\server.ts' -Encoding UTF8
 = '(?s)app\.get\("/health", async \(\) => \({[\s\S]*?\}\);\s*'
 = @'
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
 =  -replace , 
Set-Content -Path 'K:\ProjetIA\WCORE\wcore-web\apps\api\src\server.ts' -Value  -Encoding UTF8
