import { format, subDays, startOfDay, isAfter } from "date-fns";
import { Play, TrendingUp, Flame, MapPin, ChevronRight, Activity as ActivityIcon } from "lucide-react";
import { Link } from "react-router-dom";
import { AreaChart, Area, ResponsiveContainer, XAxis, Tooltip } from "recharts";
import { motion } from "framer-motion";
import { useAuth } from "@/src/components/auth/AuthProvider";
import { useState, useEffect, useMemo } from "react";
import { collection, query, where, orderBy, getDocs } from "firebase/firestore";
import { db } from "@/src/lib/firebase";
import { handleFirestoreError, OperationType } from "@/src/lib/firebase-error";
import Auth from "./Auth";

export default function Dashboard() {
  const { user, logOut } = useAuth();
  const [activities, setActivities] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    if (user) {
      async function fetchActivities() {
        try {
          const q = query(
            collection(db, "activities"),
            where("userId", "==", user!.uid),
            orderBy("createdAt", "desc")
          );
          const snap = await getDocs(q);
          const acts = snap.docs.map(doc => {
            const data = doc.data();
            return {
              id: doc.id,
              ...data,
              createdAt: data.createdAt?.toDate ? data.createdAt.toDate() : new Date(),
            };
          });
          setActivities(acts);
        } catch (error) {
          handleFirestoreError(error, OperationType.LIST, "activities");
        } finally {
          setLoading(false);
        }
      }
      fetchActivities();
    }
  }, [user]);

  const stats = useMemo(() => {
    const now = new Date();
    const startOfCurrentWeek = subDays(startOfDay(now), 6); // Past 7 days including today

    let weeklyDistance = 0;
    let weeklyTime = 0;
    let weeklyPaceSum = 0;
    let activeDaysCount = 0;
    
    // Group by day for chart
    const dailyMap: Record<string, number> = {};
    for (let i = 0; i < 7; i++) {
        const d = subDays(now, 6 - i);
        dailyMap[format(d, "EEE")] = 0;
    }

    const recentActs = activities.filter(a => isAfter(a.createdAt, startOfCurrentWeek));
    
    recentActs.forEach(a => {
      weeklyDistance += a.distance || 0;
      weeklyTime += a.timeSeconds || 0;
      if (a.pace) {
          weeklyPaceSum += a.pace;
          activeDaysCount++;
      }
      const dayStr = format(a.createdAt, "EEE");
      if (dailyMap[dayStr] !== undefined) {
          dailyMap[dayStr] += a.distance || 0;
      }
    });

    const chartData = Object.keys(dailyMap).map(day => ({
        day,
        distance: Number(dailyMap[day].toFixed(2))
    }));

    const avgPace = activeDaysCount > 0 ? weeklyPaceSum / activeDaysCount : 0;
    const calories = Math.floor(weeklyDistance * 60); // rough estimate: 60 kcal per km

    return {
        weeklyDistance,
        avgPace,
        calories,
        chartData
    };
  }, [activities]);

  const formattedActivities = activities.slice(0, 3).map(data => {
    const m = Math.floor(data.timeSeconds / 60);
    const s = data.timeSeconds % 60;
    const pace = data.pace;
    const paceM = Math.floor(pace);
    const paceS = Math.floor((pace % 1) * 60).toString().padStart(2, '0');
    return {
      id: data.id,
      type: data.activityType === 'run' ? 'Running' : 'Cycling',
      distance: `${(data.distance || 0).toFixed(2)} km`,
      time: `${m.toString().padStart(2,'0')}:${s.toString().padStart(2,'0')}`,
      pace: pace > 0 ? `${paceM}'${paceS}"` : "0'00\"",
      date: format(data.createdAt, "MMM d, yyyy"),
      mapUrl: "https://images.unsplash.com/photo-1524661135-423995f22d0b?auto=format&fit=crop&q=80&w=800&h=400",
    };
  });

  if (!user) {
    return <Auth />;
  }

  const firstName = user.displayName?.split(" ")[0] || "Athlete";
  const avatarUrl = user.photoURL || `https://api.dicebear.com/7.x/avataaars/svg?seed=${firstName}`;

  return (
    <div className="p-4 md:p-8 pt-20 md:pt-8 min-h-screen max-w-5xl mx-auto space-y-8">
      
      {/* Header section (Desktop mainly, mobile has top bar) */}
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

      {/* Main Stats Grid */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
        {/* Weekly Progress Card */}
        <motion.div 
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          className="col-span-2 md:col-span-2 bg-[#111] border border-[#222] rounded-3xl p-6 relative overflow-hidden group"
        >
          <div className="absolute top-0 right-0 p-32 bg-brand-500/10 blur-[80px] rounded-full group-hover:bg-brand-500/20 transition-colors duration-700"></div>
          
          <div className="flex items-center justify-between mb-6 relative z-10">
            <h3 className="font-display font-semibold text-lg text-gray-200">Weekly Goal</h3>
            <span className="bg-[#222] text-xs font-semibold px-2.5 py-1 rounded-full text-brand-400">
              On Track
            </span>
          </div>

          <div className="flex items-center gap-6 relative z-10">
            {/* Progress Ring */}
            <div className="relative w-28 h-28 shrink-0">
              <svg className="w-full h-full -rotate-90" viewBox="0 0 100 100">
                <circle cx="50" cy="50" r="40" className="stroke-[#222] fill-none" strokeWidth="8" strokeLinecap="round" />
                <circle cx="50" cy="50" r="40" className="stroke-brand-500 fill-none" strokeWidth="8" strokeLinecap="round" strokeDasharray="251.2" strokeDashoffset={251.2 - (251.2 * Math.min(stats.weeklyDistance / 30, 1))} />
              </svg>
              <div className="absolute inset-0 flex flex-col items-center justify-center">
                <span className="text-2xl font-display font-bold text-white">{Math.min(Math.round((stats.weeklyDistance / 30) * 100), 100)}<span className="text-sm text-gray-400">%</span></span>
              </div>
            </div>
            
            <div>
              <div className="flex items-end gap-1 mb-1">
                <span className="text-3xl font-display font-bold text-white">{stats.weeklyDistance.toFixed(1)}</span>
                <span className="text-gray-400 mb-1 font-medium">/ 30 km</span>
              </div>
              <p className="text-sm text-gray-400 leading-relaxed mb-4">Keep it up! You're making great progress towards your weekly goal.</p>
              
              <Link to="/activity" className="inline-flex items-center gap-2 text-sm font-semibold text-black bg-brand-500 px-4 py-2 rounded-xl hover:bg-brand-400 transition-colors">
                <Play className="w-4 h-4 fill-black" /> Go Run
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
                className="bg-[#111] border border-[#222] rounded-2xl p-4 flex gap-4 hover:bg-[#161616] transition-colors cursor-pointer"
              >
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
              </div>
            </motion.div>
          ))}
        </div>
        )}
      </div>
      
    </div>
  );
}
