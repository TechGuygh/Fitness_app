import React, { createContext, useContext, useEffect, useState } from "react";
import { User, onAuthStateChanged, signInWithPopup, GoogleAuthProvider, signOut, signInWithEmailAndPassword, createUserWithEmailAndPassword, updateProfile } from "firebase/auth";
import { auth, db } from "@/src/lib/firebase";
import { doc, getDocFromServer, setDoc, getDoc, serverTimestamp } from "firebase/firestore";

interface AuthContextType {
  user: User | null;
  loading: boolean;
  signIn: () => Promise<void>;
  signInWithEmail: (email: string, password: string) => Promise<void>;
  signUpWithEmail: (email: string, password: string) => Promise<void>;
  logOut: () => Promise<void>;
}

const AuthContext = createContext<AuthContextType>({
  user: null,
  loading: true,
  signIn: async () => {},
  signInWithEmail: async () => {},
  signUpWithEmail: async () => {},
  logOut: async () => {},
});

export function AuthProvider({ children }: { children: React.ReactNode }) {
  const [user, setUser] = useState<User | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    async function testConnection() {
      try {
        await getDocFromServer(doc(db, 'test', 'connection'));
      } catch (error) {
        if(error instanceof Error && error.message.includes('the client is offline')) {
          console.error("Please check your Firebase configuration.");
        }
      }
    }
    testConnection();

    const unsubscribe = onAuthStateChanged(auth, async (currentUser) => {
      if (currentUser) {
        try {
          // Check if user exists in Firestore
          const userRef = doc(db, 'users', currentUser.uid);
          const userSnap = await getDoc(userRef);
          if (!userSnap.exists()) {
            await setDoc(userRef, {
              displayName: currentUser.displayName || currentUser.email?.split('@')[0] || 'Athlete',
              photoURL: currentUser.photoURL || '',
              joinedAt: serverTimestamp(),
              level: 1,
              totalKm: 0,
              activeHours: 0,
              calories: 0,
            });
          } else {
            // Fix existing users who got 'Athlete' saved in DB due to race condition during sign up
            const userData = userSnap.data();
            const realName = currentUser.displayName || currentUser.email?.split('@')[0];
            if (userData.displayName === 'Athlete' && realName && realName !== 'Athlete') {
              await setDoc(userRef, { displayName: realName }, { merge: true });
            }
          }
        } catch (error) {
          console.error("Error creating user profile in Firestore", error);
        }
      }
      setUser(currentUser);
      setLoading(false);
    });

    return unsubscribe;
  }, []);

  const signIn = async () => {
    const provider = new GoogleAuthProvider();
    provider.setCustomParameters({
      prompt: 'select_account'
    });
    try {
      await signInWithPopup(auth, provider);
    } catch (error) {
      console.error("SignIn error", error);
      throw error;
    }
  };

  const signInWithEmail = async (email: string, password: string) => {
    try {
      await signInWithEmailAndPassword(auth, email, password);
    } catch (error) {
      console.error("Email SignIn error", error);
      throw error;
    }
  };

  const signUpWithEmail = async (email: string, password: string) => {
    try {
      const userCredential = await createUserWithEmailAndPassword(auth, email, password);
      const newDisplayName = email.split('@')[0];
      await updateProfile(userCredential.user, {
        displayName: newDisplayName,
      });
      // Update the user document since onAuthStateChanged might have saved 'Athlete' before updateProfile completed
      const userRef = doc(db, 'users', userCredential.user.uid);
      await setDoc(userRef, { displayName: newDisplayName }, { merge: true });
    } catch (error) {
      console.error("Email SignUp error", error);
      throw error;
    }
  };

  const logOut = async () => {
    await signOut(auth);
  };

  return (
    <AuthContext.Provider value={{ user, loading, signIn, signInWithEmail, signUpWithEmail, logOut }}>
      {loading ? (
        <div className="min-h-screen bg-black flex items-center justify-center">
          <div className="w-8 h-8 rounded-full border-t-2 border-brand-500 animate-spin"></div>
        </div>
      ) : (
        children
      )}
    </AuthContext.Provider>
  );
}

export const useAuth = () => useContext(AuthContext);
