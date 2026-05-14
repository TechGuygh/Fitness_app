import { format, subDays, startOfDay, isAfter } from "date-fns";
import { Play, TrendingUp, Flame, MapPin, ChevronRight, Activity as ActivityIcon, PlusCircle } from "lucide-react";
import { Link, useNavigate } from "react-router-dom";
import { AreaChart, Area, ResponsiveContainer, XAxis, YAxis, Tooltip, BarChart, Bar, LineChart, Line, CartesianGrid } from "recharts";
import { motion, AnimatePresence } from "framer-motion";
import { useAuth } from "@/src/components/auth/AuthProvider";
import { useState, useEffect, useMemo } from "react";
import { collection, query, where, orderBy, getDocs, doc, getDoc, setDoc, updateDoc, onSnapshot } from "firebase/firestore";
import { db } from "@/src/lib/firebase";
import { handleFirestoreError, OperationType } from "@/src/lib/firebase-error";
import { Settings, Target, Zap, Clock, Trophy, Users } from "lucide-react";
import { cn } from "@/src/lib/utils";
import Auth from "./Auth";
import RouteCreatorModal from "@/src/components/RouteCreatorModal";

import { formatDistance } from "@/src/lib/utils";

interface WeeklyGoal {
  type: 'distance' | 'frequency' | 'calories' | 'time';
  target: number;
}

export default function Dashboard() {
  const navigate = useNavigate();
  const { user, logOut } = useAuth();
  const [activities, setActivities] = useState<any[]>([]);
  const [routes, setRoutes] = useState<any[]>([]);
  const [activeUsersByRoute, setActiveUsersByRoute] = useState<Record<string, any[]>>({});
  const [isRouteCreatorOpen, setIsRouteCreatorOpen] = useState(false);
  const [loading, setLoading] = useState(true);
  const [isGoalModalOpen, setIsGoalModalOpen] = useState(false);
  const [savingGoal, setSavingGoal] = useState(false);
  const [expandedId, setExpandedId] = useState<string | null>(null);
  const [weeklyGoal, setWeeklyGoal] = useState<WeeklyGoal>({ type: 'distance', target: 30 });

  useEffect(() => {
    if (user) {
      async function fetchData() {
        try {
          // Fetch Activities
          const q = query(collection(db, "activities"), where("userId", "==", user!.uid), orderBy("createdAt", "desc"));
          const snap = await getDocs(q);
          const acts = snap.docs.map(doc => ({
              id: doc.id,
              ...doc.data(),
              createdAt: doc.data().createdAt?.toDate ? doc.data().createdAt.toDate() : new Date(),
          }));
          setActivities(acts);

          // Fetch Goals
          const goalRef = doc(db, "goals", user.uid);
          const goalSnap = await getDoc(goalRef);
          if (goalSnap.exists()) {
             setWeeklyGoal(goalSnap.data() as WeeklyGoal);
          }
        } catch (error) {
           console.error(error);
        } finally {
           setLoading(false);
        }
      }
      fetchData();

      // Listen to routes
      const qRoutes = query(collection(db, "activities"), where("isRoute", "==", true));
      const unsubscribeRoutes = onSnapshot(qRoutes, async (snap) => {
         const fetchedRoutes = snap.docs.map(doc => ({ id: doc.id, ...doc.data() }));
         setRoutes(fetchedRoutes);

         // Fetch recent activities that use these routeIds to count active/recent users
         const userCounts: Record<string, any[]> = {};
         for (const route of fetchedRoutes) {
            try {
              // Get activities with this routeId from the last 24h
              const oneDayAgo = new Date();
              oneDayAgo.setDate(oneDayAgo.getDate() - 1);
              const qUsers = query(collection(db, "activities"), where("routeId", "==", route.id));
              const uSnap = await getDocs(qUsers);
              
              // Map user IDs
              const uniqueUserIds = new Set<string>();
              if ((route as any).userId) uniqueUserIds.add((route as any).userId);
              uSnap.docs.forEach(doc => {
                 if (doc.data().userId) uniqueUserIds.add(doc.data().userId);
              });
              
              // Fetch user info for each unique user
              const routeUsers: any[] = [];
              for (const uid of Array.from(uniqueUserIds)) {
                try {
                  const userSnap = await getDoc(doc(db, "users", uid));
                  if (userSnap.exists()) {
                     routeUsers.push({ id: uid, ...userSnap.data() });
                  }
                } catch (e) {
                   console.error(e);
                }
              }
              userCounts[route.id] = routeUsers;
            } catch (err) {
              console.error("Error fetching users for route", route.id, err);
            }
         }
         setActiveUsersByRoute(userCounts);
      }, (error) => handleFirestoreError(error, OperationType.LIST, "activities"));

      return () => {
         unsubscribeRoutes();
      };
    }
  }, [user]);

  const updateGoal = async (newGoal: WeeklyGoal) => {
    if (!user) return;
    setSavingGoal(true);
    try {
      await setDoc(doc(db, "goals", user.uid), newGoal);
      setWeeklyGoal(newGoal);
      setIsGoalModalOpen(false);
    } catch (e) {
      console.error(e);
      handleFirestoreError(e, OperationType.WRITE, `goals/${user.uid}`);
    } finally {
      setSavingGoal(false);
    }
  };

  const stats = useMemo(() => {
    const now = new Date();
    const startOfCurrentWeek = subDays(startOfDay(now), 6);

    let weeklyDistance = 0;
    let weeklyTime = 0;
    let weeklyPaceSum = 0;
    let activeDaysCount = 0;
    let calories = 0;
    
    const dailyMap: Record<string, number> = {};
    for (let i = 0; i < 7; i++) {
        const d = subDays(now, 6 - i);
        dailyMap[format(d, "EEE")] = 0;
    }

    const recentActs = activities.filter(a => isAfter(a.createdAt, startOfCurrentWeek));
    const uniqueDays = new Set();
    
    recentActs.forEach(a => {
      weeklyDistance += a.distance || 0;
      weeklyTime += a.timeSeconds || 0;
      calories += Math.floor((a.distance || 0) * 60);
      if (a.pace) {
          weeklyPaceSum += a.pace;
          activeDaysCount++;
      }
      const dayStr = format(a.createdAt, "EEE");
      uniqueDays.add(dayStr);
      if (dailyMap[dayStr] !== undefined) {
          dailyMap[dayStr] += a.distance || 0;
      }
    });

    const chartData = Object.keys(dailyMap).map(day => ({
        day,
        distance: Number(dailyMap[day].toFixed(2))
    }));

    const avgPace = activeDaysCount > 0 ? weeklyPaceSum / activeDaysCount : 0;

    let progress = 0;
    if (weeklyGoal.type === 'distance') progress = (weeklyDistance / weeklyGoal.target) * 100;
    else if (weeklyGoal.type === 'frequency') progress = (uniqueDays.size / weeklyGoal.target) * 100;
    else if (weeklyGoal.type === 'calories') progress = (calories / weeklyGoal.target) * 100;
    else if (weeklyGoal.type === 'time') progress = ((weeklyTime / 60) / weeklyGoal.target) * 100;

    return {
        weeklyDistance,
        weeklyTime,
        frequency: uniqueDays.size,
        avgPace,
        calories,
        chartData,
        progress: Math.min(Math.round(progress), 100)
    };
  }, [activities, weeklyGoal]);

  const pbs = useMemo(() => {
    let longestDistance = { distance: 0, id: "" };
    let fastest1K = { time: Infinity, id: "" };
    let fastest5K = { time: Infinity, id: "" };
    let fastest10K = { time: Infinity, id: "" };

    activities.forEach(a => {
      if (a.distance && a.distance > longestDistance.distance) {
        longestDistance = { distance: a.distance, id: a.id };
      }
      if (a.splits && a.splits.length >= 1) {
         for (let i = 0; i < a.splits.length; i++) {
            if (!a.splits[i].isPartial && a.splits[i].timeSeconds > 0 && a.splits[i].timeSeconds < fastest1K.time) {
                fastest1K = { time: a.splits[i].timeSeconds, id: a.id };
            }
         }
      }
      if (a.splits && a.splits.length >= 5) {
         let best5K = Infinity;
         for (let i = 0; i <= a.splits.length - 5; i++) {
            const sum = a.splits.slice(i, i+5).reduce((acc: number, s: any) => acc + (s.isPartial ? Infinity : s.timeSeconds), 0);
            if (sum < best5K) best5K = sum;
         }
         if (best5K < fastest5K.time) fastest5K = { time: best5K, id: a.id };
      }
      if (a.splits && a.splits.length >= 10) {
         let best10K = Infinity;
         for (let i = 0; i <= a.splits.length - 10; i++) {
            const sum = a.splits.slice(i, i+10).reduce((acc: number, s: any) => acc + (s.isPartial ? Infinity : s.timeSeconds), 0);
            if (sum < best10K) best10K = sum;
         }
         if (best10K < fastest10K.time) fastest10K = { time: best10K, id: a.id };
      }
    });

    return {
       longestDistance: longestDistance.id ? longestDistance : null,
       fastest1K: fastest1K.id ? fastest1K : null,
       fastest5K: fastest5K.id ? fastest5K : null,
       fastest10K: fastest10K.id ? fastest10K : null,
    };
  }, [activities]);

  const formattedActivities = activities.slice(0, 5).map(data => {
    const m = Math.floor(data.timeSeconds / 60);
    const s = Math.floor(data.timeSeconds % 60);
    const pace = data.pace || 0;
    const paceM = Math.floor(pace);
    const paceS = Math.floor((pace % 1) * 60).toString().padStart(2, '0');
    
    const pbList: string[] = [];
    if (pbs.longestDistance?.id === data.id) pbList.push("Longest Distance \uD83C\uDFC6");
    if (pbs.fastest1K?.id === data.id) pbList.push("1K PB \uD83D\uDD25");
    if (pbs.fastest5K?.id === data.id) pbList.push("5K PB \uD83D\uDD25");
    if (pbs.fastest10K?.id === data.id) pbList.push("10K PB \uD83D\uDD25");

    return {
      id: data.id,
      type: data.activityType === 'run' ? 'Running' : 'Cycling',
      distance: formatDistance(data.distance || 0),
      time: `${m.toString().padStart(2,'0')}:${s.toString().padStart(2,'0')}`,
      pace: pace > 0 ? `${paceM}'${paceS}"` : "0'00\"",
      date: format(data.createdAt, "MMM d, yyyy"),
      mapUrl: "https://images.unsplash.com/photo-1472214103451-9374bd1c798e?auto=format&fit=crop&q=80&w=800&h=400",
      pbList,
      raw: data
    };
  });

  if (!user) return <Auth />;

  const firstName = user.displayName === "Athlete" ? (user.email?.split("@")[0] || "User") : (user.displayName?.split(" ")[0] || user.email?.split("@")[0] || "User");
  const avatarUrl = user.photoURL || `https://api.dicebear.com/7.x/avataaars/svg?seed=${firstName}`;

  return (
    <div className="p-4 md:p-8 pt-20 md:pt-8 min-h-screen max-w-5xl mx-auto space-y-8">
      <AnimatePresence>
        {isGoalModalOpen && (
          <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }} className="fixed inset-0 z-[1000] bg-black/80 backdrop-blur-md flex items-center justify-center p-4">
             <motion.div initial={{ scale: 0.9, y: 20 }} animate={{ scale: 1, y: 0 }} className="bg-[#111] border border-[#222] p-8 rounded-[40px] w-full max-w-md shadow-2xl relative">
                <button onClick={() => setIsGoalModalOpen(false)} className="absolute top-6 right-6 text-gray-500 hover:text-white">
                  <ChevronRight className="w-6 h-6 rotate-90" />
                </button>
                <h3 className="text-2xl font-display font-bold text-white mb-2">Set Weekly Goal</h3>
                <p className="text-gray-400 text-sm mb-8">What do you want to achieve this week?</p>
                
                <div className="space-y-4 mb-8">
                   {[
                     { id: 'distance', label: 'Distance', icon: Target, unit: 'km', color: 'text-brand-500' },
                     { id: 'frequency', label: 'Workouts', icon: ActivityIcon, unit: 'sessions', color: 'text-accent-blue' },
                     { id: 'calories', label: 'Burn', icon: Flame, unit: 'kcal', color: 'text-accent-orange' },
                     { id: 'time', label: 'Duration', icon: Clock, unit: 'mins', color: 'text-purple-500' }
                   ].map(g => (
                     <button 
                       key={g.id} 
                       onClick={() => setWeeklyGoal(prev => ({ ...prev, type: g.id as any }))}
                       className={cn("w-full flex items-center justify-between p-4 rounded-2xl border transition-all", weeklyGoal.type === g.id ? "bg-brand-500/10 border-brand-500/50" : "bg-[#161616] border-[#222] hover:border-[#333]")}
                     >
                       <div className="flex items-center gap-3">
                         <div className={cn("p-2 rounded-xl bg-black/50", g.color)}>
                           <g.icon className="w-5 h-5" />
                         </div>
                         <span className="font-bold text-white">{g.label}</span>
                       </div>
                       <div className="flex items-center gap-2">
                         <input 
                           type="number" 
                           value={weeklyGoal.type === g.id ? weeklyGoal.target : ""}
                           onChange={(e) => setWeeklyGoal({ type: g.id as any, target: Number(e.target.value) })}
                           className="w-16 bg-black border border-[#222] rounded-lg text-center font-bold text-white py-1"
                           placeholder="0"
                         />
                         <span className="text-[10px] text-gray-500 uppercase font-bold">{g.unit}</span>
                       </div>
                     </button>
                   ))}
                </div>

                <div className="mb-8">
                  <p className="text-[10px] text-gray-500 uppercase font-bold tracking-widest ml-1 mb-3">Quick Presets</p>
                  <div className="flex flex-wrap gap-2">
                    {weeklyGoal.type === 'distance' && [5, 10, 21, 42].map(v => (
                      <button key={v} onClick={() => setWeeklyGoal(prev => ({ ...prev, target: v }))} className={cn("px-4 py-2 rounded-xl border text-xs font-bold transition-all", weeklyGoal.target === v ? "bg-brand-500 border-brand-500 text-black" : "bg-[#222] border-[#333] text-gray-400 hover:text-white")}>{v}km</button>
                    ))}
                    {weeklyGoal.type === 'frequency' && [3, 4, 5, 7].map(v => (
                      <button key={v} onClick={() => setWeeklyGoal(prev => ({ ...prev, target: v }))} className={cn("px-4 py-2 rounded-xl border text-xs font-bold transition-all", weeklyGoal.target === v ? "bg-brand-500 border-brand-500 text-black" : "bg-[#222] border-[#333] text-gray-400 hover:text-white")}>{v} sessions</button>
                    ))}
                    {weeklyGoal.type === 'calories' && [500, 1000, 2500, 5000].map(v => (
                      <button key={v} onClick={() => setWeeklyGoal(prev => ({ ...prev, target: v }))} className={cn("px-4 py-2 rounded-xl border text-xs font-bold transition-all", weeklyGoal.target === v ? "bg-brand-500 border-brand-500 text-black" : "bg-[#222] border-[#333] text-gray-400 hover:text-white")}>{v}kcal</button>
                    ))}
                    {weeklyGoal.type === 'time' && [60, 120, 300, 600].map(v => (
                      <button key={v} onClick={() => setWeeklyGoal(prev => ({ ...prev, target: v }))} className={cn("px-4 py-2 rounded-xl border text-xs font-bold transition-all", weeklyGoal.target === v ? "bg-brand-500 border-brand-500 text-black" : "bg-[#222] border-[#333] text-gray-400 hover:text-white")}>{v}min</button>
                    ))}
                  </div>
                </div>

                <button 
                  onClick={() => updateGoal(weeklyGoal)}
                  disabled={savingGoal}
                  className="w-full py-5 bg-brand-500 text-black font-display font-bold text-lg rounded-full hover:bg-brand-400 transition-all shadow-[0_10px_30px_rgba(204,255,0,0.2)] disabled:opacity-50 flex items-center justify-center gap-2"
                >
                  {savingGoal ? (
                    <div className="w-6 h-6 rounded-full border-2 border-black border-t-transparent animate-spin"></div>
                  ) : (
                    "SAVE GOAL"
                  )}
                </button>
             </motion.div>
          </motion.div>
        )}
      </AnimatePresence>

      <div className="hidden md:flex justify-between items-end">
        <div>
          <p className="text-gray-400 font-medium">{format(new Date(), "EEEE, d MMMM")}</p>
          <h2 className="text-4xl font-display font-bold mt-1 text-white">Ready to crush it, {firstName}?</h2>
        </div>
        <div className="flex gap-4 items-center">
          <button onClick={logOut} className="text-xs text-gray-500 font-medium hover:text-white transition-colors">Sign out</button>
          <div className="w-12 h-12 rounded-full bg-[#222] border-2 border-[#333] overflow-hidden">
            <img src={avatarUrl} alt="Avatar" className="w-full h-full object-cover" />
          </div>
        </div>
      </div>

      <div className="md:hidden">
        <div className="flex justify-between items-start mb-1">
          <p className="text-brand-400 text-sm font-semibold tracking-wider uppercase">{format(new Date(), "EEEE, d MMM")}</p>
          <button onClick={logOut} className="text-[10px] uppercase tracking-wider text-gray-500 font-bold hover:text-white transition-colors">Sign out</button>
        </div>
        <h2 className="text-3xl font-display font-bold text-white">Hello, {firstName}.</h2>
      </div>

      <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
        <motion.div initial={{ opacity: 0, y: 20 }} animate={{ opacity: 1, y: 0 }} className="col-span-2 md:col-span-2 bg-[#111] border border-[#222] rounded-3xl p-6 relative overflow-hidden group">
          <div className="absolute top-0 right-0 p-32 bg-brand-500/10 blur-[80px] rounded-full group-hover:bg-brand-500/20 transition-colors duration-700"></div>
          
          <div className="flex items-center justify-between mb-6 relative z-10">
            <h3 className="font-display font-semibold text-lg text-gray-200">Weekly Goal</h3>
            <button 
              onClick={() => setIsGoalModalOpen(true)}
              className="p-2 bg-[#222] text-gray-400 rounded-xl hover:text-white transition-colors"
            >
              <Settings className="w-4 h-4" />
            </button>
          </div>

          <div className="flex items-center gap-6 relative z-10">
            <div className="relative w-28 h-28 shrink-0">
              <svg className="w-full h-full -rotate-90" viewBox="0 0 100 100">
                <circle cx="50" cy="50" r="40" className="stroke-[#222] fill-none" strokeWidth="8" strokeLinecap="round" />
                <circle cx="50" cy="50" r="40" className="stroke-brand-500 fill-none" strokeWidth="8" strokeLinecap="round" strokeDasharray="251.2" strokeDashoffset={251.2 - (251.2 * (stats.progress / 100))} />
              </svg>
              <div className="absolute inset-0 flex flex-col items-center justify-center">
                <span className="text-2xl font-display font-bold text-white">{stats.progress}<span className="text-sm text-gray-400">%</span></span>
              </div>
            </div>
            
            <div>
              <div className="flex items-end gap-1 mb-1">
                <span className="text-3xl font-display font-bold text-white">
                  {weeklyGoal.type === 'distance' ? formatDistance(stats.weeklyDistance) : 
                   weeklyGoal.type === 'frequency' ? stats.frequency :
                   weeklyGoal.type === 'calories' ? stats.calories :
                   Math.floor(stats.weeklyTime / 60)}
                </span>
                <span className="text-gray-400 mb-1 font-medium italic text-xs">/ {weeklyGoal.target} {weeklyGoal.type === 'distance' ? 'km' : weeklyGoal.type === 'frequency' ? 'days' : weeklyGoal.type === 'calories' ? 'kcal' : 'mins'}</span>
              </div>
              <p className="text-xs text-gray-400 leading-relaxed mb-4">
                {stats.progress >= 100 ? "Goal achieved! 🎉 Take some rest or aim higher next week." : "Keep it up! You're making great progress towards your goal."}
              </p>
              
              <Link to="/activity" className="inline-flex items-center gap-2 text-xs font-bold text-black bg-brand-500 px-5 py-2.5 rounded-xl hover:bg-brand-400 transition-all shadow-[0_5px_15px_rgba(204,255,0,0.2)] active:scale-95">
                <Play className="w-3.5 h-3.5 fill-black" strokeWidth={3} /> GO WORKOUT
              </Link>
            </div>
          </div>
        </motion.div>

        {/* Mini Stats */}
        <motion.div 
          initial={{ opacity: 0, y: 20 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: 0.1 }}
          className="bg-[#111] border border-[#222] rounded-3xl p-5 flex flex-col justify-between"
        >
          <div className="flex items-center gap-2 text-accent-orange mb-2">
            <Flame className="w-5 h-5 fill-accent-orange/20" />
            <span className="font-semibold text-sm">Calories</span>
          </div>
          <div>
            <div className="flex items-baseline gap-1">
              <span className="text-3xl font-display font-bold text-white">{stats.calories.toLocaleString()}</span>
            </div>
            <p className="text-xs text-gray-500 mt-1 font-medium">kcal this week</p>
          </div>
        </motion.div>

        <motion.div 
          initial={{ opacity: 0, y: 20 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: 0.2 }}
          className="bg-[#111] border border-[#222] rounded-3xl p-5 flex flex-col justify-between"
        >
          <div className="flex items-center gap-2 text-accent-blue mb-2">
            <ActivityIcon className="w-5 h-5" />
            <span className="font-semibold text-sm">Avg Pace</span>
          </div>
          <div>
            <div className="flex items-baseline gap-1">
              <span className="text-3xl font-display font-bold text-white">{stats.avgPace > 0 ? `${Math.floor(stats.avgPace)}'${Math.floor((stats.avgPace % 1) * 60).toString().padStart(2, '0')}"` : "0'00\""}</span>
            </div>
            <p className="text-xs text-gray-500 mt-1 font-medium">/km this week</p>
          </div>
        </motion.div>
      </div>

      {/* Chart Section */}
      <motion.div 
        initial={{ opacity: 0, y: 20 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: 0.3 }}
        className="bg-[#111] border border-[#222] rounded-3xl pt-6 px-6 pb-4"
      >
        <div className="flex items-center justify-between mb-6">
          <h3 className="font-display font-semibold text-lg text-gray-200">Activity Overview</h3>
          <select className="bg-[#222] border-none text-xs text-gray-300 rounded-lg px-2 py-1 outline-none font-medium">
            <option>This Week</option>
          </select>
        </div>
        <div className="h-48 w-full -ml-3">
          <ResponsiveContainer width="100%" height="100%">
            <AreaChart data={stats.chartData}>
              <defs>
                <linearGradient id="colorDistance" x1="0" y1="0" x2="0" y2="1">
                  <stop offset="5%" stopColor="var(--color-brand-500)" stopOpacity={0.3}/>
                  <stop offset="95%" stopColor="var(--color-brand-500)" stopOpacity={0}/>
                </linearGradient>
              </defs>
              <Tooltip 
                contentStyle={{ backgroundColor: '#111', borderColor: '#333', borderRadius: '12px' }}
                itemStyle={{ color: '#fff' }}
                cursor={{ stroke: '#333', strokeWidth: 1, strokeDasharray: '4 4' }}
              />
              <XAxis dataKey="day" axisLine={false} tickLine={false} tick={{ fill: '#666', fontSize: 12 }} dy={10} />
              <Area 
                type="monotone" 
                dataKey="distance" 
                stroke="var(--color-brand-500)" 
                strokeWidth={3}
                fillOpacity={1} 
                fill="url(#colorDistance)" 
              />
            </AreaChart>
          </ResponsiveContainer>
        </div>
      </motion.div>

      {/* Recent Activities */}
      <div>
        <div className="flex items-center justify-between mb-4">
          <h3 className="font-display font-semibold text-lg text-gray-200">Recent Activities</h3>
          <button className="text-sm font-medium text-brand-400 hover:text-brand-300 flex items-center">
            See All <ChevronRight className="w-4 h-4" />
          </button>
        </div>
        
        {formattedActivities.length === 0 ? (
           <div className="bg-[#111] border border-[#222] rounded-2xl p-6 text-center text-gray-500 font-medium">
              You haven't recorded any activities yet.
           </div>
        ) : (
          <div className="space-y-3">
            {formattedActivities.map((activity, i) => (
              <motion.div 
                key={activity.id}
                initial={{ opacity: 0, x: -20 }} 
                animate={{ opacity: 1, x: 0 }} 
                transition={{ delay: 0.4 + (i * 0.1) }}
                onClick={() => setExpandedId(expandedId === activity.id ? null : activity.id)}
                className="bg-[#111] border border-[#222] rounded-2xl p-4 flex flex-col hover:bg-[#161616] transition-colors cursor-pointer block"
              >
               <div className="flex gap-4">
                <div className="w-20 h-20 rounded-xl overflow-hidden shrink-0 relative">
                  <img src={activity.mapUrl} alt="Map" className="w-full h-full object-cover saturate-50 contrast-125" />
                  <div className="absolute inset-0 bg-brand-500/20 mix-blend-overlay"></div>
                </div>
                <div className="flex-1 flex flex-col justify-center">
                  <div className="flex items-start justify-between mb-1">
                    <h4 className="font-display font-semibold text-white">{activity.type}</h4>
                    <span className="text-xs font-medium text-gray-500">{activity.date}</span>
                  </div>
                  <div className="flex items-center gap-4 text-sm text-gray-400 font-medium">
                    <div className="flex items-baseline gap-1">
                      <span className="text-white font-semibold">{activity.distance}</span>
                    </div>
                    <div className="flex items-baseline gap-1">
                      <span>{activity.time}</span>
                    </div>
                    <div className="flex items-baseline gap-1">
                      <span>{activity.pace}</span>
                    </div>
                  </div>
                  {activity.pbList && activity.pbList.length > 0 && (
                      <div className="flex gap-2 mt-2 flex-wrap">
                          {activity.pbList.map(pb => (
                              <span key={pb} className="text-[10px] font-bold bg-brand-500/10 text-brand-500 px-2 py-0.5 rounded-md border border-brand-500/20">{pb}</span>
                          ))}
                      </div>
                  )}
                </div>
               </div>

               {expandedId === activity.id && activity.raw?.splits && activity.raw.splits.length > 0 && (
                   <motion.div initial={{ height: 0, opacity: 0 }} animate={{ height: 'auto', opacity: 1 }} className="mt-4 pt-4 border-t border-[#222] grid grid-cols-1 md:grid-cols-2 gap-6 overflow-hidden">
                       <div>
                           <h5 className="text-gray-300 text-xs font-bold mb-3 uppercase tracking-wider">Pace Splits (min/km)</h5>
                           <div className="h-32 w-full">
                              <ResponsiveContainer width="100%" height="100%">
                                  <BarChart data={activity.raw.splits}>
                                      <XAxis dataKey="split" axisLine={false} tickLine={false} tick={{ fill: '#666', fontSize: 10 }} />
                                      <Tooltip 
                                          contentStyle={{ backgroundColor: '#111', borderColor: '#333', borderRadius: '8px' }}
                                          itemStyle={{ color: '#fff' }}
                                          cursor={{ fill: '#ffffff10' }}
                                      />
                                      <Bar dataKey="pace" fill="var(--color-brand-500)" radius={[4, 4, 0, 0]} />
                                  </BarChart>
                              </ResponsiveContainer>
                           </div>
                       </div>
                       {activity.raw.routeData && activity.raw.routeData.length > 0 && (
                          <div>
                             <h5 className="text-gray-300 text-xs font-bold mb-3 uppercase tracking-wider">Elevation (m)</h5>
                             <div className="h-32 w-full">
                                <ResponsiveContainer width="100%" height="100%">
                                   <AreaChart data={activity.raw.routeData}>
                                       <defs>
                                         <linearGradient id="colorAlt" x1="0" y1="0" x2="0" y2="1">
                                           <stop offset="5%" stopColor="#4ade80" stopOpacity={0.3}/>
                                           <stop offset="95%" stopColor="#4ade80" stopOpacity={0}/>
                                         </linearGradient>
                                       </defs>
                                       <Tooltip 
                                          contentStyle={{ backgroundColor: '#111', borderColor: '#333', borderRadius: '8px' }}
                                          itemStyle={{ color: '#fff' }}
                                          labelFormatter={() => ''}
                                       />
                                       <Area type="monotone" dataKey="altitude" stroke="#4ade80" fillOpacity={1} fill="url(#colorAlt)" />
                                   </AreaChart>
                                </ResponsiveContainer>
                             </div>
                          </div>
                       )}
                   </motion.div>
               )}
              </motion.div>
          ))}
        </div>
        )}
      </div>

      {/* Routes Section */}
      <div className="pb-10">
         <div className="flex justify-between items-center mb-4">
           <h3 className="font-display font-semibold text-lg text-gray-200">Community Favorites & Your Routes</h3>
           <button onClick={() => setIsRouteCreatorOpen(true)} className="bg-[#222] text-brand-500 hover:bg-[#333] transition-colors p-2 rounded-xl flex items-center gap-2">
             <PlusCircle className="w-5 h-5"/>
             <span className="text-sm font-bold pr-2">Create Route</span>
           </button>
         </div>
         {routes.length === 0 ? (
            <div className="bg-[#111] border border-[#222] rounded-2xl p-6 text-center text-gray-500 font-medium">
               No routes available yet. Create one!
            </div>
         ) : (
           <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
             {routes.map((route, i) => (
                <motion.div 
                  key={route.id}
                  initial={{ opacity: 0, y: 20 }} 
                  animate={{ opacity: 1, y: 0 }} 
                  transition={{ delay: 0.5 + (i * 0.1) }}
                  className="bg-[#111] border border-[#222] rounded-3xl p-5 flex items-center gap-4 hover:border-[#333] transition-colors"
                >
                   <div className="w-16 h-16 rounded-2xl bg-[#222] flex items-center justify-center shrink-0">
                     <MapPin className="w-8 h-8 text-brand-500" />
                   </div>                
                   <div className="flex-1 min-w-0">
                     <p className="text-white font-semibold truncate">{route.routeName || "Unnamed Route"}</p>
                     <p className="text-gray-500 text-xs mt-1">{(route.distance || 0).toFixed(1)} km</p>
                     {activeUsersByRoute[route.id] && activeUsersByRoute[route.id].length > 0 && (
                       <div className="mt-3 flex items-center gap-2">
                         <div className="flex -space-x-2">
                           {activeUsersByRoute[route.id].slice(0, 3).map((rUser: any, i: number) => {
                             const name = rUser.displayName === "Athlete" ? "User" : (rUser.displayName || "User");
                             const ava = rUser.photoURL || `https://api.dicebear.com/7.x/avataaars/svg?seed=${name}`;
                             return (
                               <img key={i} src={ava} className="w-6 h-6 rounded-full border border-[#222]" title={name} />
                             );
                           })}
                         </div>
                         <span className="text-[10px] text-gray-500 font-bold uppercase tracking-widest">
                           {activeUsersByRoute[route.id].length} Racer{activeUsersByRoute[route.id].length > 1 ? 's' : ''} here
                         </span>
                       </div>
                     )}
                   </div>
                   <div className="flex gap-2">
                      <button onClick={() => {
                        navigator.clipboard.writeText(`${window.location.origin}/activity?ghostId=${route.id}`);
                        alert("Route link copied!");
                       }} className="text-gray-400 hover:text-white p-2 border border-[#333] rounded-xl shrink-0">
                          <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M8.684 13.342C8.886 12.938 9 12.482 9 12c0-.482-.114-.938-.316-1.342m0 2.684a3 3 0 110-2.684m0 2.684l6.632 3.316m-6.632-6l6.632-3.316m0 0a3 3 0 105.367-1.342A3 3 0 0015.367 3.316z" /></svg>
                       </button>
                      <button onClick={() => navigate(`/activity?ghostId=${route.id}`)} className="bg-brand-500 text-black px-4 py-2 rounded-xl text-sm font-bold shadow-[0_5px_15px_rgba(204,255,0,0.15)] hover:bg-brand-400 shrink-0 transition-colors">Start</button>
                   </div>
                </motion.div>
             ))}
           </div>
         )}
      </div>

      <RouteCreatorModal isOpen={isRouteCreatorOpen} onClose={() => setIsRouteCreatorOpen(false)} />
    </div>
  );
}
