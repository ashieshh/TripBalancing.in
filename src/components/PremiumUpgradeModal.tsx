import { useState, useEffect } from "react";
import { 
  Crown, Sparkles, Zap, ShieldCheck, 
  ArrowRight, Landmark, Heart,
  Lock, Loader2, AlertCircle, Globe
} from "lucide-react";

interface PremiumUpgradeModalProps {
  isOpen: boolean;
  onClose: () => void;
  onUpgradeSuccess: (chosenPlan: "pay_per_trip" | "yearly" | "lifetime", tripsAddedCount?: number) => void;
  userEmail: string;
  currentPlan?: "free" | "pay_per_trip" | "yearly" | "lifetime";
  remainingFreeTrips?: number;
  paidTripsBalance?: number;
  onOpenLegalPage?: (tab: "privacy" | "terms" | "refund" | "contact") => void;
}

export default function PremiumUpgradeModal({ 
  isOpen, 
  onClose, 
  onUpgradeSuccess, 
  userEmail,
  currentPlan = "free",
  remainingFreeTrips = 2,
  onOpenLegalPage
}: PremiumUpgradeModalProps) {
  const [step, setStep] = useState<"pricing" | "success">("pricing");
  const [selectedPlan, setSelectedPlan] = useState<"pay_per_trip" | "yearly" | "lifetime">("yearly");
  const [currency, setCurrency] = useState<"USD" | "INR">("USD");
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [paymentError, setPaymentError] = useState<string>("");

  // Razorpay Gateway config state
  const [razorpayConfig, setRazorpayConfig] = useState<{ keyId: string; isConfigured: boolean } | null>(null);

  // Load Razorpay config on modal open
  useEffect(() => {
    if (!isOpen) return;

    setPaymentError("");
    setStep("pricing");

    fetch("/api/razorpay/config")
      .then((res) => res.json())
      .then((data) => {
        setRazorpayConfig(data);
      })
      .catch((err) => {
        console.error("Failed to fetch Razorpay config:", err);
        setRazorpayConfig({ keyId: "", isConfigured: false });
      });

    // Inject Razorpay standard checkout script dynamically if not present
    if (!(window as any).Razorpay) {
      const script = document.createElement("script");
      script.src = "https://checkout.razorpay.com/v1/checkout.js";
      script.async = true;
      document.body.appendChild(script);
    }
  }, [isOpen]);

  if (!isOpen) return null;

  const getPlanDetails = (plan: "pay_per_trip" | "yearly" | "lifetime", curr: "USD" | "INR") => {
    const isUsd = curr === "USD";
    if (plan === "pay_per_trip") {
      return {
        name: isUsd ? "2 Trips Pass ($2)" : "Pay Per Trip (₹99)",
        description: isUsd ? "2 AI Trip Plans Pass" : "1 AI Trip Plan Pass",
        priceLabel: isUsd ? "$2" : "₹99"
      };
    }
    if (plan === "yearly") {
      return {
        name: isUsd ? "Yearly Premium ($7)" : "Yearly Premium (₹499)",
        description: "Yearly Unlimited AI Trip Planning Subscription",
        priceLabel: isUsd ? "$7/yr" : "₹499/yr"
      };
    }
    return {
      name: isUsd ? "Lifetime Premium ($19)" : "Lifetime Premium (₹1,499)",
      description: "Lifetime Unlimited AI Trip Planning Pass",
      priceLabel: isUsd ? "$19" : "₹1,499"
    };
  };

  const handleProceedWithRazorpay = async () => {
    if (isSubmitting) return; // Prevent double-clicks and duplicate orders
    setIsSubmitting(true);
    setPaymentError("");

    try {
      // Ensure Razorpay SDK script is loaded
      if (!(window as any).Razorpay) {
        await new Promise<void>((resolve, reject) => {
          if ((window as any).Razorpay) return resolve();
          const script = document.createElement("script");
          script.src = "https://checkout.razorpay.com/v1/checkout.js";
          script.async = true;
          script.onload = () => resolve();
          script.onerror = () => reject(new Error("Unable to load Razorpay SDK"));
          document.body.appendChild(script);
        });
      }

      // 1. First call /api/create-order (or /api/razorpay/create-order)
      const res = await fetch("/api/create-order", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ planType: selectedPlan, currency })
      });

      if (!res.ok) {
        const errJson = await res.json().catch(() => ({}));
        throw new Error(errJson.error || "Unable to start payment order. Please try again.");
      }

      const orderData = await res.json();
      const orderId = orderData.order_id || orderData.id;

      if (!orderData || !orderId) {
        throw new Error("Unable to create payment order. Please try again.");
      }

      const planInfo = getPlanDetails(selectedPlan, currency);
      const keyId = razorpayConfig?.keyId || ((import.meta as any).env?.VITE_RAZORPAY_KEY_ID as string) || "rzp_test_TJGWI6QqKRLd1i";

      // 2. Configure official Razorpay Checkout popup
      const options = {
        key: keyId,
        amount: orderData.amount,
        currency: orderData.currency,
        name: "TripBalancing",
        description: `${planInfo.name} - ${planInfo.description}`,
        order_id: orderId,
        image: "https://cdn-icons-png.flaticon.com/512/3125/3125848.png",
        prefill: {
          email: userEmail,
          contact: ""
        },
        theme: {
          color: "#0d9488"
        },
        handler: async (response: any) => {
          try {
            // 3. Call /api/verify-payment after payment
            const verifyRes = await fetch("/api/verify-payment", {
              method: "POST",
              headers: { "Content-Type": "application/json" },
              body: JSON.stringify({
                razorpay_order_id: response.razorpay_order_id,
                razorpay_payment_id: response.razorpay_payment_id,
                razorpay_signature: response.razorpay_signature,
                planType: selectedPlan
              })
            });

            const verifyData = await verifyRes.json().catch(() => ({}));

            if (!verifyRes.ok || !verifyData.verified) {
              throw new Error(verifyData.error || "Payment signature verification failed.");
            }

            // 4. Activate plan ONLY after successful server-side signature verification
            setIsSubmitting(false);
            setStep("success");
            const tripsToAdd = (selectedPlan === "pay_per_trip" && currency === "USD") ? 2 : 1;
            onUpgradeSuccess(selectedPlan, tripsToAdd);
          } catch (err: any) {
            console.error("Verification error:", err?.message || "Payment verification error");
            setPaymentError(err.message || "Payment verification failed. Please contact support.");
            setIsSubmitting(false);
          }
        },
        modal: {
          ondismiss: () => {
            // User closed payment window without paying - remain on plan selection
            setIsSubmitting(false);
          }
        }
      };

      const rzp = new (window as any).Razorpay(options);
      rzp.on("payment.failed", (response: any) => {
        console.error("Razorpay Payment failed:", response.error?.description || "Payment failed");
        const errMsg = response.error?.description || "Payment failed or was cancelled.";
        if (errMsg.toLowerCase().includes("merchant") || currency === "USD") {
          setPaymentError("Razorpay Merchant Notice: USD ($) payments require enabling 'International Payments' in your Razorpay Dashboard (Settings -> Payment Methods). Switch to INR (₹) below for instant payment via UPI, Credit/Debit Cards, or Netbanking.");
        } else {
          setPaymentError(errMsg);
        }
        setIsSubmitting(false);
      });

      // 5. Immediately launch Razorpay Checkout popup
      rzp.open();
    } catch (err: any) {
      console.error("Razorpay Order Creation Error:", err?.message || "Order creation error");
      setPaymentError(err.message || "Unable to start payment. Please try again.");
      setIsSubmitting(false);
    }
  };

  const premiumFeatures = [
    {
      title: "Infinite Trip Planning Guides",
      desc: "Unlock absolute unlimited trip generation for any destination worldwide.",
      icon: <Zap className="w-5 h-5 text-amber-500" />
    },
    {
      title: "Premium AI Exploration Engine",
      desc: "Access highly tailored off-the-beaten-path hidden spots, secret eateries, and local insights.",
      icon: <Sparkles className="w-5 h-5 text-teal-500" />
    },
    {
      title: "All-Device Backup & DB Syncing",
      desc: "Synchronize your travel plans securely in the cloud to access on mobile, tablet, and desktop.",
      icon: <ShieldCheck className="w-5 h-5 text-sky-500" />
    },
    {
      title: "Priority Generation speed",
      desc: "Instant bypass on server load queues, serving your itineraries up to 3x faster.",
      icon: <Crown className="w-5 h-5 text-purple-500" />
    }
  ];

  return (
    <div 
      className="fixed inset-0 z-50 bg-black/75 backdrop-blur-md flex items-center justify-center p-4 overflow-y-auto"
      onClick={onClose}
    >
      <div 
        className="bg-white dark:bg-slate-950 border border-slate-100 dark:border-slate-900 rounded-3xl max-w-5xl w-full shadow-2xl overflow-hidden animate-in fade-in zoom-in-95 duration-200"
        onClick={(e) => e.stopPropagation()}
      >
        {/* Banner header */}
        <div className="relative overflow-hidden bg-gradient-to-r from-slate-900 via-teal-950 to-slate-950 text-white p-6 md:p-8 border-b border-slate-100 dark:border-slate-900/60 flex items-center justify-between">
          <div className="space-y-1.5 z-10">
            <span className="inline-flex items-center gap-1.5 px-3 py-0.5 rounded-full bg-amber-400/20 text-amber-400 font-extrabold uppercase tracking-wider text-[10px]">
              <Crown className="w-3.5 h-3.5 fill-amber-400" />
              TripBalancing Premium
            </span>
            <h3 className="text-xl md:text-2xl font-black tracking-tight">Upgrade Your Journeys</h3>
            <p className="text-xs text-slate-400">Unlock infinite travel guides and priority premium support.</p>
          </div>
          
          <button
            onClick={onClose}
            className="absolute top-6 right-6 text-slate-400 hover:text-white p-1.5 rounded-xl hover:bg-white/10 transition-all cursor-pointer font-bold text-sm"
          >
            ✕
          </button>

          {/* Decorative shapes */}
          <div className="absolute right-0 bottom-0 w-48 h-48 bg-teal-500/10 rounded-full blur-3xl pointer-events-none" />
          <div className="absolute left-1/3 top-0 w-32 h-32 bg-purple-500/10 rounded-full blur-2xl pointer-events-none" />
        </div>

        <div className="p-6 md:p-8">
          {step === "pricing" && (
            <div className="space-y-6">
              {/* Feature grid */}
              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                {premiumFeatures.map((feat, idx) => (
                  <div 
                    key={idx}
                    className="flex gap-3 p-4 bg-slate-50 dark:bg-slate-900/40 border border-slate-100/50 dark:border-slate-900/60 rounded-2xl"
                  >
                    <div className="p-2 bg-white dark:bg-slate-900 rounded-xl h-fit shadow-sm border border-slate-100 dark:border-slate-850">
                      {feat.icon}
                    </div>
                    <div className="space-y-1">
                      <h4 className="text-xs font-black text-slate-800 dark:text-slate-100">{feat.title}</h4>
                      <p className="text-[11px] text-slate-500 dark:text-slate-400 leading-relaxed font-semibold">{feat.desc}</p>
                    </div>
                  </div>
                ))}
              </div>

              {/* Region & Currency Selector */}
              <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-3 p-3.5 bg-slate-50 dark:bg-slate-900/50 rounded-2xl border border-slate-200/80 dark:border-slate-800">
                <div className="flex items-center gap-2">
                  <Globe className="w-4 h-4 text-teal-500" />
                  <div>
                    <span className="text-xs font-black text-slate-800 dark:text-slate-100 block">Select Region & Currency</span>
                    <span className="text-[10px] text-slate-500 dark:text-slate-400 font-medium">Choose USD ($) for international members or INR (₹) for India</span>
                  </div>
                </div>

                <div className="flex items-center bg-white dark:bg-slate-950 p-1 rounded-xl border border-slate-200 dark:border-slate-800 shadow-sm w-full sm:w-auto">
                  <button
                    type="button"
                    onClick={() => setCurrency("USD")}
                    className={`flex-1 sm:flex-none px-3.5 py-1.5 rounded-lg text-xs font-bold transition-all flex items-center justify-center gap-1.5 cursor-pointer ${
                      currency === "USD"
                        ? "bg-teal-600 text-white shadow-sm"
                        : "text-slate-600 dark:text-slate-400 hover:text-slate-900 dark:hover:text-white"
                    }`}
                  >
                    <span>🌐</span>
                    <span>USD ($) International</span>
                  </button>
                  <button
                    type="button"
                    onClick={() => setCurrency("INR")}
                    className={`flex-1 sm:flex-none px-3.5 py-1.5 rounded-lg text-xs font-bold transition-all flex items-center justify-center gap-1.5 cursor-pointer ${
                      currency === "INR"
                        ? "bg-teal-600 text-white shadow-sm"
                        : "text-slate-600 dark:text-slate-400 hover:text-slate-900 dark:hover:text-white"
                    }`}
                  >
                    <span>🇮🇳</span>
                    <span>INR (₹) India</span>
                  </button>
                </div>
              </div>

              {/* Pricing Cards Comparison */}
              <div className="space-y-4">
                <span className="text-[10px] font-black uppercase text-slate-400 dark:text-slate-500 tracking-wider block">
                  Select Your Plan Choice ({currency})
                </span>

                <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4 items-stretch">
                  {/* Free Plan */}
                  <div 
                    className={`flex flex-col justify-between h-full p-5 rounded-3xl border transition-all duration-300 relative ${
                      currentPlan === "free"
                        ? "border-slate-200 dark:border-slate-800 bg-slate-50/50 dark:bg-slate-900/10 opacity-75"
                        : "border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-950"
                    }`}
                  >
                    <div className="space-y-4">
                      <div className="flex items-center justify-between">
                        <div className="p-2.5 bg-slate-100 dark:bg-slate-800 rounded-xl text-slate-500">
                          <Landmark className="w-5 h-5" />
                        </div>
                        <span className="text-[9px] font-bold bg-slate-100 dark:bg-slate-800 text-slate-600 dark:text-slate-400 px-2.5 py-1 rounded-full">
                          {currentPlan === "free" ? "Active" : "Trial"}
                        </span>
                      </div>
                      <div className="space-y-1">
                        <h4 className="text-sm font-black text-slate-800 dark:text-slate-100">Free Tier</h4>
                        <p className="text-[11px] text-slate-500 dark:text-slate-400 leading-relaxed font-semibold">
                          Get started with 2 free AI-generated trip guides. Remaining: {remainingFreeTrips}
                        </p>
                      </div>
                    </div>
                    <div className="pt-6 mt-auto space-y-4">
                      <div className="text-left">
                        <span className="text-2xl font-black text-slate-800 dark:text-slate-100">{currency === "USD" ? "$0" : "₹0"}</span>
                        <span className="text-[10px] text-slate-400 font-bold block mt-0.5">free forever</span>
                      </div>
                      <button
                        type="button"
                        disabled
                        className="w-full h-11 flex items-center justify-center text-xs font-bold bg-slate-100 dark:bg-slate-900 text-slate-400 rounded-xl cursor-not-allowed"
                      >
                        Current Plan
                      </button>
                    </div>
                  </div>

                  {/* Pay Per Trip Plan */}
                  <div 
                    onClick={() => setSelectedPlan("pay_per_trip")}
                    className={`flex flex-col justify-between h-full p-5 rounded-3xl border transition-all duration-300 hover:-translate-y-1 hover:shadow-lg cursor-pointer relative ${
                      selectedPlan === "pay_per_trip"
                        ? "border-teal-500 bg-teal-500/5 dark:bg-teal-950/20 ring-2 ring-teal-500/25"
                        : "border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-950 hover:border-slate-300 dark:hover:border-slate-700"
                    }`}
                  >
                    <div className="space-y-4">
                      <div className="flex items-center justify-between">
                        <div className="p-2.5 bg-teal-50 dark:bg-teal-950 rounded-xl text-teal-600 dark:text-teal-400">
                          <Zap className="w-5 h-5" />
                        </div>
                        {selectedPlan === "pay_per_trip" && (
                          <span className="text-[9px] font-bold bg-teal-500/10 text-teal-600 dark:text-teal-400 px-2.5 py-1 rounded-full">
                            Selected
                          </span>
                        )}
                      </div>
                      <div className="space-y-1">
                        <h4 className="text-sm font-black text-slate-800 dark:text-slate-100">
                          {currency === "USD" ? "2 Trips Pass ($2)" : "Pay Per Trip"}
                        </h4>
                        <p className="text-[11px] text-slate-500 dark:text-slate-400 leading-relaxed font-semibold">
                          {currency === "USD" 
                            ? "2 trips fee: $2 ($1 per trip). Pay only $2 to get 2 additional trip plans." 
                            : "No recurring fees. Pay only when you generate an additional trip itinerary."}
                        </p>
                      </div>
                    </div>
                    <div className="pt-6 mt-auto space-y-4">
                      <div className="text-left">
                        <span className="text-2xl font-black text-slate-800 dark:text-slate-100">
                          {currency === "USD" ? "$2" : "₹99"}
                        </span>
                        <span className="text-[10px] text-slate-400 font-bold block mt-0.5">
                          {currency === "USD" ? "for 2 AI trips ($1/trip)" : "per AI trip"}
                        </span>
                      </div>
                      <button
                        type="button"
                        className={`w-full h-11 flex items-center justify-center text-xs font-bold rounded-xl transition-all duration-200 ${
                          selectedPlan === "pay_per_trip"
                            ? "bg-teal-600 text-white shadow-sm"
                            : "bg-slate-100 hover:bg-slate-200 dark:bg-slate-900 dark:hover:bg-slate-850 text-slate-700 dark:text-slate-300"
                        }`}
                      >
                        Select Plan
                      </button>
                    </div>
                  </div>

                  {/* Yearly Premium Plan - MOST POPULAR */}
                  <div 
                    onClick={() => setSelectedPlan("yearly")}
                    className={`flex flex-col justify-between h-full p-5 rounded-3xl border transition-all duration-300 hover:-translate-y-1 hover:shadow-lg cursor-pointer relative overflow-hidden ${
                      selectedPlan === "yearly"
                        ? "border-emerald-500 bg-emerald-500/5 dark:bg-emerald-950/20 ring-2 ring-emerald-500/25"
                        : "border-emerald-500/30 bg-emerald-500/5 dark:bg-emerald-950/5 hover:border-emerald-400"
                    }`}
                  >
                    <div className="absolute top-0 right-0">
                      <span className="text-[8px] font-black uppercase text-white bg-emerald-600 px-2.5 py-1 rounded-bl-xl tracking-wider">
                        Most Popular
                      </span>
                    </div>
                    <div className="space-y-4">
                      <div className="flex items-center justify-between">
                        <div className="p-2.5 bg-emerald-50 dark:bg-emerald-950 rounded-xl text-emerald-600 dark:text-emerald-400">
                          <Crown className="w-5 h-5 fill-emerald-500/10" />
                        </div>
                        <span className="text-[8px] font-bold bg-emerald-550 text-white dark:bg-emerald-500/20 dark:text-emerald-400 px-2 py-0.5 rounded-full">
                          Save 80%+
                        </span>
                      </div>
                      <div className="space-y-1">
                        <h4 className="text-sm font-black text-slate-800 dark:text-slate-100">Yearly Premium</h4>
                        <p className="text-[11px] text-slate-500 dark:text-slate-400 leading-relaxed font-semibold">
                          Get full priority access with unlimited travel itineraries for an entire year.
                        </p>
                      </div>
                    </div>
                    <div className="pt-6 mt-auto space-y-4">
                      <div className="text-left">
                        <span className="text-2xl font-black text-slate-800 dark:text-slate-100">
                          {currency === "USD" ? "$7" : "₹499"}
                        </span>
                        <span className="text-[10px] text-slate-400 font-bold block mt-0.5">per year</span>
                        <span className="inline-block mt-1 px-2 py-0.5 text-[9px] font-extrabold text-emerald-700 bg-emerald-50 dark:bg-emerald-950/50 dark:text-emerald-400 rounded-md">
                          {currency === "USD" ? "Best international rate ($7/yr)" : "Save over 85% compared to Pay Per Trip"}
                        </span>
                      </div>
                      <button
                        type="button"
                        className={`w-full h-11 flex items-center justify-center text-xs font-bold rounded-xl transition-all duration-200 ${
                          selectedPlan === "yearly"
                            ? "bg-emerald-600 text-white shadow-sm"
                            : "bg-slate-100 hover:bg-slate-200 dark:bg-slate-900 dark:hover:bg-slate-850 text-slate-700 dark:text-slate-300"
                        }`}
                      >
                        Select Plan
                      </button>
                    </div>
                  </div>

                  {/* Lifetime Premium Plan - BEST VALUE */}
                  <div 
                    onClick={() => setSelectedPlan("lifetime")}
                    className={`flex flex-col justify-between h-full p-5 rounded-3xl border transition-all duration-300 hover:-translate-y-1 hover:shadow-lg cursor-pointer relative overflow-hidden ${
                      selectedPlan === "lifetime"
                        ? "border-teal-500 bg-teal-500/5 dark:bg-teal-950/20 ring-2 ring-teal-500/25"
                        : "border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-950 hover:border-slate-300 dark:hover:border-slate-700"
                    }`}
                  >
                    <div className="absolute top-0 right-0">
                      <span className="text-[8px] font-black uppercase text-white bg-amber-500 px-2.5 py-1 rounded-bl-xl tracking-wider">
                        Best Value
                      </span>
                    </div>
                    <div className="space-y-4">
                      <div className="flex items-center justify-between">
                        <div className="p-2.5 bg-amber-50 dark:bg-amber-950 rounded-xl text-amber-500">
                          <Sparkles className="w-5 h-5" />
                        </div>
                        {selectedPlan === "lifetime" && (
                          <span className="text-[9px] font-bold bg-amber-500/10 text-amber-600 dark:text-amber-400 px-2.5 py-1 rounded-full">
                            Selected
                          </span>
                        )}
                      </div>
                      <div className="space-y-1">
                        <h4 className="text-sm font-black text-slate-800 dark:text-slate-100">Lifetime Premium</h4>
                        <p className="text-[11px] text-slate-500 dark:text-slate-400 leading-relaxed font-semibold">
                          Enjoy unlimited AI generation forever. One-time payment, zero recurring bills.
                        </p>
                      </div>
                    </div>
                    <div className="pt-6 mt-auto space-y-4">
                      <div className="text-left">
                        <span className="text-2xl font-black text-slate-800 dark:text-slate-100">
                          {currency === "USD" ? "$19" : "₹1,499"}
                        </span>
                        <span className="text-[10px] text-slate-400 font-bold block mt-0.5">one-time payment</span>
                      </div>
                      <button
                        type="button"
                        className={`w-full h-11 flex items-center justify-center text-xs font-bold rounded-xl transition-all duration-200 ${
                          selectedPlan === "lifetime"
                            ? "bg-teal-600 text-white shadow-sm"
                            : "bg-slate-100 hover:bg-slate-200 dark:bg-slate-900 dark:hover:bg-slate-850 text-slate-700 dark:text-slate-300"
                        }`}
                      >
                        Select Plan
                      </button>
                    </div>
                  </div>
                </div>
              </div>

              {/* Error banner */}
              {paymentError && (
                <div className="flex flex-col gap-2 p-4 bg-rose-50 dark:bg-rose-950/50 text-rose-800 dark:text-rose-200 rounded-2xl border border-rose-200 dark:border-rose-900 text-xs font-semibold animate-in fade-in">
                  <div className="flex items-center gap-2 font-bold text-rose-700 dark:text-rose-300">
                    <AlertCircle className="w-4 h-4 text-rose-500 flex-shrink-0" />
                    <span>Razorpay Merchant Notice</span>
                  </div>
                  <p className="leading-relaxed pl-6 text-[11px] text-rose-600 dark:text-rose-300">
                    {paymentError}
                  </p>
                  {currency === "USD" && (
                    <div className="pl-6 pt-1">
                      <button
                        type="button"
                        onClick={() => {
                          setCurrency("INR");
                          setPaymentError("");
                        }}
                        className="px-3.5 py-1.5 bg-rose-600 hover:bg-rose-700 text-white font-bold rounded-xl text-xs transition-all shadow-sm cursor-pointer flex items-center gap-1.5"
                      >
                        <span>🇮🇳 Switch to INR (₹) & Retry Payment</span>
                      </button>
                    </div>
                  )}
                </div>
              )}

              {/* Upgrade Trigger Button */}
              <button
                id="modal-proceed-to-checkout-btn"
                type="button"
                onClick={handleProceedWithRazorpay}
                disabled={isSubmitting}
                className="w-full flex items-center justify-center gap-2 h-14 bg-gradient-to-r from-teal-500 via-emerald-500 to-cyan-500 text-white font-bold rounded-2xl hover:shadow-lg hover:shadow-teal-500/10 active:scale-[0.99] transition-all cursor-pointer text-sm shadow-md disabled:opacity-60 disabled:cursor-not-allowed"
              >
                {isSubmitting ? (
                  <>
                    <Loader2 className="w-5 h-5 animate-spin" />
                    <span>Preparing Secure Checkout...</span>
                  </>
                ) : (
                  <>
                    <Lock className="w-4 h-4" />
                    <span>
                      Proceed with {currency === "USD" 
                        ? (selectedPlan === "pay_per_trip" ? "2 Trips Pass ($2)" : selectedPlan === "yearly" ? "Yearly Premium ($7)" : "Lifetime Premium ($19)") 
                        : (selectedPlan === "pay_per_trip" ? "Pay Per Trip (₹99)" : selectedPlan === "yearly" ? "Yearly Premium (₹499)" : "Lifetime Premium (₹1,499)")}
                    </span>
                    <ArrowRight className="w-4 h-4" />
                  </>
                )}
              </button>

              <div className="text-center space-y-2">
                <span className="text-[10px] font-bold text-slate-400 uppercase tracking-widest block">
                  🔒 Secure Razorpay checkout • International USD & INR supported
                </span>
                {onOpenLegalPage && (
                  <div className="flex items-center justify-center gap-3 text-[11px] font-semibold text-slate-500 dark:text-slate-400">
                    <button
                      type="button"
                      onClick={() => onOpenLegalPage("terms")}
                      className="hover:text-teal-600 dark:hover:text-teal-400 underline cursor-pointer"
                    >
                      Terms
                    </button>
                    <span>•</span>
                    <button
                      type="button"
                      onClick={() => onOpenLegalPage("privacy")}
                      className="hover:text-teal-600 dark:hover:text-teal-400 underline cursor-pointer"
                    >
                      Privacy Policy
                    </button>
                    <span>•</span>
                    <button
                      type="button"
                      onClick={() => onOpenLegalPage("refund")}
                      className="hover:text-teal-600 dark:hover:text-teal-400 underline cursor-pointer"
                    >
                      Refund Policy
                    </button>
                  </div>
                )}
              </div>
            </div>
          )}

          {step === "success" && (
            <div className="text-center py-6 space-y-6">
              <div className="inline-flex items-center justify-center p-5 bg-gradient-to-tr from-amber-400 to-amber-500 text-white rounded-full shadow-lg shadow-amber-500/20 animate-bounce">
                <Crown className="w-10 h-10 fill-white" />
              </div>

              <div className="space-y-2">
                <h3 className="text-2xl font-black text-slate-800 dark:text-slate-100">Congratulations!</h3>
                <p className="text-sm text-teal-600 dark:text-teal-400 font-bold">
                  {selectedPlan === "pay_per_trip" 
                    ? (currency === "USD" ? "Your 2-Trips Token Pass is Credited!" : "Your Single-Trip Token is Credited!") 
                    : selectedPlan === "yearly" 
                      ? "Your Yearly Premium Subscription is Active!" 
                      : "Your Lifetime Premium Membership is Active!"}
                </p>
                <p className="text-xs text-slate-500 dark:text-slate-400 max-w-sm mx-auto leading-relaxed">
                  {selectedPlan === "pay_per_trip" 
                    ? (currency === "USD" ? "Thank you! You have successfully purchased 2 extra AI trip plans ($2 fee). You can generate your new itineraries now." : "Thank you! You have successfully purchased 1 extra AI trip plan. You can generate your new itinerary now.") 
                    : "Thank you! Your account has been upgraded to Premium. You now have unlimited trip planning, companion collaboration, and export perks."}
                </p>
              </div>

              <div className="max-w-xs mx-auto p-4 bg-slate-50 dark:bg-slate-900/40 rounded-2xl border border-slate-100 dark:border-slate-900 flex items-center justify-center gap-3">
                <Heart className="w-5 h-5 text-rose-500 fill-rose-500 animate-pulse" />
                <span className="text-[11px] font-bold text-slate-600 dark:text-slate-300">Enjoy infinite horizons and limitless guides.</span>
              </div>

              <button
                type="button"
                onClick={onClose}
                className="px-8 py-3 bg-teal-600 hover:bg-teal-700 text-white rounded-xl text-xs font-bold cursor-pointer transition-all shadow-md"
              >
                Let's Plan Trips!
              </button>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
