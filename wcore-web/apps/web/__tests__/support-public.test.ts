import { test } from "node:test";
import assert from "node:assert/strict";
import { buildSupportPublicContent, SUPPORT_ISSUES_URL } from "../lib/support-public-content";

for (const language of ["fr", "en"] as const) {
  test(`public support ${language}: wallet address is explicitly optional`, () => {
    const c = buildSupportPublicContent(language, { chainConfigCount: 987, cexProviderCount: 654 });
    assert.match(c.reportItems[0]!, language === "fr" ? /facultati/i : /optional/i);
  });
  test(`public support ${language}: no monitored channel claim or numeric coverage promise`, () => {
    const c = buildSupportPublicContent(language, { chainConfigCount: 987, cexProviderCount: 654 });
    assert.doesNotMatch(c.channelBody, /tracked|suivis/i);
    assert.match(c.channelCaveat, language === "fr" ? /non (?:vérifié|attesté)/i : /not verified/i);
    assert.doesNotMatch(JSON.stringify(c.sections), /987|654|4 VM/);
  });
  test(`public support ${language}: distinguishes tracker from signed GM`, () => {
    const c = buildSupportPublicContent(language, { chainConfigCount: 987, cexProviderCount: 654 });
    assert.match(c.intro, /GM/);
    assert.match(c.intro, language === "fr" ? /sign|transaction/ : /sign|transaction/);
  });
  test(`public support ${language}: public account and secret warnings`, () => {
    const c = buildSupportPublicContent(language, { chainConfigCount: 987, cexProviderCount: 654 });
    assert.equal(c.channelUrl, SUPPORT_ISSUES_URL);
    assert.match(c.channelBody, /public/i);
    assert.match(c.channelBody, language === "fr" ? /compte GitHub/ : /GitHub account/);
    assert.match(c.privacy, /API/);
    assert.match(c.privacy, language === "fr" ? /sensible/ : /sensitive/);
  });
}
