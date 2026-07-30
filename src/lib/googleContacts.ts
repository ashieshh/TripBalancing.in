import { initializeApp, getApps, getApp } from "firebase/app";
import { getAuth, signInWithPopup, GoogleAuthProvider, onAuthStateChanged, User, signOut } from "firebase/auth";
import firebaseConfig from "../../firebase-applet-config.json";

export interface GoogleContact {
  id: string;
  name: string;
  email: string;
  phone?: string;
  photoUrl?: string;
}

// Initialize Firebase App if not already initialized
const firebaseApp = getApps().length > 0 ? getApp() : initializeApp(firebaseConfig);
export const auth = getAuth(firebaseApp);

const provider = new GoogleAuthProvider();
// Add required Google Contacts / People API scopes
provider.addScope("https://www.googleapis.com/auth/contacts.readonly");
provider.addScope("https://www.googleapis.com/auth/contacts.other.readonly");
provider.addScope("https://www.googleapis.com/auth/user.emails.read");
provider.addScope("https://www.googleapis.com/auth/user.phonenumbers.read");

let cachedAccessToken: string | null = null;
let isSigningIn = false;

/**
 * Initializes Firebase auth listener and caches token in memory
 */
export const initGoogleAuth = (
  onSuccess?: (user: User, token: string) => void,
  onFailure?: () => void
) => {
  return onAuthStateChanged(auth, async (user) => {
    if (user && cachedAccessToken) {
      if (onSuccess) onSuccess(user, cachedAccessToken);
    } else {
      if (onFailure) onFailure();
    }
  });
};

/**
 * Trigger Google Sign In popup to request Contacts scope and retrieve Access Token
 */
export const signInWithGoogleContacts = async (): Promise<{ user: User; accessToken: string; contacts: GoogleContact[] }> => {
  try {
    isSigningIn = true;
    const result = await signInWithPopup(auth, provider);
    const credential = GoogleAuthProvider.credentialFromResult(result);
    
    if (!credential?.accessToken) {
      throw new Error("Failed to obtain OAuth access token for Google Contacts from authentication provider.");
    }

    cachedAccessToken = credential.accessToken;
    
    // Immediately fetch contacts for convenience
    const contacts = await fetchGoogleContacts(cachedAccessToken);

    return {
      user: result.user,
      accessToken: cachedAccessToken,
      contacts
    };
  } catch (error: any) {
    console.error("Error signing in with Google Contacts:", error?.message || "Authentication failed");
    throw error;
  } finally {
    isSigningIn = false;
  }
};

/**
 * Fetch contacts list using Google People API
 */
export const fetchGoogleContacts = async (token?: string): Promise<GoogleContact[]> => {
  const accessToken = token || cachedAccessToken;
  if (!accessToken) {
    throw new Error("No Google access token available. Please sign in with Google Contacts first.");
  }

  const contactsList: GoogleContact[] = [];

  try {
    // 1. Fetch Primary Connections
    const res = await fetch(
      "https://people.googleapis.com/v1/people/me/connections?pageSize=100&personFields=names,emailAddresses,phoneNumbers,photos",
      {
        headers: {
          Authorization: `Bearer ${accessToken}`,
          Accept: "application/json"
        }
      }
    );

    if (res.ok) {
      const data = await res.json();
      if (data.connections && Array.isArray(data.connections)) {
        data.connections.forEach((person: any) => {
          const name = person.names?.[0]?.displayName || person.names?.[0]?.givenName || "Unnamed Contact";
          const email = person.emailAddresses?.[0]?.value;
          const phone = person.phoneNumbers?.[0]?.value;
          const photoUrl = person.photos?.[0]?.url;

          if (email || phone) {
            contactsList.push({
              id: person.resourceName || Math.random().toString(36).substring(2, 9),
              name,
              email: email || "",
              phone,
              photoUrl
            });
          }
        });
      }
    } else {
      console.warn("Primary connections API returned non-OK status:", res.status);
    }

    // 2. Fallback / supplementary search on otherContacts if primary list is short
    if (contactsList.length < 10) {
      try {
        const otherRes = await fetch(
          "https://people.googleapis.com/v1/otherContacts?pageSize=50&readMask=names,emailAddresses,phoneNumbers,photos",
          {
            headers: {
              Authorization: `Bearer ${accessToken}`,
              Accept: "application/json"
            }
          }
        );

        if (otherRes.ok) {
          const otherData = await otherRes.json();
          if (otherData.otherContacts && Array.isArray(otherData.otherContacts)) {
            otherData.otherContacts.forEach((person: any) => {
              const name = person.names?.[0]?.displayName || person.emailAddresses?.[0]?.value?.split("@")[0] || "Other Contact";
              const email = person.emailAddresses?.[0]?.value;
              const phone = person.phoneNumbers?.[0]?.value;
              const photoUrl = person.photos?.[0]?.url;

              if ((email || phone) && !contactsList.some(c => c.email === email && email !== "")) {
                contactsList.push({
                  id: person.resourceName || Math.random().toString(36).substring(2, 9),
                  name,
                  email: email || "",
                  phone,
                  photoUrl
                });
              }
            });
          }
        }
      } catch (e) {
        console.warn("Could not fetch otherContacts:", e);
      }
    }
  } catch (err: any) {
    console.error("Failed to fetch contacts from Google People API:", err?.message || "Failed to fetch contacts");
    throw new Error("Failed to load Google Contacts. Please ensure permissions are granted.");
  }

  return contactsList;
};

/**
 * Get current cached access token
 */
export const getGoogleAccessToken = () => cachedAccessToken;

/**
 * Disconnect Google Contacts / Auth
 */
export const disconnectGoogleAuth = async () => {
  cachedAccessToken = null;
  await signOut(auth);
};
