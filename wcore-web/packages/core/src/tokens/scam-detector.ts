// Scam detection lives in @wcore/shared so apps/web and apps/api use the exact
// same rules. Bumping rules in one place keeps SCAM_RULES_VERSION coherent.
export {
  detectScam,
  addAdminApproved,
  addAdminBlocked,
  SCAM_RULES_VERSION,
  type ScamCheck,
  type ScamLevel,
} from "@wcore/shared";
