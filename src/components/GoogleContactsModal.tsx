import React, { useState, useEffect } from "react";
import { 
  Users, Search, RefreshCw, Check, Mail, Phone, ExternalLink, 
  Sparkles, LogOut, ShieldCheck, UserPlus, AlertCircle, Loader2
} from "lucide-react";
import { 
  GoogleContact, 
  signInWithGoogleContacts, 
  fetchGoogleContacts, 
  getGoogleAccessToken, 
  disconnectGoogleAuth 
} from "../lib/googleContacts";

interface GoogleContactsModalProps {
  isOpen: boolean;
  onClose: () => void;
  onSelectContact?: (contact: GoogleContact) => void;
  onInviteContacts?: (contacts: GoogleContact[]) => void;
  tripDestination?: string;
}

export default function GoogleContactsModal({
  isOpen,
  onClose,
  onSelectContact,
  onInviteContacts,
  tripDestination
}: GoogleContactsModalProps) {
  const [contacts, setContacts] = useState<GoogleContact[]>([]);
  const [selectedContactIds, setSelectedContactIds] = useState<Set<string>>(new Set());
  const [searchQuery, setSearchQuery] = useState("");
  const [loading, setLoading] = useState(false);
  const [connecting, setConnecting] = useState(false);
  const [error, setError] = useState("");
  const [isConnected, setIsConnected] = useState(false);
  const [userEmail, setUserEmail] = useState<string | null>(null);

  useEffect(() => {
    if (isOpen) {
      const token = getGoogleAccessToken();
      if (token) {
        setIsConnected(true);
        loadContacts(token);
      }
    }
  }, [isOpen]);

  const loadContacts = async (token?: string) => {
    setLoading(true);
    setError("");
    try {
      const list = await fetchGoogleContacts(token);
      setContacts(list);
      setIsConnected(true);
    } catch (err: any) {
      console.error("Load contacts error:", err);
      setError(err?.message || "Failed to load Google Contacts. Try reconnecting your account.");
    } finally {
      setLoading(false);
    }
  };

  const handleConnectGoogle = async () => {
    setConnecting(true);
    setError("");
    try {
      const { user, contacts: loadedContacts } = await signInWithGoogleContacts();
      setUserEmail(user.email);
      setContacts(loadedContacts);
      setIsConnected(true);
    } catch (err: any) {
      console.error("Google sign in error:", err);
      setError(err?.message || "Failed to connect Google account. Please try again.");
    } finally {
      setConnecting(false);
    }
  };

  const handleDisconnect = async () => {
    await disconnectGoogleAuth();
    setIsConnected(false);
    setContacts([]);
    setSelectedContactIds(new Set());
    setUserEmail(null);
  };

  const toggleSelectContact = (id: string) => {
    const next = new Set(selectedContactIds);
    if (next.has(id)) {
      next.delete(id);
    } else {
      next.add(id);
    }
    setSelectedContactIds(next);
  };

  const handleSingleSelect = (contact: GoogleContact) => {
    if (onSelectContact) {
      onSelectContact(contact);
      onClose();
    }
  };

  const handleBatchInvite = () => {
    const selected = contacts.filter((c) => selectedContactIds.has(c.id));
    if (selected.length > 0 && onInviteContacts) {
      onInviteContacts(selected);
      onClose();
    }
  };

  const filteredContacts = contacts.filter((c) => {
    const q = searchQuery.toLowerCase();
    return (
      c.name.toLowerCase().includes(q) ||
      c.email.toLowerCase().includes(q) ||
      (c.phone && c.phone.toLowerCase().includes(q))
    );
  });

  if (!isOpen) return null;

  return (
    <div 
      className="fixed inset-0 z-50 bg-black/70 backdrop-blur-md flex items-center justify-center p-4"
      onClick={onClose}
    >
      <div 
        className="bg-white dark:bg-slate-900 border border-slate-100 dark:border-slate-800 rounded-3xl max-w-xl w-full p-6 shadow-2xl space-y-5 animate-in fade-in zoom-in-95 duration-150 text-left max-h-[90vh] flex flex-col"
        onClick={(e) => e.stopPropagation()}
      >
        {/* Modal Header */}
        <div className="flex items-center justify-between pb-3 border-b border-slate-100 dark:border-slate-800">
          <div className="flex items-center gap-2.5">
            <div className="p-2.5 bg-teal-500/10 dark:bg-teal-500/20 text-teal-600 dark:text-teal-400 rounded-2xl">
              <Users className="w-5 h-5" />
            </div>
            <div>
              <h3 className="text-base font-black text-slate-800 dark:text-slate-100 flex items-center gap-2">
                <span>Google Contacts</span>
                {isConnected && (
                  <span className="text-[10px] font-bold bg-emerald-500/10 text-emerald-600 dark:text-emerald-400 px-2 py-0.5 rounded-full flex items-center gap-1">
                    <ShieldCheck className="w-3 h-3" /> Connected
                  </span>
                )}
              </h3>
              <p className="text-xs text-slate-500 dark:text-slate-400 font-medium">
                {tripDestination ? `Invite companions from Google Contacts to ${tripDestination}` : "Import travel buddies and trip companions from your Google Contacts"}
              </p>
            </div>
          </div>
          <button
            onClick={onClose}
            className="text-slate-400 hover:text-slate-600 dark:text-slate-500 dark:hover:text-slate-300 p-1.5 rounded-lg hover:bg-slate-100 dark:hover:bg-slate-800 transition-all font-bold text-sm"
          >
            ✕
          </button>
        </div>

        {/* Connection Banner if not connected */}
        {!isConnected ? (
          <div className="py-8 px-6 bg-gradient-to-br from-teal-500/5 via-emerald-500/5 to-transparent rounded-2xl border border-teal-500/20 text-center space-y-4">
            <div className="w-14 h-14 bg-white dark:bg-slate-800 shadow-md rounded-2xl mx-auto flex items-center justify-center text-teal-600 dark:text-teal-400">
              <svg className="w-8 h-8" viewBox="0 0 48 48">
                <path fill="#EA4335" d="M24 9.5c3.54 0 6.71 1.22 9.21 3.6l6.85-6.85C35.9 2.38 30.47 0 24 0 14.62 0 6.51 5.38 2.56 13.22l7.98 6.19C12.43 13.72 17.74 9.5 24 9.5z"></path>
                <path fill="#4285F4" d="M46.98 24.55c0-1.57-.15-3.09-.38-4.55H24v9.02h12.94c-.58 2.96-2.26 5.48-4.78 7.18l7.73 6c4.51-4.18 7.09-10.36 7.09-17.65z"></path>
                <path fill="#FBBC05" d="M10.53 28.59c-.48-1.45-.76-2.99-.76-4.59s.27-3.14.76-4.59l-7.98-6.19C.92 16.46 0 20.12 0 24c0 3.88.92 7.54 2.56 10.78l7.97-6.19z"></path>
                <path fill="#34A853" d="M24 48c6.48 0 11.93-2.13 15.89-5.81l-7.73-6c-2.15 1.45-4.92 2.3-8.16 2.3-6.26 0-11.57-4.22-13.47-9.91l-7.98 6.19C6.51 42.62 14.62 48 24 48z"></path>
              </svg>
            </div>
            <div className="max-w-md mx-auto space-y-1">
              <h4 className="text-sm font-black text-slate-800 dark:text-slate-100">Connect Google Contacts</h4>
              <p className="text-xs text-slate-500 dark:text-slate-400 font-medium leading-relaxed">
                Seamlessly pull address book emails & phone numbers to invite travel buddies, split trip budgets, and share itineraries with permission.
              </p>
            </div>

            {error && (
              <div className="p-3 bg-rose-50 dark:bg-rose-950/30 border border-rose-200 dark:border-rose-900/40 text-rose-600 dark:text-rose-400 text-xs font-semibold rounded-xl flex items-center justify-center gap-2">
                <AlertCircle className="w-4 h-4 flex-shrink-0" />
                <span>{error}</span>
              </div>
            )}

            <button
              onClick={handleConnectGoogle}
              disabled={connecting}
              className="px-6 py-3 bg-slate-900 dark:bg-white hover:bg-slate-800 dark:hover:bg-slate-100 text-white dark:text-slate-900 text-xs font-extrabold rounded-2xl shadow-lg transition-all flex items-center justify-center gap-2 mx-auto"
            >
              {connecting ? (
                <>
                  <Loader2 className="w-4 h-4 animate-spin" />
                  <span>Connecting Google Account...</span>
                </>
              ) : (
                <>
                  <Sparkles className="w-4 h-4 text-amber-400" />
                  <span>Authorize Google Contacts</span>
                </>
              )}
            </button>
          </div>
        ) : (
          /* Connected View with Contacts list */
          <div className="space-y-4 flex-1 overflow-hidden flex flex-col">
            {/* Search and Action Toolbar */}
            <div className="flex items-center gap-2">
              <div className="relative flex-1">
                <Search className="w-4 h-4 absolute left-3.5 top-3 text-slate-400 pointer-events-none" />
                <input
                  type="text"
                  placeholder="Search by name, email, or phone..."
                  value={searchQuery}
                  onChange={(e) => setSearchQuery(e.target.value)}
                  className="w-full pl-9 pr-3.5 py-2 bg-slate-50 dark:bg-slate-950 border border-slate-200 dark:border-slate-800 rounded-xl text-xs font-medium focus:ring-1 focus:ring-teal-500 focus:outline-none"
                />
              </div>

              <button
                onClick={() => loadContacts()}
                disabled={loading}
                title="Refresh contacts"
                className="p-2 bg-slate-100 dark:bg-slate-800 hover:bg-slate-200 dark:hover:bg-slate-700 text-slate-600 dark:text-slate-300 rounded-xl transition-all"
              >
                <RefreshCw className={`w-4 h-4 ${loading ? "animate-spin text-teal-500" : ""}`} />
              </button>

              <button
                onClick={handleDisconnect}
                title="Disconnect Google Contacts"
                className="p-2 bg-slate-100 dark:bg-slate-800 hover:bg-rose-50 hover:text-rose-600 dark:hover:bg-rose-950/40 text-slate-500 rounded-xl transition-all"
              >
                <LogOut className="w-4 h-4" />
              </button>
            </div>

            {error && (
              <div className="p-2.5 bg-rose-50 dark:bg-rose-950/30 border border-rose-200 dark:border-rose-900/40 text-rose-600 dark:text-rose-400 text-xs font-semibold rounded-xl flex items-center gap-2">
                <AlertCircle className="w-4 h-4 flex-shrink-0" />
                <span>{error}</span>
              </div>
            )}

            {/* Contacts Scrollable List */}
            <div className="flex-1 overflow-y-auto pr-1 space-y-2 min-h-[220px]">
              {loading ? (
                <div className="flex flex-col items-center justify-center py-12 text-slate-400 space-y-2">
                  <Loader2 className="w-6 h-6 animate-spin text-teal-500" />
                  <p className="text-xs font-semibold">Loading contacts from Google People API...</p>
                </div>
              ) : filteredContacts.length === 0 ? (
                <div className="text-center py-12 px-4 bg-slate-50 dark:bg-slate-950/40 rounded-2xl border border-dashed border-slate-200 dark:border-slate-800">
                  <Users className="w-8 h-8 text-slate-300 mx-auto mb-2" />
                  <p className="text-xs font-bold text-slate-600 dark:text-slate-300">
                    {searchQuery ? `No contacts matching "${searchQuery}"` : "No Google Contacts found"}
                  </p>
                  <p className="text-[10px] text-slate-400 font-medium mt-1">
                    Ensure your Google account has contacts saved or try refreshing.
                  </p>
                </div>
              ) : (
                filteredContacts.map((contact) => {
                  const isSelected = selectedContactIds.has(contact.id);
                  return (
                    <div
                      key={contact.id}
                      className={`p-3 rounded-2xl border transition-all flex items-center justify-between gap-3 ${
                        isSelected
                          ? "border-teal-500 bg-teal-500/5 dark:bg-teal-500/10"
                          : "border-slate-150 dark:border-slate-800/80 hover:bg-slate-50 dark:hover:bg-slate-850 bg-white dark:bg-slate-950"
                      }`}
                    >
                      <div className="flex items-center gap-3 min-w-0">
                        {contact.photoUrl ? (
                          <img
                            src={contact.photoUrl}
                            alt={contact.name}
                            className="w-9 h-9 rounded-full object-cover border border-slate-200 dark:border-slate-700 flex-shrink-0"
                            referrerPolicy="no-referrer"
                          />
                        ) : (
                          <div className="w-9 h-9 rounded-full bg-gradient-to-tr from-teal-500 to-emerald-500 text-white font-extrabold text-xs flex items-center justify-center flex-shrink-0">
                            {contact.name.substring(0, 2).toUpperCase()}
                          </div>
                        )}

                        <div className="min-w-0">
                          <h4 className="text-xs font-black text-slate-800 dark:text-slate-100 truncate">
                            {contact.name}
                          </h4>
                          <div className="flex flex-wrap items-center gap-x-3 gap-y-0.5 text-[10px] text-slate-500 dark:text-slate-400 font-medium">
                            {contact.email && (
                              <span className="flex items-center gap-1 truncate max-w-[200px]">
                                <Mail className="w-3 h-3 text-slate-400" />
                                {contact.email}
                              </span>
                            )}
                            {contact.phone && (
                              <span className="flex items-center gap-1">
                                <Phone className="w-3 h-3 text-slate-400" />
                                {contact.phone}
                              </span>
                            )}
                          </div>
                        </div>
                      </div>

                      {/* Select / Action Buttons */}
                      <div className="flex items-center gap-1.5 flex-shrink-0">
                        {onInviteContacts && (
                          <button
                            type="button"
                            onClick={() => toggleSelectContact(contact.id)}
                            className={`p-2 rounded-xl text-xs font-bold transition-all ${
                              isSelected
                                ? "bg-teal-500 text-white"
                                : "bg-slate-100 dark:bg-slate-800 text-slate-600 dark:text-slate-300 hover:bg-slate-200"
                            }`}
                          >
                            <Check className="w-4 h-4" />
                          </button>
                        )}

                        {onSelectContact && (
                          <button
                            type="button"
                            onClick={() => handleSingleSelect(contact)}
                            className="px-3 py-1.5 bg-teal-500 hover:bg-teal-600 text-white text-[10px] font-black rounded-xl transition-all flex items-center gap-1"
                          >
                            <UserPlus className="w-3 h-3" />
                            <span>Select</span>
                          </button>
                        )}
                      </div>
                    </div>
                  );
                })
              )}
            </div>

            {/* Batch Action Footer */}
            {onInviteContacts && selectedContactIds.size > 0 && (
              <div className="pt-3 border-t border-slate-100 dark:border-slate-800 flex items-center justify-between">
                <span className="text-xs font-bold text-slate-600 dark:text-slate-300">
                  {selectedContactIds.size} contact{selectedContactIds.size > 1 ? "s" : ""} selected
                </span>
                <button
                  type="button"
                  onClick={handleBatchInvite}
                  className="px-4 py-2 bg-gradient-to-r from-teal-500 to-emerald-500 text-white text-xs font-black rounded-xl shadow-md transition-all flex items-center gap-1.5"
                >
                  <UserPlus className="w-3.5 h-3.5" />
                  <span>Invite Selected ({selectedContactIds.size})</span>
                </button>
              </div>
            )}
          </div>
        )}
      </div>
    </div>
  );
}
