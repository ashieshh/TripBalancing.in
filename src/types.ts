export type TravelStyle = 'Budget' | 'Luxury' | 'Family' | 'Solo' | 'Adventure';

export interface TripInput {
  destination: string;
  origin?: string;
  startDate: string;
  endDate: string;
  budgetAmount: string;
  plannedBudget?: string;
  realisticEstimatedCost?: string;
  expectedRange?: string;
  averageDailyBudget?: string;
  budgetWarning?: string;
  includeFlights?: boolean;
  travelers: number;
  travelStyle: TravelStyle;
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
}

export interface DayItinerary {
  dayNumber: number;
  theme: string;
  activities: Activity[];
  photos?: string[];
  foodRecommendations?: string[];
  transportationSuggestions?: string[];
  dailyBudget?: string;
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
  visaAndInsurance?: string;
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
  created_at?: string;
  updated_at?: string;
}

export interface Itinerary {
  destination: string;
  origin?: string;
  originToDestinationDuration?: string;
  startDate: string;
  endDate: string;
  budgetAmount: string;
  plannedBudget?: string;
  realisticEstimatedCost?: string;
  expectedRange?: string;
  averageDailyBudget?: string;
  budgetWarning?: string;
  includeFlights?: boolean;
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
