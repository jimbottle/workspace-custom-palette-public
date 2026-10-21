/**
 * One-time interactive login to seed the persistent user-data-dir with the
 * dedicated test account's Google session. Run `npm run auth`, sign in to the
 * TEST account in the Chromium window that opens (pre-resolving any MFA). This
 * script auto-detects a completed login (no terminal interaction needed): it
 * opens a Sheets URL, which Google redirects to sign-in; once you finish, Google
 * redirects back into the editor, and we save + close. Subsequent `npm run
 * monitor` runs reuse that session. No credentials are stored in the repo (the
 * session lives in the gitignored user-data-dir).
 */
import { launchExtensionContext } from "./browser.ts";

const LOGIN_TIMEOUT_MS = Number(process.env.AUTH_TIMEOUT_MS) || 5 * 60 * 1000; // default 5 min; override for slower sign-ins
const POLL_MS = 2000;
// Require an actual opened doc (/d/{id}/...), NOT the /create entry point we
// navigate to — otherwise the first poll could falsely report "signed in"
// before Google's auth redirect fires and save an unauthenticated profile.
const EDITOR_RE = /docs\.google\.com\/(spreadsheets|document|presentation)\/d\//;

async function main(): Promise<void> {
  const context = await launchExtensionContext();
  const page = context.pages()[0] ?? (await context.newPage());

  console.log("\nOpening Google sign-in. Sign in to the DEDICATED TEST account in");
  console.log("the Chromium window (pre-resolve any MFA). This will auto-save and");
  console.log("close once you land back in a Sheet.\n");

  // Land here after a successful login; until then Google holds us on accounts.*
  await page.goto("https://docs.google.com/spreadsheets/create")
    .catch((e) => console.warn("initial navigation failed (will keep polling):", e?.message ?? e));

  const start = Date.now();
  while (Date.now() - start < LOGIN_TIMEOUT_MS) {
    const url = page.url();
    if (EDITOR_RE.test(url)) {
      console.log("Detected a signed-in session. Saving and closing…");
      await page.waitForTimeout(1500); // let cookies flush to the profile
      await context.close();
      console.log("Saved. You can now run `npm run monitor`.");
      return;
    }
    await page.waitForTimeout(POLL_MS);
  }

  console.error("Timed out waiting for sign-in (5 min). Re-run `npm run auth`.");
  await context.close();
  process.exit(1);
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
