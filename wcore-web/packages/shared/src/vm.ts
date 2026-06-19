import { z } from "zod";

export const VmType = z.enum(["EVM", "SVM", "COSMOS", "TON"]);
export type VmType = z.infer<typeof VmType>;
