import React, { useState, useEffect } from "react";
import { 
  Users, Mail, Check, ShieldCheck, Clock, AlertCircle, Plus, Sparkles, Trash2, Shield, UserPlus
} from "lucide-react";
import { db } from "../lib/supabase";
import { BuddyInvitation } from "../types";
import GoogleContactsModal from "./GoogleContactsModal";
import { GoogleContact } from "../lib/googleContacts";

interface BuddyInviteModalProps {
  isOpen: boolean;
  onClose: () => void;
  tripId: string | null;
  tripDestination: string;
  userEmail: string;
}

export default function BuddyInviteModal({ 
  isOpen, 
  onClose, 
  tripId, 
  tripDestination,
  userEmail 
}: BuddyInviteModalProps) {
  const [email, setEmail] = useState("");
  const [accessType, setAccessType] = useState<"read" | "write">("read");
  const [invitations, setInvitations] = useState<BuddyInvitation[]>([]);
  const [loading, setLoading] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [successMessage, setSuccessMessage] = useState("");
  const [error, setError] = useState("");
  const [isGoogleContactsOpen, setIsGoogleContactsOpen] = useState(false);

  const handleSelectGoogleContact = (contact: GoogleContact) => {
    if (contact.email) {
      setEmail(contact.email);
      setSuccessMessage(`Selected ${contact.name} (${contact.email}) from Google Contacts!`);
    } else {
      setError(`Contact ${contact.name} does not have a saved email address.`);
    }
  };

  const handleBatchInviteGoogleContacts = async (contacts: GoogleContact[]) => {
    if (!tripId) return;
    setSubmitting(true);
    setError("");
    setSuccessMessage("");

    let count = 0;
    try {
      for (const c of contacts) {
        if (c.email && c.email.toLowerCase() !== userEmail.toLowerCase()) {
          await db.inviteBuddy(tripId, userEmail, c.email.toLowerCase(), accessType);
          count++;
        }
      }
      setSuccessMessage(`Successfully invited ${count} travel buddies from Google Contacts!`);
      loadInvitations();
    } catch (err: any) {
      setError(err?.message || "Failed to invite contacts.");
    } finally {
      setSubmitting(false);
    }
  };

  useEffect(() => {
    if (isOpen && tripId) {
      loadInvitations();
    }
  }, [isOpen, tripId]);

  const loadInvitations = async () => {
    if (!tripId) return;
    setLoading(true);
    try {
      const data = await db.getInvitationsForTrip(tripId);
      setInvitations(data);
    } catch (err) {
      console.error("Failed to load invitations", err);
    } finally {
      setLoading(false);
    }
  };

  const handleSendInvite = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!tripId) return;
    if (!email.trim()) {
      setError("Please enter a valid email address.");
      return;
    }
    if (email.trim().toLowerCase() === userEmail.toLowerCase()) {
      setError("You cannot invite yourself as a travel buddy.");
      return;
    }

    setSubmitting(true);
    setError("");
    setSuccessMessage("");

    try {
      // Create invitation in DB/mock
      const newInv = await db.inviteBuddy(tripId, userEmail, email.trim().toLowerCase(), accessType);
      
      // Simulate sending real email invitation
      setSuccessMessage(`Invitation successfully sent! An email was dispatched to ${email.trim().toLowerCase()} with ${accessType === "write" ? "read-write (collaborator)" : "read-only"} access.`);
      setEmail("");
      setAccessType("read");
      
      // Refresh list
      loadInvitations();
    } catch (err: any) {
      setError(err?.message || "Failed to send invitation. Please try again.");
    } finally {
      setSubmitting(false);
    }
  };

  const handleWhatsAppInvite = async (e: React.MouseEvent) => {
    e.preventDefault();
    if (!tripId) return;

    setError("");
    setSuccessMessage("");

    const dest = tripDestination || "our upcoming trip";
    const appUrl = `${window.location.origin}${window.location.pathname}?share=${tripId}`;

    if (!email.trim()) {
      // Direct WhatsApp share without registering email
      const text = `Hey! Check out our amazing travel plan for *${dest}* on TripBalancing! 🌍✈️ Check the day-by-day plan, budget breakdown, and recommended attractions here:\n\n${appUrl}`;
      window.open(`https://api.whatsapp.com/send?text=${encodeURIComponent(text)}`, "_blank");
      setSuccessMessage("WhatsApp share link opened!");
      return;
    }

    if (email.trim().toLowerCase() === userEmail.toLowerCase()) {
      setError("You cannot invite yourself as a travel buddy.");
      return;
    }

    setSubmitting(true);

    try {
      // Create invitation in DB/mock
      await db.inviteBuddy(tripId, userEmail, email.trim().toLowerCase(), accessType);
      
      setSuccessMessage(`Invitation registered! WhatsApp message generated.`);
      
      // Prepare WhatsApp message
      const accessLabel = accessType === "write" ? "Collaborator (Read-Write)" : "Viewer (Read-Only)";
      
      const text = `Hey! I'm planning an amazing trip to *${dest}* on TripBalancing! 🌍✈️ I'd love for you to join me as a travel buddy.

Access Level: ${accessLabel}
Please register or log in using your email *${email.trim().toLowerCase()}* on TripBalancing to accept my invitation and start planning together! 🎒🗺️

Start planning here: ${appUrl}`;
      
      window.open(`https://api.whatsapp.com/send?text=${encodeURIComponent(text)}`, "_blank");
      
      setEmail("");
      setAccessType("read");
      
      // Refresh list
      loadInvitations();
    } catch (err: any) {
      setError(err?.message || "Failed to create invitation. Please try again.");
    } finally {
      setSubmitting(false);
    }
  };

  if (!isOpen) return null;

  return (
    <div 
      className="fixed inset-0 z-50 bg-black/70 backdrop-blur-md flex items-center justify-center p-4"
      onClick={onClose}
    >
      <div 
        className="bg-white dark:bg-slate-900 border border-slate-100 dark:border-slate-800 rounded-3xl max-w-lg w-full p-6 shadow-2xl space-y-6 animate-in fade-in zoom-in-95 duration-150"
        onClick={(e) => e.stopPropagation()}
      >
        {/* Header */}
        <div className="flex items-center justify-between">
          <h3 className="text-lg font-black text-slate-800 dark:text-slate-100 flex items-center gap-2">
            <Users className="w-5 h-5 text-teal-600 dark:text-teal-400" />
            <span>Invite Travel Buddy</span>
          </h3>
          <button
            onClick={onClose}
            className="text-slate-400 hover:text-slate-650 dark:text-slate-550 dark:hover:text-slate-350 p-1.5 rounded-lg hover:bg-slate-50 dark:hover:bg-slate-850 transition-all cursor-pointer font-bold text-sm"
          >
            ✕
          </button>
        </div>

        <div>
          <h4 className="text-xs font-bold text-slate-400 dark:text-slate-500 uppercase tracking-wider">Destination</h4>
          <p className="text-sm font-extrabold text-slate-700 dark:text-slate-200 mt-0.5">{tripDestination}</p>
        </div>

        {/* Invite Form */}
        <form onSubmit={handleSendInvite} className="space-y-4">
          <div className="space-y-1.5">
            <div className="flex items-center justify-between">
              <label className="text-[10px] font-extrabold uppercase tracking-wider text-slate-500 dark:text-slate-400 block">Companion's Email</label>
              <button
                type="button"
                onClick={() => setIsGoogleContactsOpen(true)}
                className="text-[11px] font-bold text-teal-600 dark:text-teal-400 hover:text-teal-700 dark:hover:text-teal-300 flex items-center gap-1 transition-all bg-teal-500/10 hover:bg-teal-500/20 px-2.5 py-1 rounded-xl cursor-pointer"
              >
                <UserPlus className="w-3.5 h-3.5" />
                <span>Import Google Contacts</span>
              </button>
            </div>
            <div className="relative">
              <span className="absolute inset-y-0 left-0 flex items-center pl-3.5 text-slate-400 pointer-events-none">
                <Mail className="w-4 h-4" />
              </span>
              <input
                id="buddy-email-input"
                type="email"
                required
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                placeholder="companion@example.com"
                className="w-full pl-10 pr-3.5 py-2.5 bg-slate-50 dark:bg-slate-950 border border-slate-200 dark:border-slate-800 rounded-2xl text-sm focus:outline-none focus:ring-2 focus:ring-teal-500/20 focus:border-teal-500 text-slate-800 dark:text-slate-100 placeholder-slate-400 transition-all font-medium"
              />
            </div>
          </div>

          <div className="space-y-1.5">
            <label className="text-[10px] font-extrabold uppercase tracking-wider text-slate-500 dark:text-slate-400 block">Access Level</label>
            <div className="grid grid-cols-2 gap-3">
              <button
                type="button"
                onClick={() => setAccessType("read")}
                className={`p-3.5 border rounded-2xl text-left flex flex-col justify-between h-20 transition-all cursor-pointer ${
                  accessType === "read"
                    ? "border-teal-500 bg-teal-50/20 text-teal-700 dark:text-teal-400 ring-2 ring-teal-500/10"
                    : "border-slate-200 dark:border-slate-850 bg-white dark:bg-slate-950 text-slate-600 dark:text-slate-400 hover:border-slate-300 dark:hover:border-slate-800"
                }`}
              >
                <span className="text-xs font-extrabold flex items-center gap-1">
                  <Shield className="w-3.5 h-3.5" /> Read-Only
                </span>
                <span className="text-[10px] font-medium text-slate-400 leading-normal">Buddy can view itineraries, notes, budgets & weather.</span>
              </button>

              <button
                type="button"
                onClick={() => setAccessType("write")}
                className={`p-3.5 border rounded-2xl text-left flex flex-col justify-between h-20 transition-all cursor-pointer ${
                  accessType === "write"
                    ? "border-teal-500 bg-teal-50/20 text-teal-700 dark:text-teal-400 ring-2 ring-teal-500/10"
                    : "border-slate-200 dark:border-slate-850 bg-white dark:bg-slate-950 text-slate-600 dark:text-slate-400 hover:border-slate-300 dark:hover:border-slate-800"
                }`}
              >
                <span className="text-xs font-extrabold flex items-center gap-1">
                  <ShieldCheck className="w-3.5 h-3.5" /> Read-Write
                </span>
                <span className="text-[10px] font-medium text-slate-400 leading-normal">Full collaborator. Buddy can update itinerary, log expenses & upload photos.</span>
              </button>
            </div>
          </div>

          {error && (
            <div className="p-3 bg-rose-50 dark:bg-rose-950/20 border border-rose-100 dark:border-rose-900/30 text-rose-600 dark:text-rose-400 text-xs font-semibold rounded-2xl flex items-start gap-2">
              <AlertCircle className="w-4 h-4 flex-shrink-0 mt-0.5" />
              <span>{error}</span>
            </div>
          )}

          {successMessage && (
            <div className="p-3 bg-emerald-50 dark:bg-emerald-950/20 border border-emerald-100 dark:border-emerald-900/30 text-emerald-600 dark:text-emerald-400 text-xs font-semibold rounded-2xl flex items-start gap-2">
              <Sparkles className="w-4 h-4 flex-shrink-0 mt-0.5" />
              <span>{successMessage}</span>
            </div>
          )}

          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
            <button
              type="submit"
              id="send-buddy-invite-btn"
              disabled={submitting}
              className="w-full py-3 bg-gradient-to-r from-teal-500 to-emerald-500 hover:from-teal-600 hover:to-emerald-600 text-white text-xs font-black rounded-2xl cursor-pointer transition-all shadow-md active:scale-[0.98] disabled:opacity-50 flex items-center justify-center gap-1.5"
            >
              {submitting ? (
                <span className="inline-block w-4 h-4 border-2 border-white border-t-transparent rounded-full animate-spin" />
              ) : (
                <>
                  <Mail className="w-4 h-4 stroke-[2]" />
                  <span>Send Email</span>
                </>
              )}
            </button>

            <button
              type="button"
              onClick={handleWhatsAppInvite}
              disabled={submitting}
              className="w-full py-3 bg-[#25D366] hover:bg-[#20ba5a] text-white text-xs font-black rounded-2xl cursor-pointer transition-all shadow-md active:scale-[0.98] disabled:opacity-50 flex items-center justify-center gap-1.5"
            >
              {submitting ? (
                <span className="inline-block w-4 h-4 border-2 border-white border-t-transparent rounded-full animate-spin" />
              ) : (
                <>
                  <svg className="w-4 h-4 fill-current" viewBox="0 0 24 24">
                    <path d="M17.472 14.382c-.297-.149-1.758-.867-2.03-.967-.273-.099-.471-.148-.67.15-.197.297-.767.966-.94 1.164-.173.199-.347.223-.644.075-.297-.15-1.255-.463-2.39-1.475-.883-.788-1.48-1.761-1.653-2.059-.173-.297-.018-.458.13-.606.134-.133.298-.347.446-.52.149-.174.198-.298.298-.497.099-.198.05-.371-.025-.52-.075-.149-.669-1.612-.916-2.207-.242-.579-.487-.5-.669-.51-.173-.008-.371-.01-.57-.01-.198 0-.52.074-.792.372-.272.297-1.04 1.016-1.04 2.479 0 1.462 1.065 2.875 1.213 3.074.149.198 2.096 3.2 5.077 4.487.709.306 1.262.489 1.694.625.712.227 1.36.195 1.871.118.571-.085 1.758-.719 2.006-1.413.248-.694.248-1.289.173-1.413-.074-.124-.272-.198-.57-.347m-5.421 7.403h-.004a9.87 9.87 0 01-5.031-1.378l-.361-.214-3.741.982.998-3.648-.235-.374a9.86 9.86 0 01-1.51-5.26c.001-5.45 4.436-9.884 9.888-9.884 2.64 0 5.122 1.03 6.988 2.898a9.825 9.825 0 012.893 6.994c-.003 5.45-4.437 9.884-9.885 9.884m8.413-18.297A11.815 11.815 0 0012.05 0C5.495 0 .16 5.335.157 11.892c0 2.096.547 4.142 1.588 5.945L0 24l6.335-1.662c1.746.953 3.71 1.456 5.705 1.457h.004c6.554 0 11.89-5.335 11.893-11.893a11.821 11.821 0 00-3.48-8.413z" />
                  </svg>
                  <span>Share WhatsApp</span>
                </>
              )}
            </button>
          </div>
        </form>

        {/* Existing Buddies List */}
        <div className="space-y-3 pt-3 border-t border-slate-150 dark:border-slate-850">
          <h4 className="text-[10px] font-extrabold uppercase tracking-wider text-slate-450 dark:text-slate-500">Travel Buddies Invited</h4>
          
          {loading ? (
            <div className="text-center py-6">
              <span className="inline-block w-5 h-5 border-2 border-teal-500 border-t-transparent rounded-full animate-spin" />
            </div>
          ) : invitations.length === 0 ? (
            <p className="text-xs text-slate-400 dark:text-slate-500 font-semibold italic text-center py-4 bg-slate-50/50 dark:bg-slate-950/20 rounded-2xl border border-dashed border-slate-150 dark:border-slate-850">
              No travel buddies invited yet. Bring companions along to share this journey!
            </p>
          ) : (
            <div className="space-y-2 max-h-40 overflow-y-auto pr-1">
              {invitations.map((inv) => (
                <div 
                  key={inv.id} 
                  className="flex items-center justify-between p-3 bg-slate-50 dark:bg-slate-950 border border-slate-100 dark:border-slate-850 rounded-2xl"
                >
                  <div className="space-y-1">
                    <span className="text-xs font-extrabold text-slate-800 dark:text-slate-200 block truncate max-w-[240px]">{inv.recipientEmail}</span>
                    <span className="flex items-center gap-1 text-[10px] font-bold text-slate-400 dark:text-slate-500">
                      {inv.accessType === "write" ? (
                        <span className="text-teal-600 dark:text-teal-400 bg-teal-500/10 px-1.5 py-0.5 rounded">Read-Write</span>
                      ) : (
                        <span className="text-slate-500 dark:text-slate-400 bg-slate-500/10 px-1.5 py-0.5 rounded">Read-Only</span>
                      )}
                      <span>•</span>
                      {inv.status === "accepted" ? (
                        <span className="text-emerald-600 dark:text-emerald-400 flex items-center gap-0.5">
                          <Check className="w-3 h-3" /> Accepted
                        </span>
                      ) : inv.status === "declined" ? (
                        <span className="text-rose-500 flex items-center gap-0.5">Declined</span>
                      ) : (
                        <span className="text-amber-500 flex items-center gap-0.5">
                          <Clock className="w-3 h-3" /> Pending
                        </span>
                      )}
                    </span>
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>
      </div>

      <GoogleContactsModal
        isOpen={isGoogleContactsOpen}
        onClose={() => setIsGoogleContactsOpen(false)}
        onSelectContact={handleSelectGoogleContact}
        onInviteContacts={handleBatchInviteGoogleContacts}
        tripDestination={tripDestination}
      />
    </div>
  );
}
