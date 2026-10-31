import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { GM_FACTORIES, GM_HISTORICAL_FACTORIES, getFactory } from "../../../packages/shared/src/factories";

const source = (path: string) => readFileSync(new URL(path, import.meta.url), "utf8");
const B3_FACTORY = "0x14bfaa1302ab5ea8041d3dfec9abb668efbf2f34";

test("B3 Mainnet n'est plus une factory GM active", () => {
  assert.equal(getFactory("b3"), undefined);
  assert.ok(!Object.values(GM_FACTORIES).some((f) => f.chainId === 8333));
  assert.equal(getFactory("base")?.chainId, 8453);
});

test("la factory B3 reste identifiable comme historique (contrats déjà déployés)", () => {
  assert.deepEqual(GM_HISTORICAL_FACTORIES.b3, { address: B3_FACTORY, chainId: 8333 });
  assert.match(source("../hooks/useGmContracts.ts"), /b3:\s*8333/);
  assert.match(source("../lib/explorers.ts"), /b3:\s*"https:\/\/explorer\.b3\.fun"/, "lien explorateur conservé pour les preuves");
});

test("aucun nouveau déploiement GM ne peut viser B3 Mainnet", () => {
  assert.doesNotMatch(source("../app/dev/deploy/DeployClient.tsx"), /"B3"|chainId: 8333/);
  assert.doesNotMatch(source("../app/dev/deploy/chain-data.ts"), /\bB3\b|8333|b3-[12]/);
});
