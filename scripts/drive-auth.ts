import { randomBytes } from "node:crypto";
import { readFile, writeFile } from "node:fs/promises";
import { createServer } from "node:http";
import type { AddressInfo } from "node:net";
import path from "node:path";

// One-time sign-in. Saves GOOGLE_DRIVE_REFRESH_TOKEN to .env so the server can use Drive.
const SCOPE = "https://www.googleapis.com/auth/drive";
const ENV_PATH = path.join(process.cwd(), ".env");

async function saveRefreshToken(token: string) {
  const line = `GOOGLE_DRIVE_REFRESH_TOKEN="${token}"`;
  const contents = await readFile(ENV_PATH, "utf8");
  const pattern = /^GOOGLE_DRIVE_REFRESH_TOKEN=.*$/m;
  await writeFile(ENV_PATH, pattern.test(contents) ? contents.replace(pattern, () => line) : `${contents.trimEnd()}\n${line}\n`);
}

async function exchangeCode(code: string, clientId: string, clientSecret: string, redirectUri: string) {
  const response = await fetch("https://oauth2.googleapis.com/token", {
    method: "POST",
    body: new URLSearchParams({ code, client_id: clientId, client_secret: clientSecret, redirect_uri: redirectUri, grant_type: "authorization_code" }),
  });
  if (!response.ok) throw new Error(`Google refused the sign-in (${response.status}): ${await response.text()}`);
  return await response.json() as { access_token: string; refresh_token?: string };
}

async function checkFolder(accessToken: string, folderId: string) {
  const response = await fetch(`https://www.googleapis.com/drive/v3/files/${encodeURIComponent(folderId)}?fields=name,capabilities/canAddChildren&supportsAllDrives=true`, {
    headers: { Authorization: `Bearer ${accessToken}` },
  });
  if (!response.ok) throw new Error(`This Google account cannot open the Drive folder (${response.status}). Sign in with the account that owns it.`);
  const folder = await response.json() as { name: string; capabilities?: { canAddChildren?: boolean } };
  if (!folder.capabilities?.canAddChildren) throw new Error(`This Google account cannot add files to "${folder.name}". Sign in with the account that owns it.`);
  return folder.name;
}

async function main() {
  const clientId = process.env.GOOGLE_DRIVE_CLIENT_ID?.trim();
  const clientSecret = process.env.GOOGLE_DRIVE_CLIENT_SECRET?.trim();
  const folderId = process.env.GOOGLE_DRIVE_FOLDER_ID?.trim();
  if (!clientId || !clientSecret || !folderId) {
    throw new Error("Set GOOGLE_DRIVE_CLIENT_ID, GOOGLE_DRIVE_CLIENT_SECRET and GOOGLE_DRIVE_FOLDER_ID in .env first.");
  }
  const state = randomBytes(16).toString("hex");

  await new Promise<void>((resolve, reject) => {
    const server = createServer((request, response) => {
      const url = new URL(request.url ?? "/", "http://127.0.0.1");
      if (url.pathname !== "/") {
        response.writeHead(404).end();
        return;
      }
      const redirectUri = `http://127.0.0.1:${(server.address() as AddressInfo).port}`;
      const finish = (message: string, error?: Error) => {
        response.writeHead(error ? 400 : 200, { "Content-Type": "text/plain; charset=utf-8" }).end(message);
        server.close();
        if (error) reject(error);
        else resolve();
      };
      const code = url.searchParams.get("code");
      if (url.searchParams.get("state") !== state || !code) {
        finish("Sign-in failed. Check the terminal.", new Error(`Sign-in did not complete: ${url.searchParams.get("error") ?? "invalid response"}`));
        return;
      }
      void (async () => {
        const tokens = await exchangeCode(code, clientId, clientSecret, redirectUri);
        if (!tokens.refresh_token) throw new Error("Google did not return a refresh token. Run this command again.");
        const folderName = await checkFolder(tokens.access_token, folderId);
        await saveRefreshToken(tokens.refresh_token);
        console.log(`Connected to the Drive folder "${folderName}". Restart the server to start using it.`);
        finish("Google Drive is connected. You can close this tab.");
      })().catch((error: Error) => finish("Sign-in failed. Check the terminal.", error));
    });
    server.on("error", reject);
    server.listen(0, "127.0.0.1", () => {
      const parameters = new URLSearchParams({
        client_id: clientId,
        redirect_uri: `http://127.0.0.1:${(server.address() as AddressInfo).port}`,
        response_type: "code",
        scope: SCOPE,
        access_type: "offline",
        prompt: "consent",
        state,
      });
      console.log(`Open this link and sign in with the Google account that owns the folder:\n\nhttps://accounts.google.com/o/oauth2/v2/auth?${parameters}\n`);
    });
  });
}

main().catch((error: Error) => {
  console.error(error.message);
  process.exit(1);
});
