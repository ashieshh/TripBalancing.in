export type PlanningMode = 'known_destination' | 'help_choose';
export type BudgetMode = 'fixed' | 'recommended';
export type RevisitPreference = 'new_only' | 'allow_revisit' | 'favorites_only';
export type TravelerType = 'Couple' | 'Honeymoon' | 'Family' | 'Friends' | 'Solo' | 'Business' | 'Senior Citizens' | 'Students' | 'Women-only Trip' | 'Group Trip' | 'Parents with Children';

export interface DestinationRecommendation {
  destination: string;
  matchScore: number;
  whyItFits: string;
  estimatedCostRange: string;
  bestFor: string[];
  bestMonths?: string;
}

export type TravelStyle = 'Budget' | 'Smart Luxury' | 'Luxury' | 'Adventure' | 'Backpacker' | 'Food Explorer' | 'Wellness & Spa' | 'Culture & History' | 'Beach Escape' | 'Nature & Wildlife' | 'Shopping' | 'Nightlife';

export interface TripInput {
  planningMode?: PlanningMode;
  destination: string;
  origin?: string;
  startDate: string;
  endDate: string;
  /** Exact inclusive trip duration selected by the user. */
  tripDays?: number;
  budgetAmount: string;
  plannedBudget?: string;
  realisticEstimatedCost?: string;
  budgetShortfall?: string;
  expectedRange?: string;
  averageDailyBudget?: string;
  budgetWarning?: string;
  travelers: number;
  travelerType?: TravelerType;
  travelStyle: TravelStyle;
  budgetMode?: BudgetMode;
  tripPurpose?: string;
  preferredWeather?: string;
  interests?: string[];
  visitedDestinations?: string[];
  revisitPreference?: RevisitPreference;
  isAiBudgetPlanner?: boolean;
}

export interface Activity {
  time: string;
  title: string;
  description: string;
  location?: string;
  cost?: string;
  latitude?: number;
  longitude?: number;
  visitDuration?: string;
  transportFromPrevious?: string;
  travelTimeFromPrevious?: string;
  distanceFromPreviousKm?: number;
}

export interface DayItinerary {
  dayNumber: number;
  theme: string;
  activities: Activity[];
  photos?: string[];
  foodRecommendations?: string[];
  transportationSuggestions?: string[];
  dailyBudget?: string;
  estimatedTotalSpend?: string;
  activitySubtotal?: string;
  dailyCostBreakdown?: {
    accommodation: string;
    food: string;
    localTransport: string;
    activities: string;
    miscellaneous: string;
  };
}

export interface BudgetBreakdown {
  accommodation: string;
  food: string;
  activities: string;
  transport: string;
  miscellaneous: string;
  originToDestinationTravel?: string;
  visaAndInsurance?: string;
  total: string;
}

export interface PlaceToVisit {
  name: string;
  description: string;
  bestTimeToVisit: string;
  entryFee: string;
}

export interface HotelRecommend {
  name: string;
  pricePerNight: string;
  rating: number;
  distanceFromCenter: string;
  bookingLink: string;
  description?: string;
}

export interface DetailedTransportationCosts {
  taxiStart: string;
  taxiPerKm: string;
  autoRickshaw?: string;
  busFare: string;
  metroFare?: string;
  trainFare?: string;
  scooterRental: string;
  carRental: string;
  airportTransfer: string;
}

export interface FoodBudgetDaily {
  budget: string;
  midRange: string;
  luxury: string;
}

export interface AttractionCostItem {
  name: string;
  fee: string;
}

export interface DetailedBudgetSummary {
  accommodationTotal: string;
  foodTotal: string;
  localTransportTotal: string;
  attractionTotal: string;
  miscellaneousExpenses: string;
  originToDestinationCost?: string;
  grandTotal: string;
}

export interface FoodItem {
  name: string;
  description: string;
  type: 'veg' | 'non-veg' | 'both' | 'dessert' | 'beverage';
  mustTryAt: string;
}

export interface TransportSuggestion {
  type: string;
  description: string;
  estimatedCost: string;
}

export interface UserProfile {
  id: string;
  email?: string;
  plan: 'free' | 'pay_per_trip' | 'yearly' | 'lifetime';
  is_premium?: boolean;
  free_trips_used: number;
  paid_trips_balance: number;
  global_packing_checked?: Record<string, boolean>;
  country_code?: string | null;
  pricing_region?: 'IN' | 'INTL' | null;
  created_at?: string;
  updated_at?: string;
}

export interface Itinerary {
  destination: string;
  origin?: string;
  originToDestinationDuration?: string;
  startDate: string;
  endDate: string;
  /** Exact inclusive trip duration selected by the user. */
  tripDays?: number;
  budgetAmount: string;
  travelers: number;
  travelStyle: string;
  days: DayItinerary[];
  estimatedBudgetBreakdown: BudgetBreakdown;
  placesToVisit: PlaceToVisit[];
  localFood: FoodItem[];
  packingChecklist: string[];
  transportationSuggestions: TransportSuggestion[];
  travelTips: string[];
  latitude?: number;
  longitude?: number;
  originLatitude?: number;
  originLongitude?: number;
  originToDestinationDistanceKm?: number;
  /** Recent cached airfare estimate injected by the backend when available. */
  flightEstimateInr?: number;
  flightEstimatePerTravelerInr?: number;
  flightEstimateSource?: "travelpayouts-aviasales-cache" | "route-model-fallback";
  flightEstimateRoute?: string;
  flightEstimateAirline?: string;
  flightEstimateObservedAt?: string;
  flightEstimateMethod?: "exact-dates" | "month-broad" | "week-nearby" | "grouped-duration" | "latest-period";
  flightEstimateSourceDates?: string;
  flightEstimateDateDistanceDays?: number;
  rating?: number;
  privateNote?: string;
  reviewText?: string;
  loggedExpenses?: LoggedExpense[];
  category?: string;
  hotelRecommendations?: {
    budget: HotelRecommend[];
    midRange: HotelRecommend[];
    luxury: HotelRecommend[];
  };
  detailedTransportationCosts?: DetailedTransportationCosts;
  foodBudgetDaily?: FoodBudgetDaily;
  attractionCosts?: AttractionCostItem[];
  detailedBudgetSummary?: DetailedBudgetSummary;
  isAiBudgetPlanner?: boolean;
  aiBudgetSummary?: string;
  maxDaysComfortable?: number;
  remainingBudget?: string;
  packingChecks?: Record<string, boolean>;
  activityChecks?: Record<string, boolean>;
}

export interface LoggedExpense {
  id: string;
  dayNumber: number;
  category: "Accommodation" | "Food" | "Activities" | "Transport" | "Other";
  amount: number;
  description: string;
}

export interface TripRecord {
  id: string;
  userId: string;
  createdAt: string;
  destination: string;
  origin?: string;
  startDate: string;
  endDate: string;
  /** Exact inclusive trip duration selected by the user. */
  tripDays?: number;
  budgetAmount: string;
  travelers: number;
  travelStyle: TravelStyle;
  itinerary: Itinerary;
  category?: string;
}

export interface BuddyInvitation {
  id: string;
  tripId: string;
  senderEmail: string;
  recipientEmail: string;
  accessType: "read" | "write";
  status: "pending" | "accepted" | "declined";
  createdAt: string;
  tripDetails?: {
    destination: string;
    startDate: string;
    endDate: string;
  };
  fullTrip?: TripRecord;
}
