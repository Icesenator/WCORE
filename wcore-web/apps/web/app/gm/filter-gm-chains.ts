export function filterGmChains<T extends { key: string; name: string }>(chains: T[], query: string): T[] {
  const search = query.trim().toLowerCase();
  if (!search) return chains;
  return chains.filter(chain =>
    chain.key.toLowerCase().includes(search) || chain.name.toLowerCase().includes(search),
  );
}
