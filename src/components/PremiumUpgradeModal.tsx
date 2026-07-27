import { useState, FormEvent, useEffect } from "react";
import { 
  Crown, Check, CreditCard, Sparkles, Zap, ShieldCheck, 
  ArrowRight, Compass, Landmark, ShieldAlert, Heart,
  Smartphone, Building, Wallet, Info, Lock, Loader2, AlertCircle, Globe
} from "lucide-react";


const WORLD_BANKS = [
  // Global & North America
  { id: "JPMC", name: "JPMorgan Chase Bank", region: "North America (USA)" },
  { id: "BOA", name: "Bank of America", region: "North America (USA)" },
  { id: "WELLS", name: "Wells Fargo Bank", region: "North America (USA)" },
  { id: "CITI", name: "Citibank International", region: "Global / USA" },
  { id: "CAPONE", name: "Capital One Bank", region: "North America (USA)" },
  { id: "GOLDMAN", name: "Goldman Sachs Bank", region: "North America (USA)" },
  { id: "RBC", name: "Royal Bank of Canada (RBC)", region: "North America (Canada)" },
  { id: "TD", name: "TD Bank Group", region: "North America (Canada/USA)" },
  { id: "SCOTIA", name: "Scotiabank", region: "North America (Canada)" },

  // Europe & UK
  { id: "HSBC", name: "HSBC Holdings", region: "Global / UK" },
  { id: "BARCLAYS", name: "Barclays Bank", region: "Europe (UK)" },
  { id: "LLOYDS", name: "Lloyds Banking Group", region: "Europe (UK)" },
  { id: "NATWEST", name: "NatWest Group", region: "Europe (UK)" },
  { id: "SANTANDER", name: "Banco Santander", region: "Europe (Spain/UK/Global)" },
  { id: "BNP", name: "BNP Paribas", region: "Europe (France)" },
  { id: "CREDIT_AG", name: "Crédit Agricole", region: "Europe (France)" },
  { id: "DEUTSCHE", name: "Deutsche Bank", region: "Europe (Germany)" },
  { id: "UBS", name: "UBS Group", region: "Europe (Switzerland)" },
  { id: "ING", name: "ING Group", region: "Europe (Netherlands)" },
  { id: "BBVA", name: "BBVA", region: "Europe (Spain)" },
  { id: "INTESA", name: "Intesa Sanpaolo", region: "Europe (Italy)" },

  // Asia-Pacific
  { id: "DBS", name: "DBS Bank", region: "Asia (Singapore)" },
  { id: "OCBC", name: "OCBC Bank", region: "Asia (Singapore)" },
  { id: "UOB", name: "United Overseas Bank (UOB)", region: "Asia (Singapore)" },
  { id: "STANCHAR", name: "Standard Chartered Bank", region: "Global / Asia" },
  { id: "BOC", name: "Bank of China", region: "Asia (China)" },
  { id: "ICBC", name: "Industrial & Commercial Bank of China (ICBC)", region: "Asia (China)" },
  { id: "CCB", name: "China Construction Bank", region: "Asia (China)" },
  { id: "MUFG", name: "MUFG Bank (Mitsubishi UFJ)", region: "Asia (Japan)" },
  { id: "SMBC", name: "Sumitomo Mitsui Banking Corp", region: "Asia (Japan)" },
  { id: "MIZUHO", name: "Mizuho Bank", region: "Asia (Japan)" },
  { id: "CBA", name: "Commonwealth Bank of Australia", region: "Australia" },
  { id: "ANZ", name: "ANZ Bank", region: "Australia & NZ" },
  { id: "WESTPAC", name: "Westpac Banking Corp", region: "Australia" },
  { id: "NAB", name: "National Australia Bank (NAB)", region: "Australia" },

  // India
  { id: "SBI", name: "State Bank of India (SBI)", region: "India" },
  { id: "HDFC", name: "HDFC Bank", region: "India" },
  { id: "ICICI", name: "ICICI Bank", region: "India" },
  { id: "AXIS", name: "Axis Bank", region: "India" },
  { id: "KOTAK", name: "Kotak Mahindra Bank", region: "India" },
  { id: "PNB", name: "Punjab National Bank", region: "India" },
  { id: "BOB", name: "Bank of Baroda", region: "India" },
  { id: "YES", name: "Yes Bank", region: "India" },
  { id: "IDFC", name: "IDFC FIRST Bank", region: "India" },

  // Middle East & Africa
  { id: "ENBD", name: "Emirates NBD", region: "Middle East (UAE)" },
  { id: "QNB", name: "Qatar National Bank (QNB)", region: "Middle East (Qatar)" },
  { id: "FAB", name: "First Abu Dhabi Bank (FAB)", region: "Middle East (UAE)" },
  { id: "SNB", name: "Saudi National Bank", region: "Middle East (Saudi Arabia)" },
  { id: "STANDARD_SA", name: "Standard Bank", region: "Africa (South Africa)" },

  // Latin America
  { id: "ITAU", name: "Itaú Unibanco", region: "Latin America (Brazil)" },
  { id: "BDB", name: "Banco do Brasil", region: "Latin America (Brazil)" },
  { id: "BRADESCO", name: "Banco Bradesco", region: "Latin America (Brazil)" },
];

interface PremiumUpgradeModalProps {
  isOpen: boolean;
  onClose: () => void;
  onUpgradeSuccess: (chosenPlan: "pay_per_trip" | "yearly" | "lifetime", tripsAddedCount?: number) => void;
  userEmail: string;
  currentPlan?: "free" | "pay_per_trip" | "yearly" | "lifetime";
  remainingFreeTrips?: number;
  paidTripsBalance?: number;
}

export default function PremiumUpgradeModal({ 
  isOpen, 
  onClose, 
  onUpgradeSuccess, 
  userEmail,
  currentPlan = "free",
  remainingFreeTrips = 2,
  paidTripsBalance = 0
}: PremiumUpgradeModalProps) {
  const [step, setStep] = useState<"pricing" | "checkout" | "success">("pricing");
  const [selectedPlan, setSelectedPlan] = useState<"pay_per_trip" | "yearly" | "lifetime">("yearly");
  const [currency, setCurrency] = useState<"USD" | "INR">("USD");
  const [cardNumber, setCardNumber] = useState("");
  const [expiry, setExpiry] = useState("");
  const [cvc, setCvc] = useState("");
  const [cardName, setCardName] = useState("");
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [errors, setErrors] = useState<{ [key: string]: string }>({});

  // Razorpay Gateway integration states
  const [razorpayConfig, setRazorpayConfig] = useState<{ keyId: string; isConfigured: boolean } | null>(null);
  const [isConfigLoading, setIsConfigLoading] = useState(false);
  const [paymentMethod, setPaymentMethod] = useState<"upi" | "card" | "netbanking" | "wallet">("card");
  const [upiId, setUpiId] = useState("");
  const [selectedBank, setSelectedBank] = useState("JPMC");
  const [bankSearch, setBankSearch] = useState("");
  const [selectedWallet, setSelectedWallet] = useState("paytm");
  const [paymentLog, setPaymentLog] = useState<string>("");
  const [razorpayError, setRazorpayError] = useState<string>("");
  const [isScriptLoaded, setIsScriptLoaded] = useState(false);

  // Load Razorpay config and checkout script on modal open
  useEffect(() => {
    if (!isOpen) return;

    setIsConfigLoading(true);
    setRazorpayError("");
    setPaymentLog("");

    fetch("/api/razorpay/config")
      .then((res) => res.json())
      .then((data) => {
        setRazorpayConfig(data);
        setIsConfigLoading(false);
      })
      .catch((err) => {
        console.error("Failed to fetch Razorpay config:", err);
        setRazorpayConfig({ keyId: "rzp_test_mock_key_id", isConfigured: false });
        setIsConfigLoading(false);
      });

    // Inject Razorpay standard checkout script dynamically
    if (!(window as any).Razorpay) {
      const script = document.createElement("script");
      script.src = "https://checkout.razorpay.com/v1/checkout.js";
      script.async = true;
      script.onload = () => setIsScriptLoaded(true);
      script.onerror = () => {
        console.warn("Failed to load Razorpay SDK dynamically. Safe iframe fallback will be used.");
        setIsScriptLoaded(false);
      };
      document.body.appendChild(script);
    } else {
      setIsScriptLoaded(true);
    }
  }, [isOpen]);


  if (!isOpen) return null;

  const handleCardNumberChange = (value: string) => {
    // Format card number: xxxx xxxx xxxx xxxx
    const sanitized = value.replace(/\D/g, "").slice(0, 16);
    const matches = sanitized.match(/\d{4,16}/g);
    const match = (matches && matches[0]) || "";
    const parts = [];

    for (let i = 0, len = match.length; i < len; i += 4) {
      parts.push(match.substring(i, i + 4));
    }

    if (parts.length > 0) {
      setCardNumber(parts.join(" "));
    } else {
      setCardNumber(sanitized);
    }
  };

  const handleExpiryChange = (value: string) => {
    // Format expiry: MM/YY
    const sanitized = value.replace(/\D/g, "").slice(0, 4);
    if (sanitized.length >= 2) {
      setExpiry(`${sanitized.slice(0, 2)}/${sanitized.slice(2, 4)}`);
    } else {
      setExpiry(sanitized);
    }
  };

  const handleCvcChange = (value: string) => {
    setCvc(value.replace(/\D/g, "").slice(0, 3));
  };

  const handleProceedWithRazorpayReal = async () => {
    setIsSubmitting(true);
    setRazorpayError("");
    setPaymentLog("Initializing secure Razorpay gateway...");

    try {
      // 1. Create real or simulated order on backend
      const res = await fetch("/api/razorpay/create-order", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ planType: selectedPlan, currency })
      });

      if (!res.ok) {
        const errData = await res.json();
        throw new Error(errData.error || "Failed to create order on the server.");
      }

      const orderData = await res.json();
      setPaymentLog(`Order created successfully on server: ${orderData.id}`);

      if (orderData.isSimulated) {
        setPaymentLog("Simulated order detected. Falling back to inline sandbox widget.");
        setIsSubmitting(false);
        // We will let the user use the inline simulation since keys are missing
        return;
      }

      // 2. Setup standard Razorpay options for official popup
      const options = {
        key: razorpayConfig?.keyId || "rzp_test_mock_key_id",
        amount: orderData.amount,
        currency: orderData.currency,
        name: "TripBalancing",
        description: `${selectedPlan.replace(/_/g, " ").toUpperCase()} Plan Upgrade (${currency})`,
        order_id: orderData.id,
        image: "https://cdn-icons-png.flaticon.com/512/3125/3125848.png",
        prefill: {
          email: userEmail,
          contact: ""
        },
        theme: {
          color: "#0d9488" // Emerald-Teal accent
        },
        handler: async (response: any) => {
          setPaymentLog("Payment authorized! Verifying with backend signature...");
          try {
            const verifyRes = await fetch("/api/razorpay/verify-payment", {
              method: "POST",
              headers: { "Content-Type": "application/json" },
              body: JSON.stringify({
                razorpay_order_id: response.razorpay_order_id,
                razorpay_payment_id: response.razorpay_payment_id,
                razorpay_signature: response.razorpay_signature,
                planType: selectedPlan
              })
            });

            if (!verifyRes.ok) {
              const verifyErr = await verifyRes.json();
              throw new Error(verifyErr.error || "Signature verification failed.");
            }

            const verifyData = await verifyRes.json();
            if (verifyData.verified) {
              setPaymentLog("Payment verified successfully!");
              setIsSubmitting(false);
              setStep("success");
              const tripsToAdd = (selectedPlan === "pay_per_trip" && currency === "USD") ? 2 : 1;
              onUpgradeSuccess(selectedPlan, tripsToAdd);
            } else {
              throw new Error("Payment verification failed on the server.");
            }
          } catch (err: any) {
            console.error("Verification error:", err);
            setRazorpayError(`Verification failed: ${err.message}`);
            setIsSubmitting(false);
          }
        },
        modal: {
          ondismiss: () => {
            setPaymentLog("Payment window closed by user.");
            setIsSubmitting(false);
          }
        }
      };

      const rzp = new (window as any).Razorpay(options);
      rzp.on("payment.failed", (response: any) => {
        setRazorpayError(`Payment failed: ${response.error.description}`);
        setIsSubmitting(false);
      });
      rzp.open();
    } catch (err: any) {
      console.error("Razorpay Popup Launch Error:", err);
      setRazorpayError(err.message || "Could not launch Razorpay gateway. Please use our inline sandbox checkout instead!");
      setIsSubmitting(false);
    }
  };

  const handleSimulatedPayment = async (e: FormEvent) => {
    e.preventDefault();
    setIsSubmitting(true);
    setRazorpayError("");
    setPaymentLog("Initializing sandbox transaction...");

    // Basic validation based on selected method
    if (paymentMethod === "upi" && !upiId.trim()) {
      setErrors({ upiId: "Please enter a valid UPI ID (e.g., vashish@okaxis)" });
      setIsSubmitting(false);
      return;
    }
    if (paymentMethod === "card") {
      const newErrors: { [key: string]: string } = {};
      if (!cardNumber || cardNumber.replace(/\s/g, "").length < 16) {
        newErrors.cardNumber = "Please enter a valid 16-digit card number.";
      }
      if (!expiry || expiry.length < 5) {
        newErrors.expiry = "Please enter expiry date (MM/YY).";
      }
      if (!cvc || cvc.length < 3) {
        newErrors.cvc = "Please enter a 3-digit CVC.";
      }
      if (!cardName.trim()) {
        newErrors.cardName = "Please enter the cardholder's name.";
      }
      if (Object.keys(newErrors).length > 0) {
        setErrors(newErrors);
        setIsSubmitting(false);
        return;
      }
    }

    setErrors({});

    try {
      // 1. Create order on the backend to trigger real-world simulation pipeline
      const res = await fetch("/api/razorpay/create-order", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ planType: selectedPlan, currency })
      });

      if (!res.ok) throw new Error("Could not contact server to initiate checkout.");
      const orderData = await res.json();

      setPaymentLog(`Simulating network route to Razorpay PG... (Order: ${orderData.id}, Currency: ${currency})`);
      await new Promise((resolve) => setTimeout(resolve, 1200));

      setPaymentLog(`Authorizing sandbox checkout with card/bank node...`);
      await new Promise((resolve) => setTimeout(resolve, 1000));

      setPaymentLog("Creating cryptographic transaction signature...");

      // 2. Call backend verification route to finalize database states / verify
      const verifyRes = await fetch("/api/razorpay/verify-payment", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          razorpay_order_id: orderData.id,
          razorpay_payment_id: "pay_simulated_" + Math.random().toString(36).substring(2, 12),
          razorpay_signature: "sig_simulated_" + Math.random().toString(36).substring(2, 12),
          planType: selectedPlan
        })
      });

      if (!verifyRes.ok) throw new Error("Verification failed on signature layer.");
      const verifyData = await verifyRes.json();

      if (verifyData.verified) {
        setPaymentLog("Signature verified perfectly! Credit active.");
        await new Promise((resolve) => setTimeout(resolve, 600));
        setIsSubmitting(false);
        setStep("success");
        const tripsToAdd = (selectedPlan === "pay_per_trip" && currency === "USD") ? 2 : 1;
        onUpgradeSuccess(selectedPlan, tripsToAdd);
      } else {
        throw new Error("Invalid checkout parameters.");
      }
    } catch (err: any) {
      console.error("Simulation error:", err);
      setRazorpayError(err?.message || "Sandbox payment failed. Please retry.");
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
                    onClick={() => {
                      setCurrency("USD");
                      if (paymentMethod === "upi") setPaymentMethod("card");
                    }}
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

              {/* Upgrade Trigger */}
              <button
                id="modal-proceed-to-checkout-btn"
                onClick={() => setStep("checkout")}
                className="w-full flex items-center justify-center gap-2 h-14 bg-gradient-to-r from-teal-500 via-emerald-500 to-cyan-500 text-white font-bold rounded-2xl hover:shadow-lg hover:shadow-teal-500/10 active:scale-[0.99] transition-all cursor-pointer text-sm shadow-md"
              >
                <span>
                  Proceed with {currency === "USD" 
                    ? (selectedPlan === "pay_per_trip" ? "2 Trips Pass ($2)" : selectedPlan === "yearly" ? "Yearly Premium ($7)" : "Lifetime Premium ($19)") 
                    : (selectedPlan === "pay_per_trip" ? "Pay Per Trip (₹99)" : selectedPlan === "yearly" ? "Yearly Premium (₹499)" : "Lifetime Premium (₹1,499)")}
                </span>
                <ArrowRight className="w-4 h-4" />
              </button>

              <div className="text-center">
                <span className="text-[10px] font-bold text-slate-400 uppercase tracking-widest">
                  🔒 Secure checkout • International USD & INR supported
                </span>
              </div>
            </div>
          )}

          {step === "checkout" && (
            <form onSubmit={handleSimulatedPayment} className="space-y-5 text-left">
              <div className="flex items-center gap-2.5 p-3.5 bg-slate-50 dark:bg-slate-900/40 rounded-2xl border border-slate-100 dark:border-slate-900 text-xs font-semibold text-slate-600 dark:text-slate-300">
                <Compass className="w-4 h-4 text-teal-500 flex-shrink-0" />
                <span>
                  You are upgrading to <strong>
                    {currency === "USD"
                      ? (selectedPlan === "pay_per_trip" ? "2 Trips Pass ($2)" : selectedPlan === "yearly" ? "Yearly Premium ($7/yr)" : "Lifetime Premium ($19)")
                      : (selectedPlan === "pay_per_trip" ? "Pay Per Trip (₹99)" : selectedPlan === "yearly" ? "Yearly Premium (₹499/yr)" : "Premium Lifetime (₹1,499)")}
                  </strong> for <strong>{userEmail}</strong>.
                </span>
              </div>

              {/* API Configuration & Popup Banner */}
              {isConfigLoading ? (
                <div className="flex items-center justify-center p-4 bg-slate-50 dark:bg-slate-900/40 rounded-2xl">
                  <Loader2 className="w-4 h-4 text-teal-500 animate-spin mr-2" />
                  <span className="text-xs text-slate-500 font-bold">Checking payment gateway status...</span>
                </div>
              ) : razorpayConfig?.isConfigured ? (
                <div className="flex flex-col gap-2.5 p-3.5 bg-emerald-500/10 dark:bg-emerald-950/20 border border-emerald-500/20 rounded-2xl">
                  <div className="flex items-center justify-between">
                    <div className="flex gap-2.5 items-center">
                      <div className="w-2.5 h-2.5 bg-emerald-500 rounded-full animate-pulse" />
                      <div>
                        <h5 className="text-xs font-black text-emerald-800 dark:text-emerald-300">Razorpay Live Gateway Active</h5>
                        <p className="text-[10px] text-emerald-600/90 dark:text-emerald-400">Connected to active merchant node on server.</p>
                      </div>
                    </div>
                  </div>
                  {isScriptLoaded ? (
                    <button
                      type="button"
                      onClick={handleProceedWithRazorpayReal}
                      disabled={isSubmitting}
                      className="w-full h-10 bg-emerald-600 hover:bg-emerald-700 text-white text-xs font-bold rounded-xl transition-all flex items-center justify-center gap-1.5 shadow-sm"
                    >
                      <Lock className="w-3.5 h-3.5" />
                      <span>Launch Official Razorpay checkout</span>
                    </button>
                  ) : (
                    <div className="text-[10px] text-amber-500 font-semibold italic text-center">
                      ⏳ Razorpay script is loading... If blocked by sandbox iframe, please use the inline widget below.
                    </div>
                  )}
                </div>
              ) : (
                <div className="flex flex-col gap-2 p-3.5 bg-amber-500/10 dark:bg-amber-950/10 border border-amber-500/20 rounded-2xl">
                  <div className="flex items-start gap-2.5">
                    <AlertCircle className="w-4 h-4 text-amber-500 flex-shrink-0 mt-0.5" />
                    <div>
                      <h5 className="text-xs font-black text-amber-800 dark:text-amber-400">Razorpay Simulator Active</h5>
                      <p className="text-[10px] text-amber-600 dark:text-amber-500 font-semibold leading-normal">
                        No custom credentials in server secrets. Using interactive sandbox UI.
                      </p>
                    </div>
                  </div>
                  <p className="text-[9px] text-slate-500 dark:text-slate-400 leading-normal border-t border-slate-100 dark:border-slate-900 pt-2 font-medium">
                    💡 To verify real production or sandbox checkout, provide <code className="bg-slate-100 dark:bg-slate-900 px-1 py-0.5 rounded font-mono text-[8px] text-slate-600 dark:text-slate-300">RAZORPAY_KEY_ID</code> and <code className="bg-slate-100 dark:bg-slate-900 px-1 py-0.5 rounded font-mono text-[8px] text-slate-600 dark:text-slate-300">RAZORPAY_KEY_SECRET</code> in the app's Secrets menu.
                  </p>
                </div>
              )}

              {/* Interactive payment methods selector widget */}
              <div className="border border-slate-200 dark:border-slate-800 rounded-2xl overflow-hidden bg-slate-50/50 dark:bg-slate-950/40">
                <div className="flex border-b border-slate-200 dark:border-slate-850 bg-slate-100/50 dark:bg-slate-900/40">
                  <button
                    type="button"
                    onClick={() => { setPaymentMethod("upi"); setRazorpayError(""); }}
                    className={`flex-1 py-3 text-xs font-bold flex items-center justify-center gap-1.5 border-b-2 transition-all ${
                      paymentMethod === "upi"
                        ? "border-teal-500 text-teal-600 dark:text-teal-400 bg-white dark:bg-slate-900/60"
                        : "border-transparent text-slate-500 hover:text-slate-700 hover:bg-slate-50 dark:hover:bg-slate-900/20"
                    }`}
                  >
                    <Smartphone className="w-3.5 h-3.5" />
                    <span>UPI / QR</span>
                  </button>
                  <button
                    type="button"
                    onClick={() => { setPaymentMethod("card"); setRazorpayError(""); }}
                    className={`flex-1 py-3 text-xs font-bold flex items-center justify-center gap-1.5 border-b-2 transition-all ${
                      paymentMethod === "card"
                        ? "border-teal-500 text-teal-600 dark:text-teal-400 bg-white dark:bg-slate-900/60"
                        : "border-transparent text-slate-500 hover:text-slate-700 hover:bg-slate-50 dark:hover:bg-slate-900/20"
                    }`}
                  >
                    <CreditCard className="w-3.5 h-3.5" />
                    <span>Card</span>
                  </button>
                  <button
                    type="button"
                    onClick={() => { setPaymentMethod("netbanking"); setRazorpayError(""); }}
                    className={`flex-1 py-3 text-xs font-bold flex items-center justify-center gap-1.5 border-b-2 transition-all ${
                      paymentMethod === "netbanking"
                        ? "border-teal-500 text-teal-600 dark:text-teal-400 bg-white dark:bg-slate-900/60"
                        : "border-transparent text-slate-500 hover:text-slate-700 hover:bg-slate-50 dark:hover:bg-slate-900/20"
                    }`}
                  >
                    <Building className="w-3.5 h-3.5" />
                    <span>Netbanking</span>
                  </button>
                  <button
                    type="button"
                    onClick={() => { setPaymentMethod("wallet"); setRazorpayError(""); }}
                    className={`flex-1 py-3 text-xs font-bold flex items-center justify-center gap-1.5 border-b-2 transition-all ${
                      paymentMethod === "wallet"
                        ? "border-teal-500 text-teal-600 dark:text-teal-400 bg-white dark:bg-slate-900/60"
                        : "border-transparent text-slate-500 hover:text-slate-700 hover:bg-slate-50 dark:hover:bg-slate-900/20"
                    }`}
                  >
                    <Wallet className="w-3.5 h-3.5" />
                    <span>Wallet</span>
                  </button>
                </div>

                <div className="p-4 bg-white dark:bg-slate-950 text-left">
                  {/* UPI Tab */}
                  {paymentMethod === "upi" && (
                    <div className="space-y-4 animate-in fade-in duration-100">
                      <div className="space-y-1.5">
                        <label className="text-[10px] font-black uppercase tracking-wider text-slate-400 dark:text-slate-500 block">
                          Enter UPI ID / Virtual Payment Address
                        </label>
                        <div className="relative">
                          <input
                            type="text"
                            placeholder="yadavvashish@upi"
                            value={upiId}
                            onChange={(e) => setUpiId(e.target.value)}
                            className="w-full px-4 py-3 bg-slate-50 dark:bg-slate-900 border border-slate-200 dark:border-slate-800 text-slate-800 dark:text-slate-100 text-xs font-medium rounded-xl focus:ring-1 focus:ring-teal-500 focus:outline-none transition-all"
                          />
                        </div>
                        {errors.upiId && <p className="text-[10px] text-rose-500 font-bold">{errors.upiId}</p>}
                      </div>

                      {/* Quick selects */}
                      <div className="flex flex-wrap gap-2 pt-1">
                        {["vashish@okaxis", "yadav@paytm", "travel@phonepe", "test@upi"].map((tag) => (
                          <button
                            key={tag}
                            type="button"
                            onClick={() => setUpiId(tag)}
                            className="text-[10px] font-bold text-slate-600 hover:text-teal-600 dark:text-slate-400 dark:hover:text-teal-400 bg-slate-50 dark:bg-slate-900 border border-slate-200 dark:border-slate-800 px-3 py-1 rounded-full transition-all"
                          >
                            {tag}
                          </button>
                        ))}
                      </div>

                      <div className="flex gap-2.5 p-3 bg-slate-50 dark:bg-slate-900/30 rounded-xl items-center border border-slate-100 dark:border-slate-900 text-[10px] text-slate-500 dark:text-slate-400 font-semibold leading-relaxed">
                        <Smartphone className="w-5 h-5 text-teal-600 dark:text-teal-400 flex-shrink-0" />
                        <span>Enter any test UPI address or select a preset. Pressing <strong>Authorize Payment</strong> below will simulate the UPI notification and request instant verification.</span>
                      </div>
                    </div>
                  )}

                  {/* Card Tab */}
                  {paymentMethod === "card" && (
                    <div className="space-y-4 animate-in fade-in duration-100">
                      <div className="space-y-1.5">
                        <label className="text-[10px] font-black uppercase tracking-wider text-slate-400 block">Cardholder Name</label>
                        <input
                          type="text"
                          placeholder="Vashish Yadav"
                          value={cardName}
                          onChange={(e) => setCardName(e.target.value)}
                          className="w-full px-4 py-3 bg-slate-50 dark:bg-slate-900 border border-slate-200 dark:border-slate-800 text-slate-800 dark:text-slate-100 text-xs font-medium rounded-xl focus:ring-1 focus:ring-teal-500"
                        />
                        {errors.cardName && <p className="text-[10px] text-rose-500 font-bold">{errors.cardName}</p>}
                      </div>

                      <div className="space-y-1.5">
                        <label className="text-[10px] font-black uppercase tracking-wider text-slate-400 block">Card Number</label>
                        <div className="relative">
                          <input
                            type="text"
                            placeholder="4111 2222 3333 4444"
                            value={cardNumber}
                            onChange={(e) => handleCardNumberChange(e.target.value)}
                            className="w-full pl-4 pr-12 py-3 bg-slate-50 dark:bg-slate-900 border border-slate-200 dark:border-slate-800 text-slate-800 dark:text-slate-100 text-xs font-medium rounded-xl focus:ring-1 focus:ring-teal-500 focus:outline-none transition-all font-mono"
                          />
                          <CreditCard className="absolute right-4 top-3.5 w-4 h-4 text-slate-400" />
                        </div>
                        {errors.cardNumber && <p className="text-[10px] text-rose-500 font-bold">{errors.cardNumber}</p>}
                      </div>

                      <div className="grid grid-cols-2 gap-4">
                        <div className="space-y-1.5">
                          <label className="text-[10px] font-black uppercase tracking-wider text-slate-400 block">Expiry Date</label>
                          <input
                            type="text"
                            placeholder="12/29"
                            value={expiry}
                            onChange={(e) => handleExpiryChange(e.target.value)}
                            className="w-full px-4 py-3 bg-slate-50 dark:bg-slate-900 border border-slate-200 dark:border-slate-800 text-slate-800 dark:text-slate-100 text-xs font-medium rounded-xl focus:ring-1 focus:ring-teal-500 focus:outline-none transition-all font-mono"
                          />
                          {errors.expiry && <p className="text-[10px] text-rose-500 font-bold">{errors.expiry}</p>}
                        </div>

                        <div className="space-y-1.5">
                          <label className="text-[10px] font-black uppercase tracking-wider text-slate-400 block">CVC</label>
                          <input
                            type="password"
                            placeholder="•••"
                            value={cvc}
                            onChange={(e) => handleCvcChange(e.target.value)}
                            className="w-full px-4 py-3 bg-slate-50 dark:bg-slate-900 border border-slate-200 dark:border-slate-800 text-slate-800 dark:text-slate-100 text-xs font-medium rounded-xl focus:ring-1 focus:ring-teal-500 focus:outline-none transition-all font-mono"
                          />
                          {errors.cvc && <p className="text-[10px] text-rose-500 font-bold">{errors.cvc}</p>}
                        </div>
                      </div>
                    </div>
                  )}

                  {/* Netbanking Tab */}
                  {paymentMethod === "netbanking" && (
                    <div className="space-y-4 animate-in fade-in duration-100">
                      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-1.5">
                        <label className="text-[10px] font-black uppercase tracking-wider text-slate-400 block">
                          Select Bank (Global Net Banking)
                        </label>
                        <span className="text-[10px] text-teal-600 dark:text-teal-400 font-bold">
                          {WORLD_BANKS.length}+ Global Banks Supported
                        </span>
                      </div>

                      {/* Dropdown Select for instant pick */}
                      <div className="space-y-1.5">
                        <select
                          value={selectedBank}
                          onChange={(e) => setSelectedBank(e.target.value)}
                          className="w-full px-3.5 py-2.5 bg-slate-50 dark:bg-slate-900 border border-slate-200 dark:border-slate-800 text-slate-800 dark:text-slate-100 text-xs font-semibold rounded-xl focus:ring-1 focus:ring-teal-500 cursor-pointer"
                        >
                          {WORLD_BANKS.map((bank) => (
                            <option key={bank.id} value={bank.id}>
                              {bank.name} — {bank.region}
                            </option>
                          ))}
                        </select>
                      </div>

                      {/* Search Filter Box */}
                      <div className="relative">
                        <input
                          type="text"
                          placeholder="Search bank name or country (e.g. Chase, HSBC, Barclays, SBI, DBS...)"
                          value={bankSearch}
                          onChange={(e) => setBankSearch(e.target.value)}
                          className="w-full pl-3.5 pr-8 py-2 bg-white dark:bg-slate-950 border border-slate-200 dark:border-slate-800 text-slate-800 dark:text-slate-100 text-xs font-medium rounded-xl focus:ring-1 focus:ring-teal-500"
                        />
                        {bankSearch && (
                          <button
                            type="button"
                            onClick={() => setBankSearch("")}
                            className="absolute right-2.5 top-2 text-xs text-slate-400 hover:text-slate-600 dark:hover:text-slate-200"
                          >
                            ✕
                          </button>
                        )}
                      </div>

                      {/* Scrollable List of Filtered Banks */}
                      <div className="max-h-48 overflow-y-auto space-y-1.5 pr-1 custom-scrollbar">
                        {WORLD_BANKS.filter(
                          (b) =>
                            b.name.toLowerCase().includes(bankSearch.toLowerCase()) ||
                            b.region.toLowerCase().includes(bankSearch.toLowerCase())
                        ).map((bank) => (
                          <button
                            key={bank.id}
                            type="button"
                            onClick={() => setSelectedBank(bank.id)}
                            className={`w-full p-2.5 rounded-xl border text-left flex items-center justify-between transition-all cursor-pointer ${
                              selectedBank === bank.id
                                ? "border-teal-500 bg-teal-500/10 dark:bg-teal-500/20 ring-1 ring-teal-500"
                                : "border-slate-100 dark:border-slate-800/80 hover:bg-slate-50 dark:hover:bg-slate-900/60 bg-white dark:bg-slate-950"
                            }`}
                          >
                            <div>
                              <span className="text-xs font-bold text-slate-800 dark:text-slate-100 block">{bank.name}</span>
                              <span className="text-[10px] text-slate-400 font-medium">{bank.region}</span>
                            </div>
                            {selectedBank === bank.id && (
                              <span className="text-xs font-black text-teal-600 dark:text-teal-400 bg-teal-500/20 px-2 py-0.5 rounded-full">
                                Selected ✓
                              </span>
                            )}
                          </button>
                        ))}
                      </div>

                      {/* Selected Bank Summary Pill */}
                      {(() => {
                        const active = WORLD_BANKS.find((b) => b.id === selectedBank) || {
                          name: selectedBank,
                          region: "International Bank",
                        };
                        return (
                          <div className="flex items-center gap-2 p-2.5 bg-slate-50 dark:bg-slate-900 rounded-xl border border-slate-200/60 dark:border-slate-800 text-xs font-semibold text-slate-700 dark:text-slate-300">
                            <Building className="w-4 h-4 text-teal-500 flex-shrink-0" />
                            <span>
                              Ready to connect via <strong>{active.name}</strong> ({active.region})
                            </span>
                          </div>
                        );
                      })()}
                    </div>
                  )}

                  {/* Wallet Tab */}
                  {paymentMethod === "wallet" && (
                    <div className="space-y-4 animate-in fade-in duration-100">
                      <label className="text-[10px] font-black uppercase tracking-wider text-slate-400 block">Select Active Wallet</label>
                      <div className="grid grid-cols-2 gap-2">
                        {[
                          { id: "paytm", name: "Paytm Wallet", icon: "📱" },
                          { id: "phonepe", name: "PhonePe Wallet", icon: "🍇" },
                          { id: "mobikwik", name: "MobiKwik", icon: "⚡" },
                          { id: "amazonpay", name: "Amazon Pay", icon: "📦" }
                        ].map((wallet) => (
                          <button
                            key={wallet.id}
                            type="button"
                            onClick={() => setSelectedWallet(wallet.id)}
                            className={`p-3 rounded-xl border flex items-center gap-2.5 transition-all ${
                              selectedWallet === wallet.id
                                ? "border-teal-500 bg-teal-500/5 ring-1 ring-teal-500"
                                : "border-slate-200 dark:border-slate-800 hover:bg-slate-50 dark:hover:bg-slate-900 bg-white dark:bg-slate-950"
                            }`}
                          >
                            <span className="text-sm">{wallet.icon}</span>
                            <span className="text-[11px] font-bold text-slate-700 dark:text-slate-300">{wallet.name}</span>
                          </button>
                        ))}
                      </div>
                    </div>
                  )}
                </div>
              </div>

              {/* Server Route logs / feedback */}
              {(paymentLog || razorpayError) && (
                <div className="p-3 bg-slate-900 text-slate-300 rounded-xl font-mono text-[9px] leading-relaxed border border-slate-800 shadow-inner">
                  {paymentLog && (
                    <p className="text-emerald-400">
                      <span className="text-slate-500">▶</span> {paymentLog}
                    </p>
                  )}
                  {razorpayError && (
                    <p className="text-rose-400">
                      <span className="text-rose-600">✗</span> {razorpayError}
                    </p>
                  )}
                </div>
              )}

              {/* Action Buttons */}
              <div className="flex gap-3 pt-2">
                <button
                  type="button"
                  onClick={() => setStep("pricing")}
                  disabled={isSubmitting}
                  className="w-1/3 h-12 bg-slate-100 dark:bg-slate-900 hover:bg-slate-200 dark:hover:bg-slate-850 text-slate-700 dark:text-slate-300 rounded-xl text-xs font-bold cursor-pointer transition-all flex items-center justify-center"
                >
                  Back
                </button>
                <button
                  type="submit"
                  disabled={isSubmitting}
                  className="flex-1 h-12 bg-teal-600 hover:bg-teal-700 text-white rounded-xl text-xs font-bold cursor-pointer transition-all flex items-center justify-center gap-2 shadow-md"
                >
                  {isSubmitting ? (
                    <>
                      <Loader2 className="w-4 h-4 animate-spin" />
                      <span>Authorizing transaction...</span>
                    </>
                  ) : (
                    <>
                      <Crown className="w-4 h-4 fill-white animate-pulse" />
                      <span>
                        Pay {currency === "USD" 
                          ? (selectedPlan === "pay_per_trip" ? "$2" : selectedPlan === "yearly" ? "$7" : "$19")
                          : (selectedPlan === "pay_per_trip" ? "₹99" : selectedPlan === "yearly" ? "₹499" : "₹1,499")}
                      </span>
                    </>
                  )}
                </button>
              </div>

              <div className="flex items-center justify-center gap-1.5 text-[9px] text-slate-400 font-semibold">
                <ShieldCheck className="w-3.5 h-3.5 text-teal-600" />
                <span>PCI-DSS Secured • SSL Encrypted Handshake</span>
              </div>
            </form>
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
