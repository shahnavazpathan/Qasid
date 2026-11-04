import { useState } from "react";
import { Button, Dialog, Icon, useToast } from "../ui/index.js";
import { useAuth } from "./auth.jsx";

const docLink = (href, text) => (
  <a href={href} target="_blank" rel="noopener" className="font-bold text-brand underline underline-offset-2">{text}</a>
);

// Shown after Google sign-in until the user agrees to the current Terms and Privacy Policy.
// Nothing is saved to the account before that; the server logs the agreement with its date and version.
export function ConsentDialog() {
  const { signedIn, consentNeeded, acceptConsent, signOut } = useAuth();
  const toast = useToast();
  const [ticked, setTicked] = useState(false);
  const [busy, setBusy] = useState(false);

  const agree = async () => {
    setBusy(true);
    try {
      await acceptConsent();
    } catch (e) {
      toast(e.message || "Could not save your agreement. Please try again.", null, "alert");
    } finally {
      setBusy(false);
    }
  };

  return (
    <Dialog open={signedIn && consentNeeded} label="Agree to the Terms and Privacy Policy">
      <span className="size-11 grid place-items-center rounded-xl bg-brand-soft text-brand"><Icon name="check" className="size-5" /></span>
      <h2 className="mt-3 text-[20px] font-bold tracking-tight">Before we save your PANs</h2>
      <ul className="mt-3 space-y-2.5 text-[14px] text-ink-2">
        <li>• Your saved PANs, their nicknames and holder names are kept in your account so they show on every device. You can remove them, or delete your whole account, at any time.</li>
        <li>• When you check an allotment, the PAN is sent only to that IPO's registrar, to fetch your result.</li>
        <li>• GMP is unofficial grey-market data and can be wrong. Qasid is not registered with SEBI and nothing here is investment advice.</li>
      </ul>
      <label className="mt-5 flex items-start gap-3 rounded-xl bg-raised p-3.5 cursor-pointer">
        <input type="checkbox" checked={ticked} onChange={e => setTicked(e.target.checked)} className="mt-0.5 size-5 accent-[#DC2626] shrink-0" />
        <span className="text-[14px] text-ink">
          I have read and agree to the {docLink("/terms.html", "Terms of Service")} and the {docLink("/privacy.html", "Privacy Policy")}.
        </span>
      </label>
      <div className="mt-5 flex flex-col-reverse sm:flex-row gap-2 sm:justify-end">
        <button onClick={signOut} className="h-11 px-4 rounded-xl font-semibold text-ink-2 hover:bg-raised">Sign out</button>
        <Button onClick={agree} disabled={!ticked || busy}>{busy ? "Saving…" : "Agree and continue"}</Button>
      </div>
    </Dialog>
  );
}

// Confirms permanent deletion of the account and its saved PANs
export function DeleteAccountDialog({ open, onClose }) {
  const { deleteAccount } = useAuth();
  const toast = useToast();
  const [busy, setBusy] = useState(false);

  const remove = async () => {
    setBusy(true);
    try {
      await deleteAccount();
      onClose();
      toast("Your account and saved PANs were deleted permanently.", null, "success");
    } catch (e) {
      toast(e.message || "Could not delete your account. Please try again.", null, "alert");
    } finally {
      setBusy(false);
    }
  };

  return (
    <Dialog open={open} onClose={busy ? null : onClose} label="Delete account">
      <span className="size-11 grid place-items-center rounded-xl bg-loss-soft text-loss"><Icon name="trash" className="size-5" /></span>
      <h2 className="mt-3 text-[20px] font-bold tracking-tight">Delete your account?</h2>
      <p className="mt-2 text-[14px] text-ink-2">
        This permanently deletes your account and every PAN saved in it, from all your devices. It can't be undone.
        Only a record that you once agreed to the Terms and Privacy Policy is kept, without your email.
      </p>
      <div className="mt-5 flex flex-col-reverse sm:flex-row gap-2 sm:justify-end">
        <button onClick={onClose} disabled={busy} className="h-11 px-4 rounded-xl font-semibold text-ink-2 hover:bg-raised">Cancel</button>
        <button onClick={remove} disabled={busy} className="h-11 px-4 rounded-xl font-bold bg-loss text-white hover:brightness-110 disabled:opacity-60">
          {busy ? "Deleting…" : "Delete permanently"}
        </button>
      </div>
    </Dialog>
  );
}
