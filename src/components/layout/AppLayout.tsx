import React from 'react';
import { NavLink, Outlet, useLocation, Navigate } from "react-router-dom";
import { Home, Activity, Users, User, MessageSquare } from "lucide-react";
import { cn } from "@/src/lib/utils";
import { useAuth } from "@/src/components/auth/AuthProvider";
import { motion } from "framer-motion";

const navItems = [
  { icon: Home, label: "Home", path: "/" },
  { icon: Users, label: "Community", path: "/community" },
  { icon: MessageSquare, label: "Messages", path: "/messages" },
  { icon: User, label: "Profile", path: "/profile" },
];

export default function AppLayout() {
  const location = useLocation();
  const { user } = useAuth();
  
  if (!user) {
    if (location.pathname !== '/') {
      return <Navigate to="/" replace />;
    }
    return <Outlet />;
  }

  const firstName = user.displayName === "Athlete" ? (user.email?.split("@")[0] || "User") : (user.displayName?.split(" ")[0] || user.email?.split("@")[0] || "User");
  const avatarUrl = user.photoURL || `https://api.dicebear.com/7.x/avataaars/svg?seed=${firstName}`;

  return (
    <div className="min-h-screen bg-black text-white selection:bg-brand-500/30">
      <div className="flex">
        {/* Desktop Sidebar */}
        <aside className="hidden md:flex flex-col w-64 fixed inset-y-0 border-r border-[#222] bg-[#0a0a0a] z-50">
          <div className="p-6">
            <h1 className="text-2xl font-display font-bold bg-gradient-to-r from-brand-400 to-accent-blue bg-clip-text text-transparent">
              AERO
            </h1>
          </div>
          <nav className="flex-1 px-4 space-y-1 mt-8">
            {navItems.map((item) => (
              <NavLink
                key={item.path}
                to={item.path}
                className={({ isActive }) =>
                  cn(
                    "flex items-center gap-4 px-4 py-3 rounded-xl transition-all duration-300 font-bold text-sm",
                    isActive
                      ? "bg-brand-500 text-black shadow-[0_0_20px_rgba(204,255,0,0.2)]"
                      : "text-gray-500 hover:text-white hover:bg-[#1a1a1a]"
                  )
                }
              >
                <item.icon className="w-5 h-5" />
                {item.label}
              </NavLink>
            ))}
          </nav>
          
          <div className="p-4 mt-auto">
            <div className="bg-[#111] border border-[#222] rounded-2xl p-4 relative overflow-hidden group">
              <div className="absolute inset-0 bg-gradient-to-br from-brand-500/10 to-transparent opacity-0 group-hover:opacity-100 transition-opacity"></div>
              <h3 className="font-display font-semibold mb-1">Aero Pro</h3>
              <p className="text-xs text-gray-400 mb-3">Unlock AI coaching & analytics</p>
              <button className="w-full bg-white text-black text-sm font-semibold py-2 rounded-lg hover:bg-gray-200 transition-colors">
                Upgrade
              </button>
            </div>
          </div>
        </aside>

        {/* Mobile Header */}
        <header className="md:hidden fixed top-0 inset-x-0 h-16 border-b border-[#222] bg-black/80 backdrop-blur-xl z-50 flex items-center justify-between px-4">
          <h1 className="text-xl font-display font-bold bg-gradient-to-r from-brand-400 to-accent-blue bg-clip-text text-transparent">
            AERO
          </h1>
          <div className="w-8 h-8 rounded-full bg-[#222] border border-[#333] overflow-hidden">
            <img src={avatarUrl} alt="Avatar" className="w-full h-full object-cover" />
          </div>
        </header>

        {/* Main Content Area */}
        <main className="flex-1 md:ml-64 relative pb-20 md:pb-0 min-h-screen">
          <Outlet />
        </main>

        {/* Mobile Bottom Nav */}
        <nav className="md:hidden fixed bottom-0 inset-x-0 h-20 bg-black/90 backdrop-blur-xl border-t border-[#222] z-50">
          <div className="flex h-full items-center justify-around px-2 relative px-4">
            {navItems.map((item) => {
              const isActive = location.pathname === item.path;
              return (
                <NavLink
                  key={item.path}
                  to={item.path}
                  className={cn(
                    "flex flex-col items-center justify-center gap-1 transition-all duration-300",
                    isActive ? "text-brand-500 scale-110" : "text-gray-500 hover:text-gray-300"
                  )}
                >
                  <item.icon className="w-6 h-6" strokeWidth={isActive ? 2.5 : 2} />
                  <span className="text-[10px] font-bold uppercase tracking-widest">{item.label}</span>
                </NavLink>
              );
            })}
          </div>
        </nav>
      </div>
    </div>
  );
}
