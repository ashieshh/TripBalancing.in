import { Suspense, type ReactNode } from "react";
import { Coins, Globe2, MapPin, ShieldCheck, TrendingUp, Users } from "lucide-react";
import { Cell, Legend, Pie, PieChart, ResponsiveContainer, Tooltip } from "recharts";
import { TripRecord } from "../types";
import WorldMap from "./WorldMap";

interface CategoryItem {
  name: string;
  value: number;
}

interface DashboardOverviewProps {
  trips: TripRecord[];
  onSelectTrip: (trip: TripRecord, isReadOnly?: boolean) => void;
  totalTrips: number;
  uniqueDestinations: number;
  totalTravelers: number;
  plan: "free" | "pay_per_trip" | "yearly" | "lifetime";
  freeTripsUsed: number;
  paidTripsBalance: number;
  onUpgradeClick?: () => void;
  categoryData: CategoryItem[];
}

const CHART_COLORS = [
  "#0d9488", "#6366f1", "#f59e0b", "#3b82f6",
  "#ec4899", "#10b981", "#8b5cf6", "#f43f5e",
];

function formatAmount(value: number): string {
  return new Intl.NumberFormat("en-IN", {
    style: "currency",
    currency: "INR",
    maximumFractionDigits: 0,
  }).format(value);
}

export default function DashboardOverview({
  trips,
  onSelectTrip,
  totalTrips,
  uniqueDestinations,
  totalTravelers,
  plan,
  freeTripsUsed,
  paidTripsBalance,
  onUpgradeClick,
  categoryData,
}: DashboardOverviewProps) {
  const totalPlanned = categoryData.reduce((sum, item) => sum + item.value, 0);

  return (
    <div className="space-y-6">
      <div className="grid grid-cols-2 xl:grid-cols-4 gap-4">
        <StatCard icon={<Globe2 className="w-5 h-5" />} label="Total Adventures" value={`${totalTrips} Trips`} tone="teal" />
        <StatCard icon={<MapPin className="w-5 h-5" />} label="Places Explored" value={`${uniqueDestinations} Cities`} tone="purple" />
        <StatCard icon={<Users className="w-5 h-5" />} label="Travel Companions" value={`${totalTravelers} People`} tone="amber" />
        <div className="relative p-5 bg-gradient-to-br from-blue-500/5 to-cyan-500/5 dark:from-blue-950/20 dark:to-cyan-950/20 border border-blue-100/40 dark:border-blue-900/30 rounded-2xl min-h-[118px] flex items-center gap-4">
          <div className="p-2.5 bg-blue-500/10 dark:bg-blue-500/20 rounded-xl text-blue-600 dark:text-blue-400">
            <ShieldCheck className="w-5 h-5" />
          </div>
          <div className="min-w-0">
            <span className="text-[10px] font-bold text-slate-500 dark:text-slate-400 uppercase tracking-wider block">Plan Status</span>
            <span className="text-sm font-black text-slate-850 dark:text-slate-100 block capitalize truncate mt-1">
              {plan === "free" ? "Free Plan" : plan === "pay_per_trip" ? "Pay Per Trip" : plan === "yearly" ? "Yearly Premium" : "Lifetime Premium"}
            </span>
            <span className="text-[10px] text-slate-500 dark:text-slate-400 font-bold block mt-0.5 truncate">
              {plan === "free" ? `${Math.max(0, 2 - freeTripsUsed)} / 2 Free Left` : plan === "pay_per_trip" ? `${paidTripsBalance} Paid Balance` : "Unlimited AI Plans"}
            </span>
          </div>
          {onUpgradeClick && (
            <button onClick={onUpgradeClick} className="absolute right-4 bottom-3 text-[10px] font-black text-teal-600 dark:text-teal-400 hover:underline cursor-pointer">
              Upgrade
            </button>
          )}
        </div>
      </div>

      <Suspense fallback={<div className="h-[320px] rounded-2xl border border-slate-100 dark:border-slate-900 bg-white dark:bg-slate-950 flex items-center justify-center text-xs text-slate-400">Loading travel map…</div>}>
        <WorldMap trips={trips} onSelectTrip={onSelectTrip} />
      </Suspense>

      <div id="category-budget-distribution" className="bg-white dark:bg-slate-950 border border-slate-150 dark:border-slate-850 rounded-2xl p-5 shadow-sm space-y-5">
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 border-b border-slate-100 dark:border-slate-900 pb-4">
          <div>
            <h3 className="text-base font-extrabold text-slate-800 dark:text-slate-100 flex items-center gap-2">
              <TrendingUp className="w-4.5 h-4.5 text-teal-600 dark:text-teal-400" />
              Budget Distribution
            </h3>
            <p className="text-xs text-slate-500 dark:text-slate-400 mt-1">Your planned travel spending by trip category.</p>
          </div>
          <div className="bg-slate-50 dark:bg-slate-900/40 border border-slate-100 dark:border-slate-900 px-4 py-2.5 rounded-xl">
            <span className="text-[10px] font-black text-slate-450 dark:text-slate-500 uppercase tracking-wider block">Total Planned</span>
            <span className="text-lg font-black text-teal-600 dark:text-teal-400">{formatAmount(totalPlanned)}</span>
          </div>
        </div>

        {categoryData.length === 0 ? (
          <div className="h-[190px] flex flex-col items-center justify-center text-center gap-2 bg-slate-50/50 dark:bg-slate-900/10 rounded-xl border border-dashed border-slate-200/40 dark:border-slate-800/40 p-6">
            <Coins className="w-7 h-7 text-slate-350 dark:text-slate-650" />
            <p className="text-sm font-bold text-slate-600 dark:text-slate-400">No spending data yet</p>
            <p className="text-xs text-slate-450 dark:text-slate-500">Create or categorize a trip to see the budget overview.</p>
          </div>
        ) : (
          <div className="grid grid-cols-1 lg:grid-cols-[1.1fr_0.9fr] gap-6 items-center">
            <div className="h-[250px] relative">
              <ResponsiveContainer width="100%" height="100%">
                <PieChart>
                  <Pie data={categoryData} cx="50%" cy="46%" innerRadius={62} outerRadius={90} paddingAngle={3} dataKey="value">
                    {categoryData.map((_, index) => <Cell key={index} fill={CHART_COLORS[index % CHART_COLORS.length]} className="stroke-white dark:stroke-slate-950 stroke-2" />)}
                  </Pie>
                  <Tooltip formatter={(value: number) => [formatAmount(Number(value)), "Planned Budget"]} contentStyle={{ backgroundColor: "rgba(15,23,42,.96)", borderRadius: 12, border: "1px solid rgba(255,255,255,.1)", color: "#fff", fontSize: 12 }} />
                  <Legend verticalAlign="bottom" height={28} iconType="circle" iconSize={7} formatter={(value: string) => <span className="text-xs font-bold text-slate-600 dark:text-slate-400">{value}</span>} />
                </PieChart>
              </ResponsiveContainer>
              <div className="absolute inset-0 flex flex-col items-center justify-center pointer-events-none pb-8">
                <span className="text-[10px] font-extrabold uppercase tracking-widest text-slate-400">Categories</span>
                <span className="text-2xl font-black text-slate-800 dark:text-slate-100">{categoryData.length}</span>
              </div>
            </div>
            <div className="space-y-3 bg-slate-50/60 dark:bg-slate-900/20 p-4 rounded-xl border border-slate-100 dark:border-slate-900 max-h-[250px] overflow-y-auto">
              {categoryData.map((item, index) => {
                const percent = totalPlanned > 0 ? (item.value / totalPlanned) * 100 : 0;
                const color = CHART_COLORS[index % CHART_COLORS.length];
                return (
                  <div key={item.name} className="space-y-1.5">
                    <div className="flex items-center justify-between gap-3 text-xs font-bold">
                      <div className="flex items-center gap-2 min-w-0"><span className="w-2.5 h-2.5 rounded-full shrink-0" style={{ backgroundColor: color }} /><span className="truncate text-slate-700 dark:text-slate-300">{item.name}</span></div>
                      <span className="shrink-0 text-slate-800 dark:text-slate-200">{formatAmount(item.value)} · {percent.toFixed(0)}%</span>
                    </div>
                    <div className="h-1.5 bg-slate-200/60 dark:bg-slate-850 rounded-full overflow-hidden"><div className="h-full rounded-full" style={{ width: `${percent}%`, backgroundColor: color }} /></div>
                  </div>
                );
              })}
            </div>
          </div>
        )}
      </div>
    </div>
  );
}

function StatCard({ icon, label, value, tone }: { icon: ReactNode; label: string; value: string; tone: "teal" | "purple" | "amber" }) {
  const styles = {
    teal: "from-teal-500/5 to-emerald-500/5 border-teal-100/40 dark:from-teal-950/20 dark:to-emerald-950/20 dark:border-teal-900/30 text-teal-600 dark:text-teal-400 bg-teal-500/10 dark:bg-teal-500/20",
    purple: "from-purple-500/5 to-indigo-500/5 border-purple-100/40 dark:from-purple-950/20 dark:to-indigo-950/20 dark:border-purple-900/30 text-purple-600 dark:text-purple-400 bg-purple-500/10 dark:bg-purple-500/20",
    amber: "from-amber-500/5 to-orange-500/5 border-amber-100/40 dark:from-amber-950/20 dark:to-orange-950/20 dark:border-amber-900/30 text-amber-600 dark:text-amber-400 bg-amber-500/10 dark:bg-amber-500/20",
  }[tone];
  return <div className={`p-5 bg-gradient-to-br border rounded-2xl min-h-[118px] flex items-center gap-4 ${styles}`}><div className="p-2.5 rounded-xl">{icon}</div><div><span className="text-[10px] font-bold text-slate-500 dark:text-slate-400 uppercase tracking-wider block">{label}</span><span className="text-lg font-extrabold text-slate-800 dark:text-slate-100 mt-1 block">{value}</span></div></div>;
}
