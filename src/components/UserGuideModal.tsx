import { useEffect, useState } from "react";
import {
  ArrowLeft,
  ArrowRight,
  CalendarDays,
  Check,
  CircleHelp,
  DollarSign,
  Download,
  MapPin,
  Plane,
  Save,
  Share2,
  Sparkles,
  Split,
  X,
} from "lucide-react";

interface UserGuideModalProps {
  isOpen: boolean;
  onClose: () => void;
}

type GuideStep = {
  title: string;
  description: string;
  bullets: string[];
  icon: typeof MapPin;
};

const GUIDE_STEPS: GuideStep[] = [
  {
    title: "Start your trip",
    description: "Enter the basic details for the journey you want TripBalancing to plan.",
    bullets: [
      "Enter your starting location and destination.",
      "Choose your travel dates.",
      "Select the number of travelers.",
    ],
    icon: MapPin,
  },
  {
    title: "Choose your travel preferences",
    description: "Tell TripBalancing what kind of experience you want so the itinerary matches your style.",
    bullets: [
      "Select your travel style and trip type.",
      "Choose interests and activities.",
      "Set accommodation, transport, and food preferences when available.",
    ],
    icon: Sparkles,
  },
  {
    title: "Set your budget",
    description: "Give TripBalancing a budget to use while building and estimating your trip.",
    bullets: [
      "Enter the amount you want to spend.",
      "Review the estimated allocation across major trip expenses.",
      "Use the budget as a planning target rather than a guaranteed final price.",
    ],
    icon: DollarSign,
  },
  {
    title: "Generate your trip plan",
    description: "Submit the trip form and TripBalancing will build a day-by-day itinerary from your details.",
    bullets: [
      "Your destination, dates, travelers, preferences, and budget are used together.",
      "The plan can include activities, transport, accommodation, meals, and estimated costs.",
      "Generation may take a little time while the trip is prepared.",
    ],
    icon: Sparkles,
  },
  {
    title: "Review your itinerary",
    description: "Read through each day before saving or sharing the trip.",
    bullets: [
      "Check activities and places.",
      "Review the suggested timing and travel flow.",
      "Check accommodation and estimated expenses.",
    ],
    icon: CalendarDays,
  },
  {
    title: "Check your trip budget",
    description: "Use the budget information to understand the estimated cost of the complete trip.",
    bullets: [
      "Compare your planned budget with the estimated trip cost.",
      "Review daily and category-level expenses where provided.",
      "Remember that actual prices can change before booking.",
    ],
    icon: DollarSign,
  },
  {
    title: "Explore travel and hotel options",
    description: "Use the available travel tools and partner options to continue researching your trip.",
    bullets: [
      "Explore flights or other transport options when available.",
      "Review hotel and accommodation options.",
      "Check activity and booking options provided by the app.",
    ],
    icon: Plane,
  },
  {
    title: "Save your trip",
    description: "Save an itinerary to your Travel Hub so you can return to it later.",
    bullets: [
      "Open the generated itinerary.",
      "Choose Save Trip.",
      "Find saved trips later from your trip dashboard.",
    ],
    icon: Save,
  },
  {
    title: "Download your trip PDF",
    description: "Create a travel document from your itinerary when the PDF export option is available.",
    bullets: [
      "Open your itinerary.",
      "Use the Export PDF option.",
      "Keep the PDF on your phone or share it with your travel companions.",
    ],
    icon: Download,
  },
  {
    title: "Split trip costs",
    description: "Use Split Trip Cost when you are traveling with friends or family and want to divide expenses.",
    bullets: [
      "Open the cost-splitting tool from your trip.",
      "Add the relevant expenses and participants.",
      "Review how the expenses are divided between travelers.",
    ],
    icon: Split,
  },
  {
    title: "Share and travel together",
    description: "Use the companion and sharing tools to involve the people traveling with you.",
    bullets: [
      "Invite travel companions when the option is available.",
      "Share an itinerary with your group.",
      "Shared itineraries can be viewed in read-only mode by recipients.",
    ],
    icon: Share2,
  },
  {
    title: "Know your plan allowance",
    description: "Your account shows how many trip plans you have available and when an upgrade is needed.",
    bullets: [
      "Free users receive 5 trip plans.",
      "Premium plans provide the entitlement described on the pricing screen.",
      "When your free allowance is used, TripBalancing will show the Premium options.",
    ],
    icon: CircleHelp,
  },
];

export default function UserGuideModal({ isOpen, onClose }: UserGuideModalProps) {
  const [step, setStep] = useState(0);

  useEffect(() => {
    if (!isOpen) return;
    setStep(0);

    const previousOverflow = document.body.style.overflow;
    document.body.style.overflow = "hidden";

    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.key === "Escape") onClose();
      if (event.key === "ArrowRight") setStep((current) => Math.min(GUIDE_STEPS.length - 1, current + 1));
      if (event.key === "ArrowLeft") setStep((current) => Math.max(0, current - 1));
    };

    window.addEventListener("keydown", handleKeyDown);
    return () => {
      document.body.style.overflow = previousOverflow;
      window.removeEventListener("keydown", handleKeyDown);
    };
  }, [isOpen, onClose]);

  if (!isOpen) return null;

  const current = GUIDE_STEPS[step];
  const Icon = current.icon;
  const progress = ((step + 1) / GUIDE_STEPS.length) * 100;

  return (
    <div
      className="fixed inset-0 z-[100] flex items-center justify-center bg-slate-950/70 p-3 backdrop-blur-sm sm:p-6"
      role="dialog"
      aria-modal="true"
      aria-labelledby="tripbalancing-guide-title"
      onMouseDown={(event) => {
        if (event.target === event.currentTarget) onClose();
      }}
    >
      <div className="relative flex max-h-[92vh] w-full max-w-3xl flex-col overflow-hidden rounded-[28px] border border-slate-200 bg-white shadow-2xl dark:border-slate-800 dark:bg-slate-950">
        <div className="flex items-start justify-between gap-4 border-b border-slate-100 bg-gradient-to-r from-teal-50 via-white to-cyan-50 px-5 py-4 dark:border-slate-900 dark:from-teal-950/30 dark:via-slate-950 dark:to-cyan-950/20 sm:px-7 sm:py-5">
          <div className="min-w-0">
            <div className="mb-1 flex items-center gap-2 text-[10px] font-black uppercase tracking-[0.18em] text-teal-600 dark:text-teal-400">
              <CircleHelp className="h-3.5 w-3.5" />
              TripBalancing Guide
            </div>
            <h2 id="tripbalancing-guide-title" className="text-xl font-black tracking-tight text-slate-900 dark:text-white sm:text-2xl">
              How to use TripBalancing
            </h2>
            <p className="mt-1 text-xs font-medium text-slate-500 dark:text-slate-400">
              Follow the steps from planning to saving and sharing your trip.
            </p>
          </div>
          <button
            type="button"
            onClick={onClose}
            aria-label="Close guide"
            className="shrink-0 rounded-xl border border-slate-200 p-2 text-slate-500 transition-colors hover:bg-slate-100 hover:text-slate-900 dark:border-slate-800 dark:hover:bg-slate-900 dark:hover:text-white"
          >
            <X className="h-4 w-4" />
          </button>
        </div>

        <div className="h-1.5 bg-slate-100 dark:bg-slate-900">
          <div
            className="h-full bg-gradient-to-r from-teal-500 to-cyan-500 transition-all duration-300"
            style={{ width: `${progress}%` }}
          />
        </div>

        <div className="min-h-0 flex-1 overflow-y-auto px-5 py-6 sm:px-8 sm:py-8">
          <div className="grid gap-6 sm:grid-cols-[112px_minmax(0,1fr)] sm:items-start">
            <div className="flex items-center gap-3 sm:flex-col">
              <div className="flex h-16 w-16 shrink-0 items-center justify-center rounded-2xl bg-teal-500/10 text-teal-600 dark:bg-teal-400/10 dark:text-teal-400 sm:h-24 sm:w-24 sm:rounded-3xl">
                <Icon className="h-8 w-8 sm:h-11 sm:w-11" />
              </div>
              <div className="sm:text-center">
                <div className="text-2xl font-black text-slate-900 dark:text-white">
                  {String(step + 1).padStart(2, "0")}
                </div>
                <div className="text-[9px] font-black uppercase tracking-widest text-slate-400">
                  of {GUIDE_STEPS.length}
                </div>
              </div>
            </div>

            <div>
              <div className="mb-4 flex flex-wrap items-center gap-2">
                <span className="rounded-full bg-teal-500/10 px-2.5 py-1 text-[9px] font-black uppercase tracking-wider text-teal-600 dark:text-teal-400">
                  Step {step + 1}
                </span>
                <span className="text-[10px] font-bold text-slate-400">
                  {step === GUIDE_STEPS.length - 1 ? "You're ready to travel" : "Next step →"}
                </span>
              </div>

              <h3 className="text-2xl font-black tracking-tight text-slate-900 dark:text-white sm:text-3xl">
                {current.title}
              </h3>
              <p className="mt-3 max-w-2xl text-sm font-medium leading-7 text-slate-600 dark:text-slate-300">
                {current.description}
              </p>

              <div className="mt-6 space-y-3">
                {current.bullets.map((bullet) => (
                  <div
                    key={bullet}
                    className="flex items-start gap-3 rounded-2xl border border-slate-100 bg-slate-50/80 px-4 py-3 dark:border-slate-800 dark:bg-slate-900/60"
                  >
                    <span className="mt-0.5 flex h-5 w-5 shrink-0 items-center justify-center rounded-full bg-teal-500/10 text-teal-600 dark:bg-teal-400/10 dark:text-teal-400">
                      <Check className="h-3 w-3" />
                    </span>
                    <span className="text-xs font-semibold leading-5 text-slate-600 dark:text-slate-300">{bullet}</span>
                  </div>
                ))}
              </div>

              {step === GUIDE_STEPS.length - 1 && (
                <div className="mt-5 rounded-2xl border border-amber-200 bg-amber-50 px-4 py-3 text-xs font-semibold leading-5 text-amber-900 dark:border-amber-900/40 dark:bg-amber-950/20 dark:text-amber-200">
                  Tip: Start with a realistic budget and review the generated itinerary before booking anything.
                </div>
              )}
            </div>
          </div>
        </div>

        <div className="border-t border-slate-100 bg-white px-5 py-4 dark:border-slate-900 dark:bg-slate-950 sm:px-7">
          <div className="mb-3 hidden items-center justify-center gap-1.5 sm:flex">
            {GUIDE_STEPS.map((_, index) => (
              <button
                key={index}
                type="button"
                aria-label={`Go to guide step ${index + 1}`}
                onClick={() => setStep(index)}
                className={`h-1.5 rounded-full transition-all ${index === step ? "w-7 bg-teal-500" : "w-1.5 bg-slate-200 hover:bg-slate-300 dark:bg-slate-800 dark:hover:bg-slate-700"}`}
              />
            ))}
          </div>

          <div className="flex items-center justify-between gap-3">
            <button
              type="button"
              onClick={() => setStep((current) => Math.max(0, current - 1))}
              disabled={step === 0}
              className="inline-flex items-center gap-1.5 rounded-xl border border-slate-200 px-3.5 py-2.5 text-xs font-black text-slate-600 transition-colors hover:bg-slate-50 disabled:cursor-not-allowed disabled:opacity-40 dark:border-slate-800 dark:text-slate-300 dark:hover:bg-slate-900"
            >
              <ArrowLeft className="h-3.5 w-3.5" />
              Back
            </button>

            <span className="text-[10px] font-bold text-slate-400 sm:hidden">
              {step + 1} / {GUIDE_STEPS.length}
            </span>

            {step < GUIDE_STEPS.length - 1 ? (
              <button
                type="button"
                onClick={() => setStep((current) => Math.min(GUIDE_STEPS.length - 1, current + 1))}
                className="inline-flex items-center gap-1.5 rounded-xl bg-teal-600 px-4 py-2.5 text-xs font-black text-white shadow-sm transition-colors hover:bg-teal-700"
              >
                Next
                <ArrowRight className="h-3.5 w-3.5" />
              </button>
            ) : (
              <button
                type="button"
                onClick={onClose}
                className="inline-flex items-center gap-1.5 rounded-xl bg-teal-600 px-4 py-2.5 text-xs font-black text-white shadow-sm transition-colors hover:bg-teal-700"
              >
                Start Planning
                <ArrowRight className="h-3.5 w-3.5" />
              </button>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}
