// The consent page for Supabase Auth's OAuth 2.1 server. An assistant (Claude,
// ChatGPT, Gemini) sends the lifter here with ?authorization_id=...; the lifter
// signs in and allows or denies. Talks to the Auth REST API directly and keeps
// the session in memory only.
"use strict";

const SUPABASE_URL = "https://nxpgkslswhqsedttcrqv.supabase.co";
// The project's public anon key, the same one the app ships. Not a secret.
const ANON_KEY =
  "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6Im54cGdrc2xzd2hxc2VkdHRjcnF2Iiwicm9sZSI6ImFub24iLCJpYXQiOjE3OTAyMTQzNjIsImV4cCI6MjEwNTc5MDM2Mn0.rDLLuDWkvArCId52ULjLQlquznngTEPuVcImsQVvGdM";

const $ = (id) => document.getElementById(id);
const authorizationId = new URLSearchParams(location.search).get("authorization_id");
let session = null;
let email = "";

function show(section) {
  for (const id of ["missing", "signin", "ask", "done"]) $(id).hidden = id !== section;
}

function error(message) {
  $("error").textContent = message || "";
  $("error").hidden = !message;
}

function busy(on) {
  for (const b of document.querySelectorAll("button")) b.disabled = on;
}

async function auth(path, { method = "POST", body, token } = {}) {
  const headers = { apikey: ANON_KEY, "Content-Type": "application/json" };
  if (token) headers.Authorization = `Bearer ${token}`;
  let res;
  try {
    res = await fetch(`${SUPABASE_URL}/auth/v1/${path}`, {
      method,
      headers,
      body: body === undefined ? undefined : JSON.stringify(body),
    });
  } catch {
    // No connection, or Block's sign-in service did not answer: say so, not the browser's words.
    const err = new Error("Block's sign-in could not be reached. Check your connection, then try again.");
    err.code = "network";
    throw err;
  }
  const text = await res.text();
  let data = null;
  try {
    data = text ? JSON.parse(text) : null;
  } catch {
    data = null;
  }
  if (!res.ok) {
    const message = (data && (data.msg || data.message || data.error_description || data.error)) || `Error ${res.status}`;
    const err = new Error(message);
    err.status = res.status;
    err.code = data && (data.error_code || data.code);
    throw err;
  }
  return data;
}

function readable(err) {
  const code = String(err.code || "");
  if (code === "network") return err.message;
  if (code === "invalid_credentials" || /invalid login credentials/i.test(err.message)) return "Wrong email or password.";
  if (code === "otp_disabled" || /signups not allowed/i.test(err.message)) {
    return "No Block account uses this email. Create your account in the app first.";
  }
  if (code === "otp_expired" || /expired|invalid/i.test(err.message)) return "That code is wrong or has expired. Send a new one.";
  if (code === "over_email_send_rate_limit" || err.status === 429) return "Too many tries. Wait a minute, then try again.";
  if (code === "oauth_authorization_not_found" || err.status === 404) {
    return "This request has expired. Go back to your assistant and connect again.";
  }
  return err.message || "Something went wrong. Try again.";
}

// Where an approval sends access to the account: the host of the assistant's redirect address.
// Anyone can register an assistant under any name and address, so the page leads with the
// address, and the name is the assistant's own claim (security review of 2026-10-11).
function destination(uri) {
  let url;
  try {
    url = new URL(uri);
  } catch {
    return { label: "An unknown address", local: false };
  }
  if (url.protocol === "http:" || url.protocol === "https:") {
    if (["localhost", "127.0.0.1", "[::1]"].includes(url.hostname)) return { label: "An app on this device", local: true };
    // Plain http shows its scheme: the approval would travel unencrypted.
    return { label: url.protocol === "http:" ? `http://${url.hostname}` : url.hostname, local: false };
  }
  // An app's own link (cursor://, vscode://): its scheme and host name it.
  return { label: url.host ? `${url.protocol}//${url.host}` : url.protocol.replace(/:$/, ""), local: false };
}

async function signedIn(newSession) {
  session = newSession;
  await loadRequest();
}

async function loadRequest() {
  busy(true);
  error("");
  try {
    const details = await auth(`oauth/authorizations/${encodeURIComponent(authorizationId)}`, { method: "GET", token: session.access_token });
    if (details && details.redirect_url && !details.client) {
      // Allowed before for the same assistant and access.
      finish(details.redirect_url, "Already connected. Returning you to your assistant.");
      return;
    }
    const client = details.client || {};
    const to = destination(details.redirect_uri);
    $("client-host").textContent = to.label;
    // Direction controls could reorder the name's letters on screen; they go.
    const name = typeof client.name === "string" ? client.name.replace(/[\u200E\u200F\u202A-\u202E\u2066-\u2069]/g, "").trim() : "";
    const says = [];
    if (name) says.push(`It gives its name as “${name}”. Block cannot confirm names.`);
    if (!to.local) says.push("Allow only an address you know.");
    $("client-name").textContent = says.join(" ");
    $("client-name").hidden = says.length === 0;
    $("who").textContent = (details.user && details.user.email) || email;
    show("ask");
  } catch (err) {
    error(readable(err));
    show("signin");
  } finally {
    busy(false);
  }
}

async function decide(action) {
  busy(true);
  error("");
  try {
    const out = await auth(`oauth/authorizations/${encodeURIComponent(authorizationId)}/consent`, {
      body: { action },
      token: session.access_token,
    });
    finish(out.redirect_url, action === "approve" ? "Connected. Returning you to your assistant." : "Not connected. Returning you to your assistant.");
  } catch (err) {
    error(readable(err));
    busy(false);
  }
}

// A return address that is a web or app address; never one that runs script on this page.
function returnAddress(url) {
  try {
    const u = new URL(url);
    return ["javascript:", "data:", "vbscript:", "file:", "blob:"].includes(u.protocol) ? null : u.href;
  } catch {
    return null;
  }
}

function finish(url, text) {
  const to = url ? returnAddress(url) : null;
  $("done-text").textContent = url && !to ? "Block does not open this assistant's return address. Go back to your assistant." : text;
  show("done");
  session = null;
  if (to) location.assign(to);
}

$("email-form").addEventListener("submit", async (e) => {
  e.preventDefault();
  email = $("email").value.trim();
  if (!email) return error("Enter your email.");
  busy(true);
  error("");
  try {
    await auth("otp", { body: { email, create_user: false } });
    $("code-sent").textContent = `We sent a code to ${email}. It expires in one hour.`;
    $("code-form").hidden = false;
    $("code").focus();
  } catch (err) {
    error(readable(err));
  } finally {
    busy(false);
  }
});

$("code-form").addEventListener("submit", async (e) => {
  e.preventDefault();
  const token = $("code").value.replace(/\s+/g, "");
  if (!token) return error("Enter the code from the email.");
  busy(true);
  error("");
  try {
    await signedIn(await auth("verify", { body: { type: "email", email, token } }));
  } catch (err) {
    error(readable(err));
    busy(false);
  }
});

$("password-form").addEventListener("submit", async (e) => {
  e.preventDefault();
  email = $("email").value.trim();
  const password = $("password").value;
  if (!email || !password) return error("Enter your email and password.");
  busy(true);
  error("");
  try {
    await signedIn(await auth("token?grant_type=password", { body: { email, password } }));
  } catch (err) {
    error(readable(err));
    busy(false);
  }
});

$("use-password").addEventListener("click", (e) => {
  e.preventDefault();
  error("");
  $("password-form").hidden = false;
  $("code-form").hidden = true;
  $("send-code").hidden = true;
  $("use-password").hidden = true;
  $("password").focus();
});

// A request belongs to the first account that opened it, so another account must start again.
$("switch").addEventListener("click", (e) => {
  e.preventDefault();
  session = null;
  $("done-text").textContent = "To connect another Block account, go back to your assistant and connect again.";
  show("done");
});

$("allow").addEventListener("click", () => decide("approve"));
$("deny").addEventListener("click", () => decide("deny"));

show(authorizationId ? "signin" : "missing");
