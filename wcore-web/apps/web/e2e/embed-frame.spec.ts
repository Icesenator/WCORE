import { test, expect } from "@playwright/test";

// Pages Bubbles integrables (cadrables par Apps Script) : en-tetes reels du build standalone, aucune navigation
// possible depuis le cadre, aucun appel de session. Voir lib/security-headers.mjs et lib/bare-routes.ts.

const EMBEDS = ["/cmc/crypto/bubbles/embed", "/cmc/stocks/bubbles/embed"];
const POPUPS = ["/cmc/crypto/bubbles/popup", "/cmc/stocks/bubbles/popup"];
const FRAME_ANCESTORS = "frame-ancestors https://script.google.com https://*.googleusercontent.com";

test.describe("Bubbles embed : en-tetes de cadrage", () => {
  for (const p of EMBEDS) {
    test(`${p} est cadrable par Apps Script seulement, sans X-Frame-Options`, async ({ request }) => {
      const res = await request.get(p);
      expect(res.status()).toBe(200);
      expect(res.headers()["x-frame-options"]).toBeUndefined();
      expect(res.headers()["content-security-policy"]).toContain(FRAME_ANCESTORS);
      expect(res.headers()["content-security-policy"]).not.toContain("frame-ancestors 'none'");
    });
  }

  for (const p of POPUPS) {
    test(`${p} reste interdite au cadrage`, async ({ request }) => {
      const res = await request.get(p);
      expect(res.status()).toBe(200);
      expect(res.headers()["x-frame-options"]).toBe("DENY");
      expect(res.headers()["content-security-policy"]).toContain("frame-ancestors 'none'");
    });
  }

  test("une page ordinaire reste interdite au cadrage", async ({ request }) => {
    const res = await request.get("/");
    expect(res.headers()["x-frame-options"]).toBe("DENY");
    expect(res.headers()["content-security-policy"]).toContain("frame-ancestors 'none'");
  });

  test("un prefixe ou un suffixe d'une route embed n'est pas cadrable", async ({ request }) => {
    for (const p of ["/cmc/crypto/bubbles/embedx", "/cmc/crypto/bubbles/embed/extra", "/x/cmc/crypto/bubbles/embed"]) {
      const res = await request.get(p, { maxRedirects: 0 });
      expect(res.headers()["x-frame-options"], p).toBe("DENY");
    }
  });
});

test.describe("Bubbles embed : aucune navigation ni appel de session depuis le cadre", () => {
  for (const p of EMBEDS) {
    test(`${p} : pas de menu, pas de lien, pas d'appel de session`, async ({ page }) => {
      const sessionCalls: string[] = [];
      page.on("request", (req) => {
        if (/\/api\/(auth|me|notifications|profile|wallets|scan)\b/.test(req.url())) sessionCalls.push(req.url());
      });
      // Les donnees de marche ne sont pas l'objet du test : reponse vide, la page affiche son message d'erreur.
      await page.route((url) => url.pathname.startsWith("/api/cmc/"), (route) =>
        route.fulfill({ status: 200, contentType: "application/json", body: "{}" }));
      await page.addInitScript(() => localStorage.setItem("wcore_address", "0x1234567890123456789012345678901234567890"));

      await page.goto(p);
      await expect(page.locator("main")).toBeVisible();
      expect(await page.locator("a[href]").count()).toBe(0);
      expect(await page.locator("nav, aside").count()).toBe(0);
      expect(sessionCalls).toEqual([]);
    });
  }

  test("une variante de casse renvoie une 404 sans aucun lien", async ({ page }) => {
    await page.goto("/CMC/crypto/bubbles/EMBED");
    await expect(page.getByText("Page not found")).toBeVisible();
    expect(await page.locator("a[href]").count()).toBe(0);
  });
});
