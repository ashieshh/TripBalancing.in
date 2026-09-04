import React, { useState, useEffect } from "react";
import { db } from "../lib/supabase";
import { 
  ShieldCheck, ShieldAlert, Users, CreditCard, RefreshCw, HelpCircle, 
  Lock, AlertTriangle, Search, Filter, ChevronLeft, ChevronRight, 
  CheckCircle2, XCircle, Clock, ArrowLeft, Database, Activity, Server,
  Sparkles, Zap, Crown, DollarSign, Calendar, Eye, Mail, FileText, Star, MessageSquare, Trash2
} from "lucide-react";

interface AdminDashboardProps {
  onBackToApp: () => void;
  sessionToken?: string | null;
}

type AdminTab = "overview" | "users" | "payments" | "subscriptions" | "tickets" | "reviews" | "refunds" | "security" | "emails";

export default function AdminDashboard({ onBackToApp, sessionToken }: AdminDashboardProps) {
  const [activeTab, setActiveTab] = useState<AdminTab>("overview");
  
  // Auth & Access Status
  const [accessState, setAccessState] = useState<"checking" | "granted" | "denied_401" | "denied_403">("checking");
  const [adminUser, setAdminUser] = useState<any>(null);
  const [accessError, setAccessError] = useState<string>("");

  // Data states
  const [overview, setOverview] = useState<any>(null);
  const [usersData, setUsersData] = useState<any>({ users: [], total: 0, page: 1, totalPages: 1 });
  const [paymentsData, setPaymentsData] = useState<any>({ payments: [], total: 0 });
  const [subsData, setSubsData] = useState<any>({ subscriptions: [], total: 0 });
  const [ticketsData, setTicketsData] = useState<any>({ tickets: [], total: 0 });
  const [refundsData, setRefundsData] = useState<any>({ requests: [], total: 0 });
  const [reviewsData, setReviewsData] = useState<any>({ reviews: [], total: 0, pending: 0, approved: 0, rejected: 0, averageRating: 0 });
  const [securityData, setSecurityData] = useState<any>({ tables: [], failedAccessLogs: [] });

  // Filters & Search
  const [userSearch, setUserSearch] = useState("");
  const [userPlanFilter, setUserPlanFilter] = useState("all");
  const [userPage, setUserPage] = useState(1);

  // Loading & error per tab
  const [tabLoading, setTabLoading] = useState(false);
  const [tabError, setTabError] = useState<string | null>(null);

  // Email Tester & Action States
  const [testEmailRecipient, setTestEmailRecipient] = useState("support@tripbalancing.in");
  const [testTemplateType, setTestTemplateType] = useState("welcome");
  const [testEmailSending, setTestEmailSending] = useState(false);
  const [testEmailStatus, setTestEmailStatus] = useState<string | null>(null);
  const [refActionLoading, setRefActionLoading] = useState<string | null>(null);
  const [reviewActionLoading, setReviewActionLoading] = useState<string | null>(null);

  const handleReviewAction = async (review: any, action: "approve" | "reject" | "delete") => {
    if (action === "delete" && !window.confirm("Permanently delete this review and rating?")) return;
    setReviewActionLoading(review.id);
    try {
      const headers = await getAuthHeaders();
      const response = await fetch("/api/admin/reviews/action", {
        method: "POST",
        headers,
        body: JSON.stringify({ tripId: review.trip_id, action })
      });
      const result = await response.json().catch(() => ({}));
      if (!response.ok) throw new Error(result?.error || "Review action failed");
      const refreshed = await fetch("/api/admin/reviews", { headers });
      if (refreshed.ok) setReviewsData(await refreshed.json());
    } catch (err: any) {
      alert(err?.message || "Could not update this review.");
    } finally {
      setReviewActionLoading(null);
    }
  };

  const handleRefundDecision = async (r: any, action: "approve" | "reject") => {
    setRefActionLoading(r.id);
    try {
      const token = await db.getAccessToken();
      if (!token) throw new Error("Admin session expired");
      const res = await fetch("/api/admin/refunds/action", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          "Authorization": `Bearer ${token}`
        },
        body: JSON.stringify({
          requestId: r.id,
          action,
          userEmail: r.user_email,
          razorpayPaymentId: r.razorpay_payment_id,
          amount: 499,
          reason: action === "reject" ? "Request outside 7-day money-back window or credits utilized." : undefined
        })
      });
      const data = await res.json();
      if (res.ok && data.success) {
        alert(`Refund request ${action === "approve" ? "APPROVED" : "REJECTED"}. Transactional email dispatched to ${r.user_email} via Brevo SMTP.`);
        const refRes = await fetch("/api/admin/refund-requests", {
          headers: { "Authorization": `Bearer ${token}` }
        });
        if (refRes.ok) setRefundsData(await refRes.json());
      } else {
        alert(`Action failed: ${data.error || "Unknown error"}`);
      }
    } catch (err: any) {
      alert(`Error processing refund action: ${err.message}`);
    } finally {
      setRefActionLoading(null);
    }
  };

  const handleSendTestEmail = async (e: React.FormEvent) => {
    e.preventDefault();
    setTestEmailSending(true);
    setTestEmailStatus(null);
    try {
      const token = await db.getAccessToken();
      if (!token) throw new Error("Admin session expired.");
      const res = await fetch("/api/email/send-transactional", {
        method: "POST",
        headers: { "Content-Type": "application/json", "Authorization": `Bearer ${token}` },
        body: JSON.stringify({
          templateType: testTemplateType,
          recipientEmail: testEmailRecipient,
          payload: {
            userName: testEmailRecipient.split("@")[0],
            name: testEmailRecipient.split("@")[0],
            planPurchased: "yearly",
            amountPaid: 499,
            razorpayPaymentId: "pay_test_" + Math.floor(100000 + Math.random() * 900000),
            purchaseDate: new Date().toLocaleDateString("en-US", { month: "short", day: "numeric", year: "numeric" }),
            attemptedPlan: "Pro Annual Plan",
            orderId: "order_test_999",
            plan: "Pro Plan",
            requestDate: new Date().toLocaleDateString("en-US"),
            amountRefunded: 499,
            approvedDate: new Date().toLocaleDateString("en-US"),
            reason: "Request submitted outside 7-day policy.",
            userEmail: testEmailRecipient,
            ticketRef: "#TB-" + Math.floor(100000 + Math.random() * 900000),
            subjectText: "Test Support Inquiry",
            messageText: "Testing Brevo SMTP email template delivery from TripBalancing Admin Portal."
          }
        })
      });
      const data = await res.json();
      if (res.ok && data.success) {
        setTestEmailStatus(`✅ Email Dispatch Success! (Simulated Mode: ${data.result?.simulated ? "Yes" : "No"}, MessageID: ${data.result?.messageId || "N/A"})`);
      } else {
        setTestEmailStatus(`❌ Email Dispatch Error: ${data.error || "Unknown error"}`);
      }
    } catch (err: any) {
      setTestEmailStatus(`❌ Error: ${err.message}`);
    } finally {
      setTestEmailSending(false);
    }
  };

  // Get Auth Header
  const getAuthHeaders = async () => {
    const token = await db.getAccessToken();
      if (!token) throw new Error("Admin session expired");
    return {
      "Content-Type": "application/json",
      "Authorization": `Bearer ${token}`
    };
  };

  // Check admin access on mount
  useEffect(() => {
    async function checkAccess() {
      setAccessState("checking");
      try {
        const res = await fetch("/api/admin/check-access", {
          headers: await getAuthHeaders()
        });

        if (res.status === 401) {
          setAccessState("denied_401");
          setAccessError("You are not logged in. Please sign in with an administrator account.");
          return;
        }

        if (res.status === 403) {
          setAccessState("denied_403");
          setAccessError("Access Denied: Your account does not have administrator privileges.");
          return;
        }

        if (!res.ok) {
          throw new Error(`Server returned status ${res.status}`);
        }

        const data = await res.json();
        if (data.isAdmin) {
          setAdminUser(data.user);
          setAccessState("granted");
        } else {
          setAccessState("denied_403");
          setAccessError("Access Denied: Admin authorization required.");
        }
      } catch (err: any) {
        console.error("Admin check error:", err);
        setAccessState("denied_403");
        setAccessError(err.message || "Failed to verify admin status.");
      }
    }

    checkAccess();
  }, [sessionToken]);

  // Fetch data when active tab changes or filters change
  useEffect(() => {
    if (accessState !== "granted") return;

    async function fetchTabData() {
      setTabLoading(true);
      setTabError(null);
      try {
        const headers = await getAuthHeaders();

        if (activeTab === "overview") {
          const res = await fetch("/api/admin/overview", { headers });
          if (!res.ok) throw new Error(`HTTP ${res.status}`);
          const data = await res.json();
          setOverview(data);
        } else if (activeTab === "users") {
          const res = await fetch(`/api/admin/users?page=${userPage}&search=${encodeURIComponent(userSearch)}&plan=${userPlanFilter}`, { headers });
          const data = await res.json().catch(() => ({}));
          if (!res.ok) throw new Error(data?.error || `HTTP ${res.status}`);
          setUsersData(data);
        } else if (activeTab === "payments") {
          const res = await fetch("/api/admin/payments", { headers });
          if (!res.ok) throw new Error(`HTTP ${res.status}`);
          const data = await res.json();
          setPaymentsData(data);
        } else if (activeTab === "subscriptions") {
          const res = await fetch("/api/admin/subscriptions", { headers });
          if (!res.ok) throw new Error(`HTTP ${res.status}`);
          const data = await res.json();
          setSubsData(data);
        } else if (activeTab === "tickets") {
          const res = await fetch("/api/admin/support-tickets", { headers });
          if (!res.ok) throw new Error(`HTTP ${res.status}`);
          const data = await res.json();
          setTicketsData(data);
        } else if (activeTab === "refunds") {
          const res = await fetch("/api/admin/refund-requests", { headers });
          if (!res.ok) throw new Error(`HTTP ${res.status}`);
          const data = await res.json();
          setRefundsData(data);
        } else if (activeTab === "reviews") {
          const res = await fetch("/api/admin/reviews", { headers });
          const data = await res.json().catch(() => ({}));
          if (!res.ok) throw new Error(data?.error || `HTTP ${res.status}`);
          setReviewsData(data);
        } else if (activeTab === "security") {
          const res = await fetch("/api/admin/security-audit", { headers });
          if (!res.ok) throw new Error(`HTTP ${res.status}`);
          const data = await res.json();
          setSecurityData(data);
        }
      } catch (err: any) {
        console.error(`Error loading tab ${activeTab}:`, err);
        setTabError(err.message || `Failed to fetch ${activeTab} data`);
      } finally {
        setTabLoading(false);
      }
    }

    fetchTabData();
  }, [activeTab, accessState, userPage, userSearch, userPlanFilter]);

  // Access Denied / Unauthenticated State
  if (accessState === "checking") {
    return (
      <div className="min-h-screen bg-slate-950 text-slate-100 flex flex-col items-center justify-center p-6 space-y-4">
        <div className="w-16 h-16 rounded-2xl bg-teal-500/10 border border-teal-500/20 flex items-center justify-center animate-pulse">
          <ShieldCheck className="w-8 h-8 text-teal-400" />
        </div>
        <div className="text-center space-y-1">
          <h2 className="text-lg font-bold text-white">Verifying Admin Permissions...</h2>
          <p className="text-xs text-slate-400">Communicating with secure Express authorization gateway...</p>
        </div>
      </div>
    );
  }

  if (accessState === "denied_401" || accessState === "denied_403") {
    return (
      <div className="min-h-screen bg-slate-950 text-slate-100 flex flex-col items-center justify-center p-6">
        <div className="max-w-md w-full bg-slate-900 border border-slate-800 rounded-3xl p-8 text-center space-y-6 shadow-2xl">
          <div className="w-16 h-16 rounded-2xl bg-rose-500/10 border border-rose-500/20 flex items-center justify-center mx-auto text-rose-400">
            <ShieldAlert className="w-8 h-8" />
          </div>

          <div className="space-y-2">
            <span className="inline-block px-3 py-1 rounded-full bg-rose-500/20 text-rose-300 font-extrabold text-[10px] uppercase tracking-wider">
              {accessState === "denied_401" ? "401 Unauthorized" : "403 Access Denied"}
            </span>
            <h2 className="text-xl font-black text-white tracking-tight">
              {accessState === "denied_401" ? "Authentication Required" : "Admin Privileges Required"}
            </h2>
            <p className="text-xs text-slate-400 leading-relaxed">
              {accessError || "You do not have permission to view the TripBalancing Admin Portal. Admin status is validated directly against the Supabase database."}
            </p>
          </div>

          <div className="p-3 bg-slate-950 rounded-2xl border border-slate-850 text-left space-y-1">
            <div className="text-[10px] font-bold text-slate-500 uppercase tracking-wider">Security Policy Log</div>
            <div className="text-[11px] font-mono text-slate-400">
              • Access attempt logged at {new Date().toLocaleTimeString()}<br/>
              • Status: {accessState === "denied_401" ? "HTTP 401 Unauthorized" : "HTTP 403 Forbidden"}<br/>
              • Admin Table Check: Failed
            </div>
          </div>

          <button
            onClick={onBackToApp}
            className="w-full py-3 bg-slate-800 hover:bg-slate-700 text-white font-bold text-xs rounded-xl transition-all flex items-center justify-center gap-2 cursor-pointer"
          >
            <ArrowLeft className="w-4 h-4" />
            <span>Return to Travel Hub</span>
          </button>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-slate-950 text-slate-100 flex flex-col font-sans">
      {/* Top Admin Header Bar */}
      <header className="border-b border-slate-850 bg-slate-900/90 backdrop-blur-md sticky top-0 z-40">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 h-16 flex items-center justify-between gap-4">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-xl bg-teal-500/10 border border-teal-500/20 flex items-center justify-center text-teal-400 shadow-inner">
              <ShieldCheck className="w-5 h-5" />
            </div>
            <div>
              <div className="flex items-center gap-2">
                <span className="text-sm font-black text-white tracking-tight">TripBalancing</span>
                <span className="px-2 py-0.5 rounded bg-teal-500/20 border border-teal-500/30 text-teal-300 font-extrabold text-[10px] uppercase tracking-wider">
                  Admin Portal
                </span>
              </div>
              <p className="text-[11px] text-slate-400 font-medium">Verified Admin Session • Read-Only Release</p>
            </div>
          </div>

          <div className="flex items-center gap-3">
            <div className="hidden sm:flex flex-col text-right">
              <span className="text-xs font-bold text-slate-200">{adminUser?.email || "Admin"}</span>
              <span className="text-[10px] text-teal-400 font-semibold uppercase">Super Admin</span>
            </div>

            <button
              onClick={onBackToApp}
              className="px-3.5 py-2 bg-slate-800 hover:bg-slate-700 border border-slate-700 text-slate-200 hover:text-white font-bold text-xs rounded-xl transition-all flex items-center gap-1.5 cursor-pointer"
            >
              <ArrowLeft className="w-3.5 h-3.5" />
              <span>Back to App</span>
            </button>
          </div>
        </div>
      </header>

      {/* Main Container */}
      <main className="flex-1 max-w-7xl w-full mx-auto px-4 sm:px-6 py-6 space-y-6">
        
        {/* Read-Only Notice Banner */}
        <div className="p-4 bg-teal-950/40 border border-teal-800/50 rounded-2xl flex items-center justify-between gap-4 text-xs">
          <div className="flex items-center gap-3">
            <div className="w-8 h-8 rounded-lg bg-teal-500/10 border border-teal-500/20 flex items-center justify-center text-teal-400 flex-shrink-0">
              <Lock className="w-4 h-4" />
            </div>
            <p className="text-slate-300">
              <strong className="text-teal-300 font-bold">Secure Admin Operations:</strong> Account, payment, support, review moderation, email, and security data are restricted to verified administrators.
            </p>
          </div>
        </div>

        {/* Navigation Tabs */}
        <div className="flex items-center gap-2 overflow-x-auto pb-2 border-b border-slate-850 scrollbar-none">
          {[
            { id: "overview", label: "Overview", icon: Activity || Server },
            { id: "users", label: "Users", icon: Users },
            { id: "payments", label: "Payments", icon: CreditCard },
            { id: "subscriptions", label: "Subscriptions", icon: Crown },
            { id: "tickets", label: "Support Tickets", icon: HelpCircle },
            { id: "reviews", label: "Reviews", icon: MessageSquare },
            { id: "refunds", label: "Refund Requests", icon: RefreshCw },
            { id: "emails", label: "Brevo Email Operations", icon: Mail },
            { id: "security", label: "Security Audit", icon: Server }
          ].map((tab) => {
            const Icon = tab.icon || Server;
            const isActive = activeTab === tab.id;
            return (
              <button
                key={tab.id}
                onClick={() => { setActiveTab(tab.id as AdminTab); setUserPage(1); }}
                className={`px-4 py-2.5 rounded-xl font-extrabold text-xs flex items-center gap-2 transition-all shrink-0 cursor-pointer ${
                  isActive
                    ? "bg-teal-500 text-slate-950 shadow-md shadow-teal-500/20"
                    : "bg-slate-900/60 hover:bg-slate-850 text-slate-400 hover:text-slate-200 border border-slate-850"
                }`}
              >
                <Icon className={`w-4 h-4 ${isActive ? "text-slate-950" : "text-slate-400"}`} />
                <span>{tab.label}</span>
              </button>
            );
          })}
        </div>

        {/* Tab Loading Spinner */}
        {tabLoading && (
          <div className="p-12 text-center space-y-3 bg-slate-900/40 border border-slate-850 rounded-3xl">
            <div className="w-8 h-8 border-2 border-teal-500 border-t-transparent rounded-full animate-spin mx-auto" />
            <p className="text-xs font-bold text-slate-400">Fetching latest {activeTab} data...</p>
          </div>
        )}

        {/* Tab Error Alert */}
        {tabError && !tabLoading && (
          <div className="p-4 bg-rose-950/40 border border-rose-800/50 rounded-2xl flex items-center gap-3 text-xs text-rose-300">
            <AlertTriangle className="w-5 h-5 text-rose-400 flex-shrink-0" />
            <span>{tabError}</span>
          </div>
        )}

        {/* TAB 1: OVERVIEW */}
        {activeTab === "overview" && !tabLoading && overview && (
          <div className="space-y-6 animate-in fade-in duration-200">
            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
              
              <MetricCard 
                title="Total Registered Users"
                value={overview.totalRegisteredUsers || 0}
                subtitle={`${overview.usersRegisteredToday || 0} joined today`}
                icon={Users}
                color="teal"
              />

              <MetricCard 
                title="Total Revenue"
                value={`₹${(overview.totalRevenue || 0).toLocaleString()}`}
                subtitle={`${overview.totalSuccessfulPayments || 0} successful transactions`}
                icon={DollarSign}
                color="emerald"
              />

              <MetricCard 
                title="Active Subscriptions"
                value={overview.activeSubscriptions || 0}
                subtitle={`${overview.totalPaidUsers || 0} total paid accounts`}
                icon={Crown}
                color="amber"
              />

              <MetricCard 
                title="Free Users"
                value={overview.freeUsers || 0}
                subtitle="Accounts on starter free tier"
                icon={Zap}
                color="blue"
              />

              <MetricCard 
                title="Open Support Tickets"
                value={overview.openSupportTickets || 0}
                subtitle="Awaiting response / in progress"
                icon={HelpCircle}
                color="rose"
              />

              <MetricCard 
                title="Pending Refund Requests"
                value={overview.pendingRefundRequests || 0}
                subtitle="Within 7-day policy window"
                icon={RefreshCw}
                color="purple"
              />

              <MetricCard
                title="Traveler Reviews"
                value={overview.totalReviews || 0}
                subtitle={`${overview.pendingReviews || 0} pending · ${overview.averageReviewRating || 0}/5 average`}
                icon={Star}
                color="amber"
              />
            </div>

            {/* Quick Status Bar */}
            <div className="p-6 bg-slate-900 border border-slate-800 rounded-3xl space-y-4">
              <h3 className="text-sm font-extrabold text-white flex items-center gap-2">
                {React.createElement(Activity || Server, { className: "w-4 h-4 text-teal-400" })}
                <span>System Operational Status</span>
              </h3>
              <div className="grid grid-cols-1 md:grid-cols-3 gap-4 text-xs">
                <div className="p-3 bg-slate-950 rounded-xl border border-slate-800/80 flex items-center justify-between">
                  <span className="text-slate-400">Database Engine</span>
                  <span className="font-bold text-emerald-400 flex items-center gap-1">
                    <CheckCircle2 className="w-3.5 h-3.5" /> Supabase PG
                  </span>
                </div>
                <div className="p-3 bg-slate-950 rounded-xl border border-slate-800/80 flex items-center justify-between">
                  <span className="text-slate-400">Payment Gateway</span>
                  <span className="font-bold text-emerald-400 flex items-center gap-1">
                    <CheckCircle2 className="w-3.5 h-3.5" /> Razorpay Secured
                  </span>
                </div>
                <div className="p-3 bg-slate-950 rounded-xl border border-slate-800/80 flex items-center justify-between">
                  <span className="text-slate-400">Admin RLS Security</span>
                  <span className="font-bold text-teal-400 flex items-center gap-1">
                    <ShieldCheck className="w-3.5 h-3.5" /> Enabled
                  </span>
                </div>
              </div>
            </div>
          </div>
        )}

        {/* TAB 2: USERS */}
        {activeTab === "users" && !tabLoading && usersData && (
          <div className="space-y-4 animate-in fade-in duration-200">
            {/* Search & Filters */}
            <div className="flex flex-col sm:flex-row items-center justify-between gap-3 p-4 bg-slate-900 border border-slate-800 rounded-2xl">
              <div className="relative w-full sm:w-72">
                <Search className="w-4 h-4 absolute left-3 top-1/2 -translate-y-1/2 text-slate-500" />
                <input
                  type="text"
                  placeholder="Search user email..."
                  value={userSearch}
                  onChange={(e) => { setUserSearch(e.target.value); setUserPage(1); }}
                  className="w-full bg-slate-950 border border-slate-800 rounded-xl pl-9 pr-3 py-2 text-xs font-semibold text-white focus:outline-none focus:border-teal-500"
                />
              </div>

              <div className="flex items-center gap-2 w-full sm:w-auto">
                <Filter className="w-4 h-4 text-slate-500" />
                <select
                  value={userPlanFilter}
                  onChange={(e) => { setUserPlanFilter(e.target.value); setUserPage(1); }}
                  className="bg-slate-950 border border-slate-800 text-xs font-bold text-slate-300 rounded-xl px-3 py-2 focus:outline-none focus:border-teal-500"
                >
                  <option value="all">All Plans</option>
                  <option value="free">Free</option>
                  <option value="pay_per_trip">Pay Per Trip</option>
                  <option value="yearly">Yearly</option>
                  <option value="lifetime">Lifetime</option>
                </select>
              </div>
            </div>

            {/* Users Table */}
            {usersData.users.length === 0 ? (
              <EmptyState title="No users found" description="No registered accounts match your current filter criteria." />
            ) : (
              <div className="bg-slate-900 border border-slate-800 rounded-2xl overflow-x-auto shadow-sm">
                <table className="w-full text-left text-xs">
                  <thead className="bg-slate-950 text-slate-400 font-extrabold uppercase tracking-wider text-[10px] border-b border-slate-800">
                    <tr>
                      <th className="p-3.5">User ID</th>
                      <th className="p-3.5">Email</th>
                      <th className="p-3.5">Joined Date</th>
                      <th className="p-3.5">Plan</th>
                      <th className="p-3.5">Trips Generated</th>
                      <th className="p-3.5">Status</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-850 font-medium text-slate-300">
                    {usersData.users.map((u: any) => (
                      <tr key={u.id} className="hover:bg-slate-850/50 transition-colors">
                        <td className="p-3.5 font-mono text-[11px] text-slate-500">{u.id}</td>
                        <td className="p-3.5 font-bold text-white">{u.email}</td>
                        <td className="p-3.5 text-slate-400">{new Date(u.created_at).toLocaleDateString()}</td>
                        <td className="p-3.5">
                          <span className={`inline-flex items-center gap-1 px-2.5 py-0.5 rounded-md text-[10px] font-black uppercase tracking-wider ${
                            u.plan === "lifetime" ? "bg-amber-500/20 text-amber-300 border border-amber-500/30" :
                            u.plan === "yearly" ? "bg-emerald-500/20 text-emerald-300 border border-emerald-500/30" :
                            u.plan === "pay_per_trip" ? "bg-blue-500/20 text-blue-300 border border-blue-500/30" :
                            "bg-slate-800 text-slate-400"
                          }`}>
                            {u.plan || "free"}
                          </span>
                        </td>
                        <td className="p-3.5 font-bold">{u.trips_count || 0}</td>
                        <td className="p-3.5">
                          <span className="inline-flex items-center gap-1 text-emerald-400 font-bold text-[11px]">
                            <span className="w-1.5 h-1.5 rounded-full bg-emerald-400" /> Active
                          </span>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}

            {/* Pagination */}
            {usersData.totalPages > 1 && (
              <div className="flex items-center justify-between p-3 bg-slate-900 border border-slate-800 rounded-xl text-xs">
                <span className="text-slate-400">Page {usersData.page} of {usersData.totalPages}</span>
                <div className="flex items-center gap-2">
                  <button
                    disabled={userPage <= 1}
                    onClick={() => setUserPage(p => Math.max(1, p - 1))}
                    className="p-1.5 bg-slate-800 hover:bg-slate-700 disabled:opacity-40 text-slate-300 rounded-lg cursor-pointer"
                  >
                    <ChevronLeft className="w-4 h-4" />
                  </button>
                  <button
                    disabled={userPage >= usersData.totalPages}
                    onClick={() => setUserPage(p => p + 1)}
                    className="p-1.5 bg-slate-800 hover:bg-slate-700 disabled:opacity-40 text-slate-300 rounded-lg cursor-pointer"
                  >
                    <ChevronRight className="w-4 h-4" />
                  </button>
                </div>
              </div>
            )}
          </div>
        )}

        {/* TAB 3: PAYMENTS */}
        {activeTab === "payments" && !tabLoading && paymentsData && (
          <div className="space-y-4 animate-in fade-in duration-200">
            {paymentsData.payments.length === 0 ? (
              <EmptyState title="No payments recorded" description="No customer payment transactions recorded yet." />
            ) : (
              <div className="bg-slate-900 border border-slate-800 rounded-2xl overflow-x-auto">
                <table className="w-full text-left text-xs">
                  <thead className="bg-slate-950 text-slate-400 font-extrabold uppercase tracking-wider text-[10px] border-b border-slate-800">
                    <tr>
                      <th className="p-3.5">Razorpay Payment ID</th>
                      <th className="p-3.5">Order ID</th>
                      <th className="p-3.5">User Email</th>
                      <th className="p-3.5">Plan Purchased</th>
                      <th className="p-3.5">Amount</th>
                      <th className="p-3.5">Status</th>
                      <th className="p-3.5">Date</th>
                      <th className="p-3.5">Environment</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-850 font-medium text-slate-300">
                    {paymentsData.payments.map((p: any) => (
                      <tr key={p.id} className="hover:bg-slate-850/50 transition-colors">
                        <td className="p-3.5 font-mono text-[11px] text-teal-300 font-bold">{p.razorpay_payment_id}</td>
                        <td className="p-3.5 font-mono text-[11px] text-slate-500">{p.razorpay_order_id}</td>
                        <td className="p-3.5 font-semibold text-white">{p.user_email}</td>
                        <td className="p-3.5 font-bold uppercase text-[10px]">{p.plan_purchased}</td>
                        <td className="p-3.5 font-black text-emerald-400">₹{p.amount}</td>
                        <td className="p-3.5">
                          <span className="px-2 py-0.5 rounded bg-emerald-500/20 text-emerald-300 text-[10px] font-bold uppercase">
                            {p.payment_status || "captured"}
                          </span>
                        </td>
                        <td className="p-3.5 text-slate-400">{new Date(p.created_at).toLocaleDateString()}</td>
                        <td className="p-3.5">
                          <span className={`px-2 py-0.5 rounded text-[10px] font-bold ${p.is_test_mode ? "bg-amber-500/20 text-amber-300" : "bg-teal-500/20 text-teal-300"}`}>
                            {p.is_test_mode ? "Test Mode" : "Live Mode"}
                          </span>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </div>
        )}

        {/* TAB 4: SUBSCRIPTIONS */}
        {activeTab === "subscriptions" && !tabLoading && subsData && (
          <div className="space-y-4 animate-in fade-in duration-200">
            {subsData.subscriptions.length === 0 ? (
              <EmptyState title="No active subscriptions" description="No premium subscriptions present in the database." />
            ) : (
              <div className="bg-slate-900 border border-slate-800 rounded-2xl overflow-x-auto">
                <table className="w-full text-left text-xs">
                  <thead className="bg-slate-950 text-slate-400 font-extrabold uppercase tracking-wider text-[10px] border-b border-slate-800">
                    <tr>
                      <th className="p-3.5">User Email</th>
                      <th className="p-3.5">Current Plan</th>
                      <th className="p-3.5">Purchase Date</th>
                      <th className="p-3.5">Expiry Date</th>
                      <th className="p-3.5">Trip Credits</th>
                      <th className="p-3.5">Status</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-850 font-medium text-slate-300">
                    {subsData.subscriptions.map((s: any) => (
                      <tr key={s.id} className="hover:bg-slate-850/50 transition-colors">
                        <td className="p-3.5 font-bold text-white">{s.user_email}</td>
                        <td className="p-3.5">
                          <span className="px-2 py-0.5 rounded bg-emerald-500/20 text-emerald-300 text-[10px] font-bold uppercase">
                            {s.current_plan}
                          </span>
                        </td>
                        <td className="p-3.5 text-slate-400">{new Date(s.purchase_date).toLocaleDateString()}</td>
                        <td className="p-3.5 text-slate-400">{s.expiry_date ? new Date(s.expiry_date).toLocaleDateString() : "Lifetime"}</td>
                        <td className="p-3.5 font-bold">{s.remaining_trip_credits ?? "Unlimited"}</td>
                        <td className="p-3.5">
                          <span className="px-2 py-0.5 rounded bg-teal-500/20 text-teal-300 text-[10px] font-bold uppercase">
                            {s.status || "active"}
                          </span>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </div>
        )}

        {/* TAB 5: SUPPORT TICKETS */}
        {activeTab === "tickets" && !tabLoading && ticketsData && (
          <div className="space-y-4 animate-in fade-in duration-200">
            {ticketsData.tickets.length === 0 ? (
              <EmptyState title="No support tickets" description="No customer support tickets have been submitted." />
            ) : (
              <div className="bg-slate-900 border border-slate-800 rounded-2xl overflow-x-auto">
                <table className="w-full text-left text-xs">
                  <thead className="bg-slate-950 text-slate-400 font-extrabold uppercase tracking-wider text-[10px] border-b border-slate-800">
                    <tr>
                      <th className="p-3.5">Reference</th>
                      <th className="p-3.5">User Email</th>
                      <th className="p-3.5">Subject</th>
                      <th className="p-3.5">Message</th>
                      <th className="p-3.5">Razorpay ID</th>
                      <th className="p-3.5">Status</th>
                      <th className="p-3.5">Submitted Date</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-850 font-medium text-slate-300">
                    {ticketsData.tickets.map((t: any) => (
                      <tr key={t.id} className="hover:bg-slate-850/50 transition-colors">
                        <td className="p-3.5 font-mono font-bold text-teal-400">{t.ticket_ref}</td>
                        <td className="p-3.5 font-semibold text-white">{t.user_email}</td>
                        <td className="p-3.5 font-bold">{t.subject}</td>
                        <td className="p-3.5 text-slate-400 max-w-xs truncate">{t.message}</td>
                        <td className="p-3.5 font-mono text-slate-500">{t.razorpay_payment_id || "N/A"}</td>
                        <td className="p-3.5">
                          <span className={`px-2 py-0.5 rounded text-[10px] font-bold uppercase ${
                            t.status === "open" ? "bg-rose-500/20 text-rose-300" :
                            t.status === "in_progress" ? "bg-amber-500/20 text-amber-300" :
                            "bg-emerald-500/20 text-emerald-300"
                          }`}>
                            {t.status}
                          </span>
                        </td>
                        <td className="p-3.5 text-slate-400">{new Date(t.created_at).toLocaleDateString()}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </div>
        )}

        {/* TRAVELER REVIEWS */}
        {activeTab === "reviews" && !tabLoading && reviewsData && (
          <div className="space-y-4 animate-in fade-in duration-200">
            <div className="grid grid-cols-2 lg:grid-cols-5 gap-3">
              {[
                ["Total", reviewsData.total, "text-white"],
                ["Pending", reviewsData.pending, "text-amber-300"],
                ["Approved", reviewsData.approved, "text-emerald-300"],
                ["Rejected", reviewsData.rejected, "text-rose-300"],
                ["Average", `${reviewsData.averageRating || 0}/5`, "text-teal-300"]
              ].map(([label, value, color]) => (
                <div key={String(label)} className="p-4 bg-slate-900 border border-slate-800 rounded-2xl">
                  <p className="text-[10px] uppercase tracking-wider font-extrabold text-slate-500">{label}</p>
                  <p className={`text-xl font-black mt-1 ${color}`}>{value}</p>
                </div>
              ))}
            </div>

            {reviewsData.reviews.length === 0 ? (
              <EmptyState title="No traveler reviews" description="Submitted trip experiences will appear here." />
            ) : (
              <div className="grid grid-cols-1 xl:grid-cols-2 gap-4">
                {reviewsData.reviews.map((review: any) => (
                  <article key={review.id} className="p-5 bg-slate-900 border border-slate-800 rounded-2xl space-y-4">
                    <div className="flex items-start justify-between gap-4">
                      <div>
                        <h3 className="font-extrabold text-white">{review.destination}</h3>
                        <p className="text-[11px] text-slate-400 mt-0.5">{review.user_email} · {new Date(review.created_at).toLocaleString()}</p>
                      </div>
                      <span className={`px-2.5 py-1 rounded-lg text-[10px] uppercase font-extrabold ${
                        review.status === "approved" ? "bg-emerald-500/15 text-emerald-300" :
                        review.status === "rejected" ? "bg-rose-500/15 text-rose-300" :
                        "bg-amber-500/15 text-amber-300"
                      }`}>{review.status}</span>
                    </div>
                    <div className="flex items-center gap-1">
                      {[1, 2, 3, 4, 5].map((star) => <Star key={star} className={`w-4 h-4 ${star <= review.rating ? "fill-amber-400 text-amber-400" : "text-slate-700"}`} />)}
                      <span className="ml-1 text-xs font-bold text-amber-300">{review.rating}/5</span>
                    </div>
                    <p className="text-sm leading-relaxed text-slate-300 whitespace-pre-wrap bg-slate-950/60 border border-slate-800 rounded-xl p-3">{review.review_text}</p>
                    <div className="flex flex-wrap justify-end gap-2 pt-1">
                      <button disabled={reviewActionLoading === review.id} onClick={() => handleReviewAction(review, "approve")} className="px-3 py-1.5 rounded-lg text-[10px] font-extrabold bg-emerald-500/15 text-emerald-300 border border-emerald-500/30 hover:bg-emerald-500/25 disabled:opacity-50">Approve & Publish</button>
                      <button disabled={reviewActionLoading === review.id} onClick={() => handleReviewAction(review, "reject")} className="px-3 py-1.5 rounded-lg text-[10px] font-extrabold bg-rose-500/15 text-rose-300 border border-rose-500/30 hover:bg-rose-500/25 disabled:opacity-50">Reject</button>
                      <button disabled={reviewActionLoading === review.id} onClick={() => handleReviewAction(review, "delete")} className="p-1.5 rounded-lg text-slate-400 border border-slate-700 hover:text-rose-300 hover:border-rose-500/40 disabled:opacity-50" title="Delete review"><Trash2 className="w-4 h-4" /></button>
                    </div>
                  </article>
                ))}
              </div>
            )}
          </div>
        )}

        {/* TAB 6: REFUND REQUESTS */}
        {activeTab === "refunds" && !tabLoading && refundsData && (
          <div className="space-y-4 animate-in fade-in duration-200">
            {refundsData.requests.length === 0 ? (
              <EmptyState title="No refund requests" description="No customer refund requests pending review." />
            ) : (
              <div className="bg-slate-900 border border-slate-800 rounded-2xl overflow-x-auto">
                <table className="w-full text-left text-xs">
                  <thead className="bg-slate-950 text-slate-400 font-extrabold uppercase tracking-wider text-[10px] border-b border-slate-800">
                    <tr>
                      <th className="p-3.5">User Email</th>
                      <th className="p-3.5">Payment ID</th>
                      <th className="p-3.5">Plan</th>
                      <th className="p-3.5">Purchase Date</th>
                      <th className="p-3.5">Usage Status</th>
                      <th className="p-3.5">7-Day Refund Eligibility</th>
                      <th className="p-3.5">Status</th>
                      <th className="p-3.5 text-right">Admin Action</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-850 font-medium text-slate-300">
                    {refundsData.requests.map((r: any) => (
                      <tr key={r.id} className="hover:bg-slate-850/50 transition-colors">
                        <td className="p-3.5 font-bold text-white">{r.user_email}</td>
                        <td className="p-3.5 font-mono text-teal-300 font-bold">{r.razorpay_payment_id}</td>
                        <td className="p-3.5 font-bold uppercase text-[10px]">{r.plan}</td>
                        <td className="p-3.5 text-slate-400">{new Date(r.purchase_date).toLocaleDateString()}</td>
                        <td className="p-3.5 font-semibold text-slate-300">
                          {r.trips_used_since_purchase || 0} trips generated
                        </td>
                        <td className="p-3.5">
                          {r.refund_eligible ? (
                            <span className="inline-flex items-center gap-1 text-emerald-400 font-extrabold text-[11px]">
                              <CheckCircle2 className="w-3.5 h-3.5" /> Eligible (Unused &lt; 7 Days)
                            </span>
                          ) : (
                            <span className="inline-flex items-center gap-1 text-rose-400 font-extrabold text-[11px]">
                              <XCircle className="w-3.5 h-3.5" /> Ineligible (Expired / Service Used)
                            </span>
                          )}
                        </td>
                        <td className="p-3.5">
                          <span className={`px-2 py-0.5 rounded text-[10px] font-bold uppercase ${
                            r.status === "approved" ? "bg-emerald-500/20 text-emerald-300" :
                            r.status === "rejected" ? "bg-rose-500/20 text-rose-300" :
                            "bg-amber-500/20 text-amber-300"
                          }`}>
                            {r.status || "pending"}
                          </span>
                        </td>
                        <td className="p-3.5 text-right">
                          {r.status === "pending" || !r.status ? (
                            <div className="flex items-center justify-end gap-2">
                              <button
                                disabled={refActionLoading === r.id}
                                onClick={() => handleRefundDecision(r, "approve")}
                                className="px-2.5 py-1 bg-emerald-500/20 hover:bg-emerald-500/30 text-emerald-300 border border-emerald-500/30 font-bold text-[10px] rounded-lg cursor-pointer transition-all disabled:opacity-50"
                              >
                                Approve & Email
                              </button>
                              <button
                                disabled={refActionLoading === r.id}
                                onClick={() => handleRefundDecision(r, "reject")}
                                className="px-2.5 py-1 bg-rose-500/20 hover:bg-rose-500/30 text-rose-300 border border-rose-500/30 font-bold text-[10px] rounded-lg cursor-pointer transition-all disabled:opacity-50"
                              >
                                Reject & Email
                              </button>
                            </div>
                          ) : (
                            <span className="text-[10px] text-slate-500 font-bold uppercase">Decision Recorded</span>
                          )}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </div>
        )}

        {/* TAB 8: BREVO EMAIL OPERATIONS */}
        {activeTab === "emails" && (
          <div className="space-y-6 animate-in fade-in duration-200">
            {/* Header / Info card */}
            <div className="p-6 bg-slate-900 border border-slate-800 rounded-3xl space-y-4">
              <div className="flex items-center justify-between">
                <div>
                  <h3 className="text-base font-extrabold text-white flex items-center gap-2">
                    <Mail className="w-5 h-5 text-teal-400" />
                    <span>Brevo SMTP Transactional Email Manager</span>
                  </h3>
                  <p className="text-xs text-slate-400 mt-1">
                    Send, test, and audit responsive HTML transactional emails. Configured with From: <strong className="text-teal-300">noreply@tripbalancing.in</strong> & Reply-To: <strong className="text-teal-300">support@tripbalancing.in</strong>.
                  </p>
                </div>
                <span className="px-3 py-1 rounded-full bg-teal-500/20 text-teal-300 border border-teal-500/30 font-extrabold text-[10px] uppercase">
                  Express Backend Active
                </span>
              </div>

              {/* Grid of 7 Templates Status */}
              <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-3">
                {[
                  { name: "1. Welcome Email", desc: "Triggered after email verification", badge: "Active" },
                  { name: "2. Payment Success", desc: "Receipt with Razorpay Payment ID", badge: "Active" },
                  { name: "3. Payment Failed", desc: "Failure details & retry button", badge: "Active" },
                  { name: "4. Refund Received", desc: "Confirms 7-day review logging", badge: "Active" },
                  { name: "5. Refund Approved", desc: "Refund ID & 5-7 day timeline", badge: "Active" },
                  { name: "6. Refund Rejected", desc: "Policy explanation & support link", badge: "Active" },
                  { name: "7. Support Ticket", desc: "Ref #TB-XXXXXX & confirmation", badge: "Active" }
                ].map((t, idx) => (
                  <div key={idx} className="p-3.5 bg-slate-950 border border-slate-850 rounded-2xl space-y-1">
                    <div className="flex items-center justify-between">
                      <span className="text-xs font-black text-slate-200">{t.name}</span>
                      <span className="px-1.5 py-0.5 bg-emerald-500/20 text-emerald-300 text-[9px] font-extrabold uppercase rounded">
                        {t.badge}
                      </span>
                    </div>
                    <p className="text-[10px] text-slate-400 leading-tight">{t.desc}</p>
                  </div>
                ))}
              </div>
            </div>

            {/* Live Interactive Email Dispatcher */}
            <div className="p-6 bg-slate-900 border border-slate-800 rounded-3xl space-y-4">
              <h3 className="text-sm font-extrabold text-white flex items-center gap-2">
                <Sparkles className="w-4 h-4 text-teal-400" />
                <span>Test Transactional Email Dispatcher</span>
              </h3>

              <form onSubmit={handleSendTestEmail} className="space-y-4">
                <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                  <div>
                    <label className="block text-xs font-bold text-slate-300 mb-1">Select Email Template</label>
                    <select
                      value={testTemplateType}
                      onChange={(e) => setTestTemplateType(e.target.value)}
                      className="w-full px-3.5 py-2.5 bg-slate-950 border border-slate-800 rounded-xl text-xs font-bold text-white focus:outline-none focus:border-teal-500"
                    >
                      <option value="welcome">1. Welcome Email (Email Verified)</option>
                      <option value="payment_success">2. Payment Success (Razorpay Receipt)</option>
                      <option value="payment_failed">3. Payment Failed (Retry Guidance)</option>
                      <option value="refund_received">4. Refund Request Received</option>
                      <option value="refund_approved">5. Refund Approved (Credit Timeline)</option>
                      <option value="refund_rejected">6. Refund Rejected (Explanation)</option>
                      <option value="support_ticket">7. Support Ticket Created (#TB-Ref)</option>
                    </select>
                  </div>

                  <div>
                    <label className="block text-xs font-bold text-slate-300 mb-1">Recipient Email Address</label>
                    <input
                      type="email"
                      required
                      value={testEmailRecipient}
                      onChange={(e) => setTestEmailRecipient(e.target.value)}
                      placeholder="e.g. user@domain.com"
                      className="w-full px-3.5 py-2.5 bg-slate-950 border border-slate-800 rounded-xl text-xs font-medium text-white placeholder-slate-500 focus:outline-none focus:border-teal-500"
                    />
                  </div>
                </div>

                <div className="flex items-center justify-between pt-2">
                  <div className="text-[11px] text-slate-400">
                    Uses Brevo SMTP relay <code className="text-teal-400">smtp-relay.brevo.com:587</code> via Express backend.
                  </div>

                  <button
                    type="submit"
                    disabled={testEmailSending}
                    className="px-5 py-2.5 bg-teal-500 hover:bg-teal-400 text-slate-950 font-black text-xs rounded-xl transition-all shadow-md flex items-center gap-2 cursor-pointer disabled:opacity-50"
                  >
                    {testEmailSending ? (
                      <>
                        <div className="w-3.5 h-3.5 border-2 border-slate-950 border-t-transparent rounded-full animate-spin" />
                        <span>Dispatching...</span>
                      </>
                    ) : (
                      <>
                        <Mail className="w-4 h-4" />
                        <span>Send Test Email Now</span>
                      </>
                    )}
                  </button>
                </div>

                {testEmailStatus && (
                  <div className={`p-4 rounded-xl border text-xs font-mono ${
                    testEmailStatus.includes("SUCCESS")
                      ? "bg-teal-950/60 border-teal-800 text-teal-300"
                      : "bg-rose-950/60 border-rose-800 text-rose-300"
                  }`}>
                    {testEmailStatus}
                  </div>
                )}
              </form>
            </div>
          </div>
        )}

        {/* TAB 7: SECURITY AUDIT */}
        {activeTab === "security" && !tabLoading && securityData && (
          <div className="space-y-6 animate-in fade-in duration-200">
            {/* Database Tables RLS Status */}
            <div className="p-6 bg-slate-900 border border-slate-800 rounded-3xl space-y-4">
              <div className="flex items-center justify-between">
                <h3 className="text-sm font-extrabold text-white flex items-center gap-2">
                  <Database className="w-4 h-4 text-teal-400" />
                  <span>Row Level Security (RLS) Database Tables Status</span>
                </h3>
                <span className="text-[10px] font-bold bg-teal-500/20 text-teal-300 border border-teal-500/30 px-2.5 py-0.5 rounded-full uppercase">
                  Protected
                </span>
              </div>

              <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3">
                {securityData.tables.map((t: any) => (
                  <div key={t.tableName} className="p-3.5 bg-slate-950 border border-slate-800/80 rounded-2xl flex items-center justify-between">
                    <span className="font-mono text-xs text-slate-300">{t.tableName}</span>
                    {t.rlsEnabled ? (
                      <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded bg-emerald-500/20 text-emerald-300 font-extrabold text-[10px] uppercase">
                        <ShieldCheck className="w-3 h-3" /> RLS Enabled
                      </span>
                    ) : (
                      <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded bg-rose-500/20 text-rose-300 font-extrabold text-[10px] uppercase">
                        <ShieldAlert className="w-3 h-3" /> RLS Disabled
                      </span>
                    )}
                  </div>
                ))}
              </div>
            </div>

            {/* Failed Admin Access Log */}
            <div className="p-6 bg-slate-900 border border-slate-800 rounded-3xl space-y-4">
              <h3 className="text-sm font-extrabold text-white flex items-center gap-2">
                <ShieldAlert className="w-4 h-4 text-rose-400" />
                <span>Recent Failed Admin Access Security Logs</span>
              </h3>

              {securityData.failedAccessLogs.length === 0 ? (
                <div className="p-6 text-center text-xs text-slate-500 bg-slate-950 rounded-2xl border border-slate-800/60">
                  Zero unauthorized admin access attempts recorded.
                </div>
              ) : (
                <div className="overflow-x-auto bg-slate-950 border border-slate-800 rounded-2xl">
                  <table className="w-full text-left text-xs">
                    <thead className="bg-slate-900 text-slate-400 font-extrabold uppercase text-[10px] border-b border-slate-800">
                      <tr>
                        <th className="p-3">User ID</th>
                        <th className="p-3">Email</th>
                        <th className="p-3">IP Address</th>
                        <th className="p-3">Timestamp</th>
                        <th className="p-3">Result</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-slate-850 font-mono text-[11px] text-slate-300">
                      {securityData.failedAccessLogs.map((log: any, idx: number) => (
                        <tr key={idx} className="hover:bg-slate-900/50">
                          <td className="p-3 text-slate-500">{log.attempted_user_id || "Anonymous"}</td>
                          <td className="p-3 text-rose-300 font-sans">{log.attempted_email || "unknown"}</td>
                          <td className="p-3 text-slate-400">{log.ip_address || "127.0.0.1"}</td>
                          <td className="p-3 text-slate-400">{new Date(log.attempted_at).toLocaleString()}</td>
                          <td className="p-3">
                            <span className="px-2 py-0.5 rounded bg-rose-500/20 text-rose-300 text-[10px] font-bold font-sans uppercase">
                              403 Forbidden
                            </span>
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              )}
            </div>
          </div>
        )}

      </main>
    </div>
  );
}

// Subcomponents
function MetricCard({ title, value, subtitle, icon: Icon, color }: any) {
  const colorMap: any = {
    teal: "text-teal-400 bg-teal-500/10 border-teal-500/20",
    emerald: "text-emerald-400 bg-emerald-500/10 border-emerald-500/20",
    amber: "text-amber-400 bg-amber-500/10 border-amber-500/20",
    blue: "text-blue-400 bg-blue-500/10 border-blue-500/20",
    rose: "text-rose-400 bg-rose-500/10 border-rose-500/20",
    purple: "text-purple-400 bg-purple-500/10 border-purple-500/20"
  };

  return (
    <div className="p-5 bg-slate-900 border border-slate-800 rounded-3xl space-y-3 shadow-sm hover:border-slate-700 transition-all">
      <div className="flex items-center justify-between">
        <span className="text-xs font-extrabold text-slate-400 uppercase tracking-wider text-[10px]">{title}</span>
        <div className={`w-9 h-9 rounded-xl border flex items-center justify-center ${colorMap[color] || colorMap.teal}`}>
          <Icon className="w-4 h-4" />
        </div>
      </div>
      <div>
        <div className="text-2xl font-black text-white tracking-tight">{value}</div>
        <p className="text-[11px] font-medium text-slate-400 mt-1">{subtitle}</p>
      </div>
    </div>
  );
}

function EmptyState({ title, description }: { title: string; description: string }) {
  return (
    <div className="p-12 text-center bg-slate-900 border border-slate-800 rounded-3xl space-y-2">
      <div className="w-12 h-12 rounded-2xl bg-slate-800 border border-slate-700 flex items-center justify-center text-slate-400 mx-auto">
        <FileText className="w-6 h-6" />
      </div>
      <h4 className="text-sm font-bold text-white">{title}</h4>
      <p className="text-xs text-slate-400 max-w-sm mx-auto">{description}</p>
    </div>
  );
}
