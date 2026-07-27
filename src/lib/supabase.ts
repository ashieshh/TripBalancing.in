import { createClient } from "@supabase/supabase-js";
import { Itinerary, TripRecord, TravelStyle, BuddyInvitation } from "../types";

const supabaseUrl = (import.meta as any).env.VITE_SUPABASE_URL;
const supabaseAnonKey = (import.meta as any).env.VITE_SUPABASE_ANON_KEY;

export const isRealSupabaseConfigured = !!(supabaseUrl && supabaseAnonKey && supabaseUrl !== "YOUR_SUPABASE_URL");

// Initialize real Supabase client if configured
export const supabase = isRealSupabaseConfigured
  ? createClient(supabaseUrl, supabaseAnonKey)
  : null;

// Mock / LocalStorage Fallback implementation for a flawless out-of-the-box experience
class LocalMockClient {
  private usersKey = "tripbalancing_mock_users";
  private sessionKey = "tripbalancing_mock_session";
  private tripsKey = "tripbalancing_mock_trips";
  private invitationsKey = "tripbalancing_mock_invitations";

  constructor() {
    // Initialize default tables in LocalStorage if not present
    if (!localStorage.getItem(this.usersKey)) {
      localStorage.setItem(this.usersKey, JSON.stringify([]));
    }
    if (!localStorage.getItem(this.tripsKey)) {
      localStorage.setItem(this.tripsKey, JSON.stringify([]));
    }
    if (!localStorage.getItem(this.invitationsKey)) {
      localStorage.setItem(this.invitationsKey, JSON.stringify([]));
    }
  }

  getUsers(): any[] {
    return JSON.parse(localStorage.getItem(this.usersKey) || "[]");
  }

  saveUsers(users: any[]) {
    localStorage.setItem(this.usersKey, JSON.stringify(users));
  }

  getTripsLocal(): TripRecord[] {
    return JSON.parse(localStorage.getItem(this.tripsKey) || "[]");
  }

  saveTripsLocal(trips: TripRecord[]) {
    localStorage.setItem(this.tripsKey, JSON.stringify(trips));
  }

  getInvitationsLocal(): any[] {
    return JSON.parse(localStorage.getItem(this.invitationsKey) || "[]");
  }

  saveInvitationsLocal(invitations: any[]) {
    localStorage.setItem(this.invitationsKey, JSON.stringify(invitations));
  }

  // AUTH APIS
  async signUp(email: string, password?: string, fullName?: string) {
    const users = this.getUsers();
    if (users.find(u => u.email === email)) {
      return { data: { user: null }, error: { message: "User already exists with this email." } };
    }

    const newUser = {
      id: Math.random().toString(36).substring(2, 11),
      email,
      fullName: fullName || email.split("@")[0],
      createdAt: new Date().toISOString()
    };

    users.push(newUser);
    this.saveUsers(users);

    const session = { user: newUser };
    localStorage.setItem(this.sessionKey, JSON.stringify(session));
    return { data: session, error: null };
  }

  async signIn(email: string, password?: string) {
    const users = this.getUsers();
    let user = users.find(u => u.email === email);

    if (!user) {
      // Auto-create user for testing ease in simulated sandbox
      const result = await this.signUp(email, password, email.split("@")[0]);
      return result;
    }

    const session = { user };
    localStorage.setItem(this.sessionKey, JSON.stringify(session));
    return { data: session, error: null };
  }

  async signOut() {
    localStorage.removeItem(this.sessionKey);
    return { error: null };
  }

  getSession() {
    const sessionStr = localStorage.getItem(this.sessionKey);
    return sessionStr ? JSON.parse(sessionStr) : null;
  }

  // TRIPS CRUD
  async fetchTrips(userId: string): Promise<TripRecord[]> {
    const allTrips = this.getTripsLocal();
    return allTrips.filter(t => t.userId === userId);
  }

  async createTrip(userId: string, destination: string, startDate: string, endDate: string, budgetAmount: string, travelers: number, travelStyle: TravelStyle, itinerary: Itinerary): Promise<TripRecord> {
    const allTrips = this.getTripsLocal();
    const newTrip: TripRecord = {
      id: Math.random().toString(36).substring(2, 11),
      userId,
      createdAt: new Date().toISOString(),
      destination,
      startDate,
      endDate,
      budgetAmount,
      travelers,
      travelStyle,
      itinerary,
      category: itinerary.category
    };

    allTrips.unshift(newTrip);
    this.saveTripsLocal(allTrips);
    return newTrip;
  }

  async deleteTrip(tripId: string): Promise<void> {
    const allTrips = this.getTripsLocal();
    const filtered = allTrips.filter(t => t.id !== tripId);
    this.saveTripsLocal(filtered);
  }

  async updateTrip(tripId: string, itinerary: Itinerary): Promise<void> {
    const allTrips = this.getTripsLocal();
    const idx = allTrips.findIndex(t => t.id === tripId);
    if (idx !== -1) {
      allTrips[idx].itinerary = itinerary;
      allTrips[idx].destination = itinerary.destination;
      allTrips[idx].startDate = itinerary.startDate;
      allTrips[idx].endDate = itinerary.endDate;
      allTrips[idx].budgetAmount = itinerary.budgetAmount;
      allTrips[idx].travelers = itinerary.travelers;
      allTrips[idx].travelStyle = itinerary.travelStyle as TravelStyle;
      allTrips[idx].category = itinerary.category;
      this.saveTripsLocal(allTrips);
    }
  }

  async inviteBuddy(tripId: string, senderEmail: string, recipientEmail: string, accessType: "read" | "write"): Promise<BuddyInvitation> {
    const invitations = this.getInvitationsLocal();
    const trips = this.getTripsLocal();
    const trip = trips.find(t => t.id === tripId);
    
    const newInvitation: BuddyInvitation = {
      id: Math.random().toString(36).substring(2, 11),
      tripId,
      senderEmail,
      recipientEmail,
      accessType,
      status: "pending",
      createdAt: new Date().toISOString(),
      tripDetails: trip ? {
        destination: trip.destination,
        startDate: trip.startDate,
        endDate: trip.endDate
      } : undefined
    };

    invitations.push(newInvitation);
    this.saveInvitationsLocal(invitations);
    return newInvitation;
  }

  async getInvitationsForUser(email: string): Promise<BuddyInvitation[]> {
    const invitations = this.getInvitationsLocal();
    return invitations.filter(inv => inv.recipientEmail.toLowerCase() === email.toLowerCase());
  }

  async getInvitationsForTrip(tripId: string): Promise<BuddyInvitation[]> {
    const invitations = this.getInvitationsLocal();
    return invitations.filter(inv => inv.tripId === tripId);
  }

  async updateInvitationStatus(invitationId: string, status: "accepted" | "declined"): Promise<void> {
    const invitations = this.getInvitationsLocal();
    const idx = invitations.findIndex(inv => inv.id === invitationId);
    if (idx !== -1) {
      invitations[idx].status = status;
      this.saveInvitationsLocal(invitations);
    }
  }

  async getSharedTripsForUser(email: string): Promise<TripRecord[]> {
    const invitations = this.getInvitationsLocal();
    const acceptedTripIds = invitations
      .filter(inv => inv.recipientEmail.toLowerCase() === email.toLowerCase() && inv.status === "accepted")
      .map(inv => inv.tripId);
    
    const allTrips = this.getTripsLocal();
    return allTrips.filter(t => acceptedTripIds.includes(t.id));
  }
}

export const localMock = new LocalMockClient();

// Unified API Wrapper that checks for config and delegates appropriately
export const db = {
  isMock: !isRealSupabaseConfigured,

  async signUp(email: string, password?: string, fullName?: string) {
    if (isRealSupabaseConfigured && supabase) {
      const { data, error } = await supabase.auth.signUp({
        email,
        password: password || "temp123456",
        options: {
          data: {
            full_name: fullName,
          }
        }
      });
      return { data, error };
    } else {
      return localMock.signUp(email, password, fullName);
    }
  },

  async signIn(email: string, password?: string) {
    if (isRealSupabaseConfigured && supabase) {
      const { data, error } = await supabase.auth.signInWithPassword({
        email,
        password: password || "temp123456"
      });
      return { data, error };
    } else {
      return localMock.signIn(email, password);
    }
  },

  async signInWithGoogle() {
    if (isRealSupabaseConfigured && supabase) {
      const { data, error } = await supabase.auth.signInWithOAuth({
        provider: 'google',
      });
      return { data, error };
    } else {
      // In mock mode, log in as a premium demo Google user
      return localMock.signIn("google-traveler@tripbalancing.com");
    }
  },

  async signOut() {
    if (isRealSupabaseConfigured && supabase) {
      const { error } = await supabase.auth.signOut();
      return { error };
    } else {
      return localMock.signOut();
    }
  },

  async getSessionUser() {
    if (isRealSupabaseConfigured && supabase) {
      const { data: { session } } = await supabase.auth.getSession();
      return session?.user || null;
    } else {
      const session = localMock.getSession();
      return session?.user || null;
    }
  },

  async getTrips(userId: string): Promise<TripRecord[]> {
    if (isRealSupabaseConfigured && supabase) {
      const { data, error } = await supabase
        .from('trips')
        .select('*')
        .eq('user_id', userId)
        .order('created_at', { ascending: false });

      if (error) {
        console.warn("Supabase load trips error:", error);
        // Fallback to local trips for smoothness if database table isn't created yet
        return localMock.fetchTrips(userId);
      }
      
      // Map database snake_case fields to camelCase
      return (data || []).map((t: any) => ({
        id: t.id,
        userId: t.user_id,
        createdAt: t.created_at,
        destination: t.destination,
        startDate: t.start_date,
        endDate: t.end_date,
        budgetAmount: t.budget_amount,
        travelers: t.travelers,
        travelStyle: t.travel_style,
        itinerary: t.itinerary,
        category: t.category || t.itinerary?.category
      }));
    } else {
      return localMock.fetchTrips(userId);
    }
  },

  async saveTrip(
    userId: string,
    destination: string,
    startDate: string,
    endDate: string,
    budgetAmount: string,
    travelers: number,
    travelStyle: TravelStyle,
    itinerary: Itinerary
  ): Promise<TripRecord> {
    if (isRealSupabaseConfigured && supabase) {
      const payload = {
        user_id: userId,
        destination,
        start_date: startDate,
        end_date: endDate,
        budget_amount: budgetAmount,
        travelers,
        travel_style: travelStyle,
        itinerary
      };

      const { data, error } = await supabase
        .from('trips')
        .insert([payload])
        .select();

      if (error) {
        console.warn("Supabase insert trip error, saving locally:", error);
        return localMock.createTrip(userId, destination, startDate, endDate, budgetAmount, travelers, travelStyle, itinerary);
      }

      const t = data[0];
      return {
        id: t.id,
        userId: t.user_id,
        createdAt: t.created_at,
        destination: t.destination,
        startDate: t.start_date,
        endDate: t.end_date,
        budgetAmount: t.budget_amount,
        travelers: t.travelers,
        travelStyle: t.travel_style,
        itinerary: t.itinerary,
        category: t.category || t.itinerary?.category
      };
    } else {
      return localMock.createTrip(userId, destination, startDate, endDate, budgetAmount, travelers, travelStyle, itinerary);
    }
  },

  async deleteTrip(tripId: string): Promise<void> {
    if (isRealSupabaseConfigured && supabase) {
      const { error } = await supabase
        .from('trips')
        .delete()
        .eq('id', tripId);
      if (error) {
        console.warn("Supabase delete trip error, running local delete:", error);
        await localMock.deleteTrip(tripId);
      }
    } else {
      await localMock.deleteTrip(tripId);
    }
  },

  async updateTrip(tripId: string, itinerary: Itinerary): Promise<void> {
    if (isRealSupabaseConfigured && supabase) {
      const payload = {
        destination: itinerary.destination,
        start_date: itinerary.startDate,
        end_date: itinerary.endDate,
        budget_amount: itinerary.budgetAmount,
        travelers: itinerary.travelers,
        travel_style: itinerary.travelStyle,
        itinerary
      };

      const { error } = await supabase
        .from('trips')
        .update(payload)
        .eq('id', tripId);
      if (error) {
        console.warn("Supabase update trip error, running local update:", error);
        await localMock.updateTrip(tripId, itinerary);
      }
    } else {
      await localMock.updateTrip(tripId, itinerary);
    }
  },

  async getTrip(tripId: string): Promise<TripRecord | null> {
    if (isRealSupabaseConfigured && supabase) {
      try {
        const { data, error } = await supabase
          .from('trips')
          .select('*')
          .eq('id', tripId)
          .maybeSingle();

        if (error) {
          console.warn("Supabase load single trip error:", error);
          const allTrips = localMock.getTripsLocal();
          return allTrips.find(t => t.id === tripId) || null;
        }
        if (!data) return null;

        return {
          id: data.id,
          userId: data.user_id,
          createdAt: data.created_at,
          destination: data.destination,
          startDate: data.start_date,
          endDate: data.end_date,
          budgetAmount: data.budget_amount,
          travelers: data.travelers,
          travelStyle: data.travel_style,
          itinerary: data.itinerary,
          category: data.category || data.itinerary?.category
        };
      } catch (err) {
        console.warn("Failed to load single trip from Supabase, trying local:", err);
        const allTrips = localMock.getTripsLocal();
        return allTrips.find(t => t.id === tripId) || null;
      }
    } else {
      const allTrips = localMock.getTripsLocal();
      return allTrips.find(t => t.id === tripId) || null;
    }
  },

  async inviteBuddy(tripId: string, senderEmail: string, recipientEmail: string, accessType: "read" | "write"): Promise<BuddyInvitation> {
    if (isRealSupabaseConfigured && supabase) {
      try {
        const payload = {
          trip_id: tripId,
          sender_email: senderEmail,
          recipient_email: recipientEmail,
          access_type: accessType,
          status: "pending"
        };
        const { data, error } = await supabase
          .from('buddy_invitations')
          .insert([payload])
          .select();
        if (error) throw error;
        const inv = data[0];
        return {
          id: inv.id,
          tripId: inv.trip_id,
          senderEmail: inv.sender_email,
          recipientEmail: inv.recipient_email,
          accessType: inv.access_type,
          status: inv.status,
          createdAt: inv.created_at
        };
      } catch (err) {
        console.warn("Supabase buddy_invitations error, using mock:", err);
        return localMock.inviteBuddy(tripId, senderEmail, recipientEmail, accessType);
      }
    } else {
      return localMock.inviteBuddy(tripId, senderEmail, recipientEmail, accessType);
    }
  },

  async getInvitationsForUser(email: string): Promise<BuddyInvitation[]> {
    if (isRealSupabaseConfigured && supabase) {
      try {
        const { data, error } = await supabase
          .from('buddy_invitations')
          .select('*')
          .eq('recipient_email', email);
        if (error) throw error;
        return (data || []).map((inv: any) => ({
          id: inv.id,
          tripId: inv.trip_id,
          senderEmail: inv.sender_email,
          recipientEmail: inv.recipient_email,
          accessType: inv.access_type,
          status: inv.status,
          createdAt: inv.created_at
        }));
      } catch (err) {
        return localMock.getInvitationsForUser(email);
      }
    } else {
      return localMock.getInvitationsForUser(email);
    }
  },

  async getInvitationsForTrip(tripId: string): Promise<BuddyInvitation[]> {
    if (isRealSupabaseConfigured && supabase) {
      try {
        const { data, error } = await supabase
          .from('buddy_invitations')
          .select('*')
          .eq('trip_id', tripId);
        if (error) throw error;
        return (data || []).map((inv: any) => ({
          id: inv.id,
          tripId: inv.trip_id,
          senderEmail: inv.sender_email,
          recipientEmail: inv.recipient_email,
          accessType: inv.access_type,
          status: inv.status,
          createdAt: inv.created_at
        }));
      } catch (err) {
        return localMock.getInvitationsForTrip(tripId);
      }
    } else {
      return localMock.getInvitationsForTrip(tripId);
    }
  },

  async updateInvitationStatus(invitationId: string, status: "accepted" | "declined"): Promise<void> {
    if (isRealSupabaseConfigured && supabase) {
      try {
        const { error } = await supabase
          .from('buddy_invitations')
          .update({ status })
          .eq('id', invitationId);
        if (error) throw error;
      } catch (err) {
        await localMock.updateInvitationStatus(invitationId, status);
      }
    } else {
      await localMock.updateInvitationStatus(invitationId, status);
    }
  },

  async getSharedTripsForUser(email: string): Promise<TripRecord[]> {
    if (isRealSupabaseConfigured && supabase) {
      try {
        const { data: invs, error: invError } = await supabase
          .from('buddy_invitations')
          .select('trip_id')
          .eq('recipient_email', email)
          .eq('status', 'accepted');
        if (invError) throw invError;
        
        const acceptedTripIds = (invs || []).map((i: any) => i.trip_id);
        if (acceptedTripIds.length === 0) return [];

        const { data, error } = await supabase
          .from('trips')
          .select('*')
          .in('id', acceptedTripIds);
        if (error) throw error;

        return (data || []).map((t: any) => ({
          id: t.id,
          userId: t.user_id,
          createdAt: t.created_at,
          destination: t.destination,
          startDate: t.start_date,
          endDate: t.end_date,
          budgetAmount: t.budget_amount,
          travelers: t.travelers,
          travelStyle: t.travel_style,
          itinerary: t.itinerary
        }));
      } catch (err) {
        return localMock.getSharedTripsForUser(email);
      }
    } else {
      return localMock.getSharedTripsForUser(email);
    }
  },

  async resetPasswordForEmail(email: string) {
    if (isRealSupabaseConfigured && supabase) {
      const { data, error } = await supabase.auth.resetPasswordForEmail(email, {
        redirectTo: `${window.location.origin}/`
      });
      return { data, error };
    } else {
      // Mock mode: simulate success instantly
      return { data: { email }, error: null };
    }
  },

  async updateUserPassword(password: string) {
    if (isRealSupabaseConfigured && supabase) {
      const { data, error } = await supabase.auth.updateUser({
        password: password
      });
      return { data, error };
    } else {
      // Mock mode: update password in local storage if we can trace the user
      const searchParams = new URLSearchParams(window.location.search);
      const email = searchParams.get("email");
      if (email) {
        const users = localMock.getUsers();
        const userIdx = users.findIndex(u => u.email.toLowerCase() === email.toLowerCase());
        if (userIdx !== -1) {
          users[userIdx].password = password;
          localMock.saveUsers(users);
        }
      }
      return { data: { success: true }, error: null };
    }
  }
};
