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
    $("client-name").textContent = client.name || "An assistant";
    let where = "";
    try {
      where = `Returns you to ${new URL(details.redirect_uri).host}.`;
    } catch {
      where = "";
    }
    if (client.uri) where += ` ${client.uri}`;
    $("client-where").textContent = where.trim();
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

function finish(url, text) {
  $("done-text").textContent = text;
  show("done");
  session = null;
  if (url) location.assign(url);
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
