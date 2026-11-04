// Google sign-in, saved PANs, agreement to the Terms/Privacy Policy, and account deletion.
const { OAuth2Client } = require("google-auth-library");
const storeLib = require("../lib/store");
const { auth } = require("../middleware/security");
const { SESSION_COOKIE } = require("../lib/auth");
const { GOOGLE_CLIENT_ID, LEGAL_VERSION } = require("../config");

const googleClient = GOOGLE_CLIENT_ID ? new OAuth2Client(GOOGLE_CLIENT_ID) : null;
const store = () => storeLib.store();

const MAX_SAVED_PANS = 50;
const PAN_FORMAT = /^[A-Z]{5}[0-9]{4}[A-Z]$/;

// True until the user has agreed to the current Terms and Privacy Policy
const consentNeeded = user => user?.consent?.version !== LEGAL_VERSION;

const profileOf = user => user ? { email: user.email || null, name: user.name || null, picture: user.picture || null } : null;

const clearSession = res => res.clearCookie(SESSION_COOKIE, { path: "/", httpOnly: true, sameSite: "strict" });

// Verify the Google id_token, remember the profile, and bind the session cookie to the user
async function googleSignIn(req, res) {
  const idToken = req.body?.idToken;
  if (!idToken || !googleClient) return res.status(400).json({ success: false, error: "Google sign-in is not configured." });
  try {
    const ticket = await googleClient.verifyIdToken({ idToken, audience: GOOGLE_CLIENT_ID });
    const payload = ticket.getPayload();
    const userId = `g:${payload.sub}`;
    await store().saveProfile(userId, { email: payload.email || null, name: payload.name || null, picture: payload.picture || null });
    const user = await store().getUser(userId);
    auth.issueUserSession(req, res, userId);
    res.json({ success: true, userId, ...profileOf(user), consentNeeded: consentNeeded(user), legalVersion: LEGAL_VERSION });
  } catch (err) {
    console.error("[AUTH] Google verify failed:", err.message);
    res.status(401).json({ success: false, error: "Authentication failed." });
  }
}

// Clear the session cookie so the user is actually signed out (not just hidden in React state)
function logout(req, res) {
  clearSession(res);
  res.json({ success: true });
}

async function getPans(req, res) {
  const userId = req.sessionUserId;
  if (!userId) return res.json({ success: true, guest: true, pans: [] });
  try {
    const user = await store().getUser(userId);
    const needed = consentNeeded(user);
    // Saved PANs are only handed out once the current Terms and Privacy Policy are agreed to
    res.json({ success: true, user: profileOf(user), pans: needed ? [] : user?.pans || [], consentNeeded: needed, legalVersion: LEGAL_VERSION });
  } catch (err) {
    res.status(500).json({ success: false, error: err.message });
  }
}

async function savePans(req, res) {
  const userId = req.sessionUserId;
  if (!userId) return res.status(401).json({ success: false, error: "Sign in to save PANs." });
  const pans = Array.isArray(req.body?.pans) ? req.body.pans : [];
  if (pans.length > MAX_SAVED_PANS) return res.status(400).json({ success: false, error: `Maximum ${MAX_SAVED_PANS} PANs.` });
  try {
    if (consentNeeded(await store().getUser(userId))) {
      return res.status(403).json({ success: false, consentNeeded: true, error: "Please agree to the Terms and Privacy Policy first." });
    }
    const clean = [];
    for (const p of pans) {
      const pan = String(p?.pan || "").trim().toUpperCase();
      if (!PAN_FORMAT.test(pan) || clean.some(c => c.pan === pan)) continue;
      clean.push({ pan, nickname: String(p.nickname || "Main").slice(0, 40), name: String(p.name || "").slice(0, 120) });
    }
    await store().savePans(userId, clean);
    res.json({ success: true, count: clean.length });
  } catch (err) {
    res.status(500).json({ success: false, error: err.message });
  }
}

// Record that the signed-in user agreed to the current Terms and Privacy Policy. The consent log keeps
// who agreed, to which version, when, how, and from which IP address and browser.
async function acceptConsent(req, res) {
  const userId = req.sessionUserId;
  if (!userId) return res.status(401).json({ success: false, error: "Sign in first." });
  if (req.body?.version !== LEGAL_VERSION || req.body?.agreed !== true) {
    return res.status(400).json({ success: false, error: "Please agree to the current Terms and Privacy Policy." });
  }
  try {
    const user = await store().getUser(userId);
    if (!user) return res.status(404).json({ success: false, error: "Account not found." });
    const at = new Date().toISOString();
    await store().logConsent({
      event: "agreed",
      userId,
      email: user.email || null,
      version: LEGAL_VERSION,
      documents: ["terms", "privacy"],
      method: "checkbox and Agree button after Google sign-in",
      ip: req.ip || null,
      userAgent: String(req.headers["user-agent"] || "").slice(0, 300)
    });
    await store().saveConsent(userId, { version: LEGAL_VERSION, at });
    res.json({ success: true, version: LEGAL_VERSION, at });
  } catch (err) {
    console.error("[CONSENT] save failed:", err.message);
    res.status(500).json({ success: false, error: "Could not save your agreement. Please try again." });
  }
}

// Permanently delete the account and its saved PANs (right to erasure, DPDP Act 2023 s.12)
async function deleteAccount(req, res) {
  const userId = req.sessionUserId;
  if (!userId) return res.status(401).json({ success: false, error: "Sign in first." });
  try {
    await store().logConsent({ event: "account_deleted", userId, ip: req.ip || null });
    await store().deleteUser(userId);
    clearSession(res);
    res.json({ success: true });
  } catch (err) {
    console.error("[ACCOUNT] delete failed:", err.message);
    res.status(500).json({ success: false, error: "Could not delete your account. Please try again." });
  }
}

module.exports = { googleSignIn, logout, getPans, savePans, acceptConsent, deleteAccount };
