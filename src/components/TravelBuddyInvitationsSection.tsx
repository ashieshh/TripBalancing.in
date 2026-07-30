import React from "react";
import { Mail, Compass, ShieldCheck, Shield, MapPin, Clock, Check } from "lucide-react";
import { BuddyInvitation } from "../types";

interface TravelBuddyInvitationsSectionProps {
  incomingInvitations: BuddyInvitation[];
  getInviterDisplayName: (email: string) => string;
  formatTimeSent: (dateStr?: string) => string;
  processingInvId: string | null;
  handleDeclineInvite: (id: string) => void;
  handleAcceptInvite: (id: string, destination?: string) => void;
}

export default function TravelBuddyInvitationsSection({
  incomingInvitations,
  getInviterDisplayName,
  formatTimeSent,
  processingInvId,
  handleDeclineInvite,
  handleAcceptInvite,
}: TravelBuddyInvitationsSectionProps) {
  if (incomingInvitations.length === 0) return null;

  return (
    <div className="space-y-3 animate-in fade-in slide-in-from-top-4 duration-300">
      <div className="flex items-center gap-2">
        <Mail className="w-4 h-4 text-teal-600 dark:text-teal-400" />
        <h3 className="text-xs font-extrabold text-slate-500 dark:text-slate-400 uppercase tracking-wider">
          Travel Buddy Invitations ({incomingInvitations.length})
        </h3>
      </div>
      
      <div className="grid grid-cols-1 md:grid-cols-2 gap-3.5">
        {incomingInvitations.map((inv) => (
          <div 
            key={inv.id} 
            className="p-3.5 sm:p-4 bg-white dark:bg-slate-900 border border-slate-200/80 dark:border-slate-800 rounded-2xl shadow-sm hover:shadow-md hover:border-slate-300 dark:hover:border-slate-700 transition-all duration-200 hover:-translate-y-0.5 flex flex-col justify-between gap-3 group"
          >
            <div className="flex items-start gap-3">
              {/* Small Travel Icon */}
              <div className="w-9 h-9 rounded-xl bg-teal-500/10 dark:bg-teal-500/20 text-teal-600 dark:text-teal-400 flex items-center justify-center flex-shrink-0 border border-teal-500/20 mt-0.5">
                <Compass className="w-4 h-4 animate-spin-slow" />
              </div>

              {/* Main Details */}
              <div className="flex-1 min-w-0 space-y-1">
                {/* Header Row: Inviter Display Name + Badge */}
                <div className="flex items-center justify-between gap-2 flex-wrap">
                  <div className="flex items-center gap-1.5 min-w-0 truncate">
                    <span className="text-xs font-black text-slate-800 dark:text-slate-100 truncate">
                      {getInviterDisplayName(inv.senderEmail)}
                    </span>
                    <span className="text-[11px] text-slate-400 dark:text-slate-500 font-normal truncate">
                      ({inv.senderEmail})
                    </span>
                  </div>

                  <div className="flex items-center gap-2 flex-shrink-0">
                    {inv.accessType === "write" ? (
                      <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-md text-[10px] font-extrabold bg-teal-500/10 text-teal-700 dark:text-teal-400 border border-teal-500/20">
                        <ShieldCheck className="w-3 h-3" />
                        Editor
                      </span>
                    ) : (
                      <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-md text-[10px] font-extrabold bg-slate-100 dark:bg-slate-800 text-slate-600 dark:text-slate-300 border border-slate-200 dark:border-slate-700">
                        <Shield className="w-3 h-3" />
                        Viewer
                      </span>
                    )}
                  </div>
                </div>

                {/* Trip Name and Time Sent */}
                <div className="flex items-center justify-between gap-2 flex-wrap text-xs">
                  <h4 className="font-bold text-slate-700 dark:text-slate-300 flex items-center gap-1 min-w-0 truncate">
                    <MapPin className="w-3.5 h-3.5 text-teal-500 flex-shrink-0" />
                    <span className="truncate">
                      Trip: <span className="text-teal-600 dark:text-teal-400 font-extrabold">{inv.tripDetails?.destination || "Shared Travel Plan"}</span>
                    </span>
                  </h4>

                  <span className="text-[10px] font-medium text-slate-400 dark:text-slate-500 flex items-center gap-1 flex-shrink-0">
                    <Clock className="w-3 h-3" />
                    {formatTimeSent(inv.createdAt)}
                  </span>
                </div>
              </div>
            </div>

            {/* Bottom-right Action Buttons */}
            <div className="flex items-center gap-2 justify-end pt-2 border-t border-slate-100 dark:border-slate-800/60">
              <button
                id={`decline-invite-btn-${inv.id}`}
                disabled={processingInvId === inv.id}
                onClick={() => handleDeclineInvite(inv.id)}
                className="px-3 py-1.5 border border-slate-200 dark:border-slate-700 bg-transparent hover:bg-rose-50 dark:hover:bg-rose-950/20 text-slate-600 hover:text-rose-600 dark:text-slate-300 dark:hover:text-rose-400 text-xs font-bold rounded-xl cursor-pointer transition-all active:scale-95 disabled:opacity-50"
              >
                Decline
              </button>
              <button
                id={`accept-invite-btn-${inv.id}`}
                disabled={processingInvId === inv.id}
                onClick={() => handleAcceptInvite(inv.id, inv.tripDetails?.destination)}
                className="px-3.5 py-1.5 bg-teal-600 hover:bg-teal-700 text-white text-xs font-extrabold rounded-xl cursor-pointer transition-all shadow-sm shadow-teal-500/10 active:scale-95 flex items-center gap-1.5 disabled:opacity-50"
              >
                {processingInvId === inv.id ? (
                  <span className="animate-spin text-xs">⌛</span>
                ) : (
                  <Check className="w-3.5 h-3.5 stroke-[3]" />
                )}
                <span>Accept</span>
              </button>
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}
