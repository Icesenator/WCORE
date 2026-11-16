import type { WalletRequest } from "./chain-switch";

/** Margin added on top of eth_estimateGas (+20 %). */
export const GAS_MARGIN_NUM = 12n;
export const GAS_MARGIN_DEN = 10n;

export interface DeployTx { from: string | undefined; data: string; gas?: string }

/**
 * Builds the deployment transaction with an explicit gas limit taken from eth_estimateGas plus 20 %.
 *
 * Some wallets cannot simulate on every chain and then fall back to a fixed limit (Rabby used
 * 1,000,000 on Etherlink, where a GM deployment costs about 10 million gas because the data
 * availability cost is counted as gas). If the estimate fails or is not a valid quantity, the
 * transaction is sent without `gas` and the wallet decides, as before.
 */
export async function buildDeployTx(ethereum: WalletRequest, from: string | undefined, data: string): Promise<DeployTx> {
  const tx: DeployTx = { from, data };
  try {
    const est = await ethereum.request({ method: "eth_estimateGas", params: [{ from, data }] });
    if (typeof est === "string" && /^0x[0-9a-fA-F]+$/.test(est)) {
      const g = BigInt(est);
      if (g > 0n) tx.gas = "0x" + ((g * GAS_MARGIN_NUM + GAS_MARGIN_DEN - 1n) / GAS_MARGIN_DEN).toString(16);
    }
  } catch {
    /* estimate unavailable: let the wallet choose */
  }
  return tx;
}
