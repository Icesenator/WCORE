// Controle de gouvernance CURRENT — P1-GOV-INTERAGENT-ROUTING
// PARTIE 3 = PROMPT EXECUTABLE pour un AUTRE agent OpenCode (9 sections, pas un memo).
// CAS 1-5 : contrat statique. CAS 6-15 : validateur de structure sur des exemples.
const fs = require("fs");
const path = require("path");
const ROOT = path.resolve(__dirname, "..");
const read = (p) => fs.readFileSync(path.join(ROOT, p), "utf8");

const prompt = read("docs/prompts/supervisor-wcore-cm.md");
const agents = read("AGENTS.md");
const roadmap = read("ROADMAP.md");
// Source DURABLE WCORE-owned : le prompt canonique est un miroir regenerable par un amont externe.
// Les marqueurs de routage sont donc lus dans AGENTS.md (suivi git) EN PLUS du prompt.
const canon = prompt + "\n" + agents;

let failed = 0;
function check(id, desc, ok, detail) {
  if (!ok) failed++;
  console.log(`${ok ? "PASS" : "FAIL"}  ${id}  ${desc}${ok ? "" : "  -> " + detail}`);
}

const TITLE_NEW = "## PARTIE 3 \u2014 PROMPT POUR UN AUTRE AGENT OPENCODE";
const TITLE_OLD = "## PARTIE 3 \u2014 MESSAGE POUR UN AGENT OPENCODE";
const NINE = [
  "1. Contexte", "2. Objectif", "3. \u00c9tapes exactes", "4. Contraintes et interdits",
  "5. Preuve attendue", "6. Autonomie & contexte", "7. Invariants \u00e0 pr\u00e9server",
  "8. Assumptions", "9. Continuit\u00e9, escalade et rendu de main exceptionnel",
];

// ---- Validateur structurel d'une PARTIE 3 ----
function analyze(s) {
  const idxs = NINE.map((h) => s.indexOf(h));
  const hasAll9 = idxs.every((i) => i >= 0);
  const inOrder = hasAll9 && idxs.every((v, i) => i === 0 || v > idxs[i - 1]);
  const hasNewTitle = s.includes(TITLE_NEW);
  const hasOldTitle = s.includes(TITLE_OLD);
  const headerAgent = /DESTINATAIRE:\s+Agent OpenCode (?!WCORE)/.test(s);
  const localTarget = /DESTINATAIRE:\s+Agent OpenCode WCORE/.test(s);
  const gptTarget = /DESTINATAIRE:\s+GPT Supervisor/.test(s);
  const hasTopic = /ROUTING_TOPIC:/.test(s);
  const hasPrio = /PRIORIT\u00c9 SUGG\u00c9R\u00c9E:/.test(s);
  const directAddress = /Tu es l.Agent OpenCode/.test(s);
  const hasVerify = /VERIFY_MATERIAL_CLAIMS_BEFORE_ACTION=TRUE|vérifie les preuves primaires|vérifie les sources primaires/i.test(s);
  const hasAct = /Si (?:le gap est )?confirm/i.test(s) && /implémente|corrige|teste|documente|continue|poursuis/i.test(s);
  const endsEvalOnly = /(évalue|evaluer|considère|regarder|transmets? au supervisor)[^.]*signal\.?\s*$/i.test(s.trim());
  const ackRequired = /ACK_REQUIS:\s*YES|attends? (?:l')?ACK|attendre l'ACK/i.test(s);
  const gptReformulate = /(reformuler|traduire|interpréter)[^.]*GPT Supervisor|GPT Supervisor[^.]*reformul/i.test(s);
  const valid = hasNewTitle && !hasOldTitle && headerAgent && !localTarget && !gptTarget
    && hasAll9 && inOrder && hasTopic && hasPrio && directAddress && hasVerify && hasAct
    && !endsEvalOnly && !ackRequired && !gptReformulate;
  return { valid, hasNewTitle, hasOldTitle, headerAgent, localTarget, gptTarget, hasAll9, hasAct, hasVerify, ackRequired, gptReformulate, endsEvalOnly };
}

// ---- Exemples de PARTIE 3 ----
function good() {
  return `${TITLE_NEW}
DESTINATAIRE:
Agent OpenCode CodexReviewSupervisor

ROUTING_TOPIC:
GOV-INTERAGENT-EXECUTOR-PROMPT

PRIORITÉ SUGGÉRÉE:
P1

1. Contexte
Tu es l'Agent OpenCode CodexReviewSupervisor. Un signal cross-project WCORE [...]
2. Objectif
Vérifier et, si confirmé, appliquer [...]
3. Étapes exactes
Vérifie les preuves primaires (roadmap, review-context, fichiers, tests). Si le gap est confirmé, recherche une priorité existante, implémente le correctif, teste, documente.
4. Contraintes et interdits
Aucun secret. Pas de broad crawl.
5. Preuve attendue
Tests verts + artefact durable.
6. Autonomie & contexte
FULL_OPERATIONAL_AUTONOMY=ENABLED.
7. Invariants à préserver
IDs immuables.
8. Assumptions
Signal reçu != vérité.
9. Continuité, escalade et rendu de main exceptionnel
Continue ta roadmap après DONE.`;
}
function withTitle(t) { return good().replace(TITLE_NEW, t); }

// CAS 1 : contrat local => PARTIE 2.
check("CAS1", "travail local reste en PARTIE 2",
  canon.includes("LOCAL_AGENT_WORK_STAYS_IN_PART2=TRUE")
  && canon.includes("PART2_TARGET=LOCAL_OPENCODE_AGENT")
  && canon.includes("PART3_TARGET_IS_LOCAL_AGENT_FORBIDDEN=TRUE"), "marqueurs locaux absents");
// CAS 2 : cible autre OpenCode + titre + en-tete.
check("CAS2", "PARTIE 3 cible un AUTRE agent OpenCode",
  prompt.includes("PART3_TARGET=OTHER_OPENCODE_AGENT_ONLY") && prompt.includes(TITLE_NEW)
  && /DESTINATAIRE:\s+Agent OpenCode/.test(prompt), "cible/titre/en-tete absents");
// CAS 3 : aucune cible normative GPT Supervisor.
check("CAS3", "aucune cible normative DESTINATAIRE: GPT Supervisor",
  !/DESTINATAIRE:\s+GPT Supervisor/i.test(prompt) && !/DESTINATAIRE:\s+GPT Supervisor/i.test(agents)
  && prompt.includes("PART3_TO_GPT_SUPERVISOR=FORBIDDEN"), "cible GPT normative presente");
// CAS 4 : PARTIE 3 vers agent local WCORE interdite.
check("CAS4", "PARTIE 3 vers agent local interdite (=> PARTIE 2)",
  canon.includes("PART3_TARGET_IS_LOCAL_AGENT_FORBIDDEN=TRUE") && canon.includes("MERGE_INTO_PART2"), "interdiction absente");
// CAS 5 : inbound non verifie = pas de mutation.
check("CAS5", "inbound verification + no destructive",
  prompt.includes("RECEIVED_PART3_IS_NOT_SOURCE_OF_TRUTH=TRUE")
  && prompt.includes("UNVERIFIED_SIGNAL_CANNOT_TRIGGER_DESTRUCTIVE_ACTION=TRUE")
  && prompt.includes("VERIFY_MATERIAL_CLAIMS_BEFORE_ACTION=TRUE"), "gardes inbound absentes");
// CAS 6 : titre canonique, ancien titre retire du normatif.
check("CAS6", "titre canonique = PROMPT POUR UN AUTRE AGENT OPENCODE",
  prompt.includes(TITLE_NEW) && !prompt.includes(TITLE_OLD) && !agents.includes(TITLE_OLD), "ancien titre encore normatif");
// CAS 7 : GPT cible => invalid.
check("CAS7", "DESTINATAIRE GPT Supervisor => INVALID",
  !analyze(good().replace("Agent OpenCode CodexReviewSupervisor", "GPT Supervisor CodexReviewSupervisor")).valid, "accepte une cible GPT");
// CAS 8 : agent OpenCode local WCORE depuis Supervisor WCORE => invalid.
check("CAS8", "DESTINATAIRE Agent OpenCode WCORE => INVALID",
  !analyze(good().replace("Agent OpenCode CodexReviewSupervisor", "Agent OpenCode WCORE")).valid, "accepte une cible locale");
// CAS 9 : memo-only (sans 9 sections) => invalid.
check("CAS9", "memo-only sans 9 sections => INVALID",
  !analyze("## PARTIE 3 \u2014 PROMPT POUR UN AUTRE AGENT OPENCODE\nDESTINATAIRE:\nAgent OpenCode AutoCascade\nROUTING_TOPIC:\nX\nPRIORITÉ SUGGÉRÉE:\nP2\nOBJET:\nsignaler un fait\nACTION ATTENDUE:\nregarder").valid, "accepte un memo");
// CAS 10 : 9 sections completes => valid.
check("CAS10", "prompt executor 9 sections => VALID", analyze(good()).valid, "refuse un bon prompt");
// CAS 11 : "evaluer ce signal" sans branche d'action => invalid.
check("CAS11", "eval-only sans branche d'action => INVALID",
  !analyze(`${TITLE_NEW}
DESTINATAIRE:
Agent OpenCode CodexReviewSupervisor
ROUTING_TOPIC:
GOV-X
PRIORITÉ SUGGÉRÉE:
P1
1. Contexte
Tu es l'Agent OpenCode CodexReviewSupervisor. Un signal cross-project WCORE.
2. Objectif
Prendre connaissance du signalement.
3. Étapes exactes
Lis le signalement.
4. Contraintes et interdits
Aucun secret.
5. Preuve attendue
N/A.
6. Autonomie & contexte
N/A.
7. Invariants à préserver
N/A.
8. Assumptions
N/A.
9. Continuité, escalade et rendu de main exceptionnel
Merci d'évaluer ce signal.`).valid, "accepte eval-only");
// CAS 12 : claim UNVERIFIED sans preuve primaire => invalid.
check("CAS12", "UNVERIFIED sans preuve primaire => INVALID",
  !analyze(good().replace(/Vérifie les preuves primaires[^]*?documente\./, "applique tout de suite ce changement")).valid, "accepte sans verification");
// CAS 13 : adresse directe + verify + act + test + document + continue => valid.
check("CAS13", "executor direct + verify + act + continue => VALID", analyze(good()).valid, "refuse un bon prompt");
// CAS 14 : exige ACK avant travail => invalid.
check("CAS14", "ACK requis avant travail => INVALID",
  !analyze(good() + "\nACK_REQUIS: YES — n'agit qu'apres reception d'un accusé.").valid, "accepte ACK gate");
// CAS 15 : demande a un GPT Supervisor de reformuler => invalid.
check("CAS15", "reformulation par GPT Supervisor => INVALID",
  !analyze(good() + "\nFais reformuler ce point par le GPT Supervisor cible avant d'agir.").valid, "accepte interpretation GPT");

// ---- Controles transversaux ----
check("ID", "ID canonique = P1-GOV-INTERAGENT-ROUTING",
  canon.includes("INTERAGENT_ROUTING_PRIORITY_ID=P1-GOV-INTERAGENT-ROUTING")
  && agents.includes("P1-GOV-INTERAGENT-ROUTING") && roadmap.includes("P1-GOV-INTERAGENT-ROUTING"), "ID absent");
check("EXEC", "contrat executor present",
  canon.includes("PART3_MUST_BE_EXECUTOR_PROMPT=TRUE") && canon.includes("PART3_ROUTING_MEMO_ONLY=FORBIDDEN")
  && canon.includes("PART3_MUST_NOT_REQUIRE_GPT_SUPERVISOR_INTERPRETATION=TRUE")
  && canon.includes("PART3_REQUIRED_STRUCTURE=9_SECTIONS"), "marqueurs executor absents");
check("SUPERSEDE", "ID precedents superseded (historique preserve)",
  /SUPERSEDED_PRIORITY_IDS=.*P1-GOV-SUPERVISOR-PART3-EXECUTOR-PROMPT/.test(canon)
  && roadmap.includes("SUPERSEDED") && roadmap.includes("superseded_by"), "supersession non tracee");
check("REV", "revision prompt >= R-041", /SUPERVISOR_PROMPT_REVISION=R-0(4[1-9]|[5-9][0-9])/.test(prompt), "revision non montee");
check("NONHANDOFF", "PARTIE 3 != handoff / gate / ACK",
  prompt.includes("PART3_IS_NOT_HANDOFF=TRUE") && prompt.includes("PART3_IS_NOT_PERMISSION_GATE=TRUE")
  && prompt.includes("PART3_DOES_NOT_REQUIRE_TARGET_ACK=TRUE") && prompt.includes("PART3_DOES_NOT_STOP_SOURCE_AGENT=TRUE"), "invariants absents");
check("DEDUP", "dedup inter-agent active", prompt.includes("INTERAGENT_MESSAGE_DEDUP=ENABLED"), "dedup absente");

const activeGpt = (prompt + agents + roadmap).match(/DESTINATAIRE:\s+GPT Supervisor/g) || [];
check("GPT0", "GPT_SUPERVISOR_TARGET_ACTIVE_OCCURRENCES=0", activeGpt.length === 0, activeGpt.length + " occurrence(s)");
check("OLD0", "OLD_TITLE_ACTIVE_OCCURRENCES=0", !prompt.includes(TITLE_OLD) && !agents.includes(TITLE_OLD) && !roadmap.includes(TITLE_OLD), "ancien titre present");

console.log(`\n${failed === 0 ? "ALL PASS" : failed + " FAIL"}  (CAS1-15 + ID/EXEC/SUPERSEDE/REV/NONHANDOFF/DEDUP/GPT0/OLD0)`);
process.exit(failed === 0 ? 0 : 1);
