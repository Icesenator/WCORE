export type GmStatus = {
  alreadyOffChain: boolean;
  alreadyOnChain: boolean;
};

export type GmStorage = Pick<Storage, "getItem">;

export function getTodayGmStatus(storage: GmStorage, today = new Date().toISOString().slice(0, 10)): GmStatus {
  return {
    alreadyOffChain: storage.getItem("wc_gm_date") === today,
    alreadyOnChain: storage.getItem("wc_gm_onchain_date") === today,
  };
}
