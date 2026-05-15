import React, { useState } from "react";
import { motion, AnimatePresence } from "framer-motion";
import { useAuth } from "@/src/components/auth/AuthProvider";
import { Activity, Mail, Lock, LogIn, ArrowRight } from "lucide-react";

export default function Auth() {
  const { signIn, signInWithEmail, signUpWithEmail } = useAuth();
  const [isSignUp, setIsSignUp] = useState(false);
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [errorMsg, setErrorMsg] = useState("");
  const [loading, setLoading] = useState(false);

  const handleEmailSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!email || !password) {
      setErrorMsg("Please enter email and password");
      return;
    }

    setLoading(true);
    setErrorMsg("");

    try {
      if (isSignUp) {
        await signUpWithEmail(email, password);
      } else {
        await signInWithEmail(email, password);
      }
    } catch (error: any) {
      if (error?.code === 'auth/email-already-in-use') {
        setErrorMsg('Email is already in use. Please sign in instead.');
      } else if (error?.code === 'auth/wrong-password' || error?.code === 'auth/user-not-found' || error?.code === 'auth/invalid-credential') {
        setErrorMsg('Invalid email or password.');
      } else if (error?.code === 'auth/weak-password') {
        setErrorMsg('Password should be at least 6 characters.');
      } else if (error?.code === 'auth/operation-not-allowed') {
        setErrorMsg('Email/Password login is not enabled. Please enable it in your Firebase Console under Authentication -> Sign-in method.');
      } else if (error?.code === 'auth/network-request-failed') {
        setErrorMsg('Network error. Please check your internet connection and try again.');
      } else {
        let msg = error?.message || 'An error occurred during authentication.';
        msg = msg.replace(/^Firebase:\s*(Error\s*)?/, '').replace(/\s*\(auth\/[a-z0-9\-]+\)\.?$/, '');
        setErrorMsg(msg || 'An error occurred during authentication.');
      }
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="min-h-screen bg-black text-white flex">
      {/* Left Pane - Visuals (hidden on small screens) */}
      <div className="hidden lg:flex w-1/2 relative bg-[#0a0a0a] overflow-hidden items-center justify-center">
        {/* Background Gradients & Effects */}
        <div className="absolute inset-0 z-0">
          <div className="absolute top-1/4 left-1/4 w-96 h-96 bg-brand-500/20 rounded-full blur-[120px]"></div>
          <div className="absolute bottom-1/4 right-1/4 w-96 h-96 bg-accent-blue/10 rounded-full blur-[120px]"></div>
        </div>

        {/* Mock App Interface / Artistic Element */}
        <div className="relative z-10 w-full max-w-lg p-12 flex flex-col justify-center">
          <motion.div
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.8 }}
          >
            <div className="w-16 h-16 bg-brand-500 rounded-2xl flex items-center justify-center -rotate-6 mb-8 shadow-[0_0_40px_rgba(34,197,94,0.3)]">
              <Activity className="w-8 h-8 text-black" />
            </div>
            <h1 className="text-5xl font-display font-bold leading-tight mb-6">
              Redefine your <br />
              <span className="bg-gradient-to-r from-brand-400 to-accent-blue bg-clip-text text-transparent">
                athletic potential.
              </span>
            </h1>
            <p className="text-gray-400 text-lg leading-relaxed max-w-md">
              Join the elite community of runners and cyclists. Track your progress, compete globally, and unlock AI-driven insights to push past your limits.
            </p>

            <div className="mt-12 flex items-center gap-6">
              <div className="flex -space-x-4">
                {[1, 2, 3, 4].map((i) => (
                  <div key={i} className={`w-12 h-12 rounded-full border-2 border-black bg-[#222] z-${10-i} overflow-hidden`}>
                     <img src={`https://api.dicebear.com/7.x/avataaars/svg?seed=Athlete${i}`} alt="User" className="w-full h-full object-cover" />
                  </div>
                ))}
              </div>
              <div>
                <p className="text-white font-bold font-display text-xl">10k+</p>
                <p className="text-xs text-gray-500 uppercase tracking-widest font-semibold">Active Athletes</p>
              </div>
            </div>
          </motion.div>
        </div>
        
        {/* Abstract dark overlay pattern */}
        <div className="absolute inset-0 bg-[url('https://www.transparenttextures.com/patterns/carbon-fibre.png')] opacity-10 mix-blend-overlay z-20 pointer-events-none"></div>
      </div>

      {/* Right Pane - Auth Form */}
      <div className="w-full lg:w-1/2 flex items-center justify-center p-8 relative z-30">
        <div className="w-full max-w-md space-y-8">
          <div className="text-center lg:text-left mb-10 lg:mb-12">
            <div className="lg:hidden w-12 h-12 bg-brand-500 rounded-xl mx-auto flex items-center justify-center -rotate-6 mb-6">
              <Activity className="w-6 h-6 text-black" />
            </div>
            <h2 className="text-3xl font-display font-bold">
              {isSignUp ? "Create an account" : "Welcome back"}
            </h2>
            <p className="text-gray-400 mt-2 font-medium">
              {isSignUp 
                ? "Start your journey towards better performance." 
                : "Enter your details to access your dashboard."}
            </p>
          </div>

          <div className="bg-[#111] border border-[#222] rounded-3xl p-6 md:p-8 space-y-6 shadow-2xl relative overflow-hidden">
             
            {/* Form */}
            <form onSubmit={handleEmailSubmit} className="space-y-4">
              <div className="space-y-1">
                <label className="text-xs text-gray-500 uppercase tracking-wider font-semibold ml-1">Email</label>
                <div className="relative">
                  <Mail className="absolute left-3.5 top-1/2 -translate-y-1/2 w-5 h-5 text-gray-500" />
                  <input 
                    type="email" 
                    value={email}
                    onChange={(e) => setEmail(e.target.value)}
                    placeholder="Enter your email" 
                    className="w-full bg-[#161616] border border-[#333] text-white rounded-xl py-3 pl-11 pr-4 focus:outline-none focus:border-brand-500 transition-colors"
                  />
                </div>
              </div>
              <div className="space-y-1">
                <div className="flex justify-between items-center ml-1">
                  <label className="text-xs text-gray-500 uppercase tracking-wider font-semibold">Password</label>
                  {!isSignUp && <a href="#" className="text-xs text-brand-400 hover:text-brand-300 font-medium transition-colors">Forgot?</a>}
                </div>
                <div className="relative">
                  <Lock className="absolute left-3.5 top-1/2 -translate-y-1/2 w-5 h-5 text-gray-500" />
                  <input 
                    type="password" 
                    value={password}
                    onChange={(e) => setPassword(e.target.value)}
                    placeholder="••••••••" 
                    className="w-full bg-[#161616] border border-[#333] text-white rounded-xl py-3 pl-11 pr-4 focus:outline-none focus:border-brand-500 transition-colors"
                  />
                </div>
              </div>

              {errorMsg && (
                <motion.div initial={{ opacity: 0, height: 0 }} animate={{ opacity: 1, height: 'auto' }} className="text-xs text-accent-orange font-medium bg-accent-orange/10 p-3 rounded-lg border border-accent-orange/20">
                  {errorMsg}
                </motion.div>
              )}

              <button 
                type="submit" 
                disabled={loading}
                className="w-full bg-white text-black font-bold py-3.5 rounded-xl hover:bg-gray-200 active:scale-[0.98] transition-all flex items-center justify-center gap-2 mt-2 disabled:opacity-50 disabled:cursor-not-allowed"
              >
                {loading ? (
                  <div className="w-5 h-5 rounded-full border-2 border-black border-t-transparent animate-spin"></div>
                ) : (
                  <>{isSignUp ? "Sign Up" : "Sign In"} <ArrowRight className="w-4 h-4" /></>
                )}
              </button>
            </form>

            <div className="relative flex items-center py-2">
              <div className="flex-grow border-t border-[#333]"></div>
              <span className="flex-shrink-0 mx-4 text-xs text-gray-500 font-medium uppercase tracking-widest">Or continue with</span>
              <div className="flex-grow border-t border-[#333]"></div>
            </div>

            <button 
              onClick={async () => {
                setErrorMsg("");
                try {
                  await signIn();
                } catch (error: any) {
                  if (error?.code === 'auth/network-request-failed') {
                    setErrorMsg('Network error. Please check your internet connection and try again.');
                  } else if (error?.code !== 'auth/popup-closed-by-user' && error?.code !== 'auth/cancelled-popup-request') {
                    let msg = error?.message || 'An error occurred during authentication.';
                    msg = msg.replace(/^Firebase:\s*(Error\s*)?/, '').replace(/\s*\(auth\/[a-z0-9\-]+\)\.?$/, '');
                    setErrorMsg(msg || 'An error occurred during authentication.');
                  }
                }
              }}
              type="button" 
              className="w-full bg-[#161616] border border-[#333] text-white font-semibold py-3.5 rounded-xl flex items-center justify-center gap-3 hover:bg-[#222] active:scale-[0.98] transition-all"
            >
              <svg className="w-5 h-5" viewBox="0 0 24 24">
                <path d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92c-.26 1.37-1.04 2.53-2.21 3.31v2.77h3.57c2.08-1.92 3.28-4.74 3.28-8.09z" fill="#4285F4"/>
                <path d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.77c-.98.66-2.23 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84C3.99 20.53 7.7 23 12 23z" fill="#34A853"/>
                <path d="M5.84 14.09c-.22-.66-.35-1.36-.35-2.09s.13-1.43.35-2.09V7.07H2.18C1.43 8.55 1 10.22 1 12s.43 3.45 1.18 4.93l2.85-2.22.81-.62z" fill="#FBBC05"/>
                <path d="M12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15C17.45 2.09 14.97 1 12 1 7.7 1 3.99 3.47 2.18 7.07l3.66 2.84c.87-2.6 3.3-4.53 6.16-4.53z" fill="#EA4335"/>
              </svg>
              Google
            </button>
          </div>

          <p className="text-center text-sm text-gray-500 font-medium">
            {isSignUp ? "Already have an account?" : "Don't have an account?"}
            <button 
              onClick={() => {
                setIsSignUp(!isSignUp);
                setErrorMsg("");
              }}
              className="ml-2 text-white hover:text-brand-400 transition-colors font-bold"
            >
              {isSignUp ? "Sign In" : "Sign Up"}
            </button>
          </p>

        </div>
      </div>
    </div>
  );
}
