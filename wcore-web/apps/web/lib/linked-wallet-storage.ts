export interface StoredLinkedWallet {
  address: string;
  label: string;
}

export function linkedWalletStorageKey(owner: string): string {
  return `wcore_linked:${owner.trim().toLowerCase()}`;
}

export function readLinkedWallets(storage: Pick<Storage, "getItem">, owner: string | null): StoredLinkedWallet[] {
  if (!owner) return [];
  try {
    const raw = storage.getItem(linkedWalletStorageKey(owner));
    if (!raw) return [];
    const value = JSON.parse(raw) as unknown;
    if (!Array.isArray(value)) return [];
    return value.filter((wallet): wallet is StoredLinkedWallet =>
      typeof wallet === "object" && wallet !== null
      && typeof (wallet as StoredLinkedWallet).address === "string"
      && typeof (wallet as StoredLinkedWallet).label === "string"
    );
  } catch {
    return [];
  }
}

export function writeLinkedWallets(
  storage: Pick<Storage, "setItem">,
  owner: string | null,
  wallets: StoredLinkedWallet[],
): void {
  if (!owner) return;
  storage.setItem(linkedWalletStorageKey(owner), JSON.stringify(wallets));
}
