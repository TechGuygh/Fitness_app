import { Settings, Award, Map, Droplets, Moon, Activity as ActivityIcon, Camera } from "lucide-react";
import { motion } from "framer-motion";
import { useAuth } from "@/src/components/auth/AuthProvider";
import React, { useState, useEffect, useRef } from "react";
import { doc, getDoc, collection, query, where, getDocs, updateDoc, onSnapshot } from "firebase/firestore";
import { db, storage, auth } from "@/src/lib/firebase";
import { handleFirestoreError, OperationType } from "@/src/lib/firebase-error";
import { format } from "date-fns";
import { uploadBytes, getDownloadURL, ref } from "firebase/storage";
import { updateProfile } from "firebase/auth";
import { formatDistance } from "@/src/lib/utils";
import { useNavigate } from "react-router-dom";

const BADGES = [
  { id: 1, name: "Early Bird", desc: "5 runs before 6 AM", icon: "🌅", unlocked: true },
  { id: 2, name: "Marathoner", desc: "Ran 42.2km", icon: "🏅", unlocked: false },
  { id: 3, name: "Streak Master", desc: "30 day active streak", icon: "🔥", unlocked: true },
  { id: 4, name: "Night Owl", desc: "10 runs after 8 PM", icon: "🦉", unlocked: false },
];

export default function Profile() {
  const { user } = useAuth();
  const navigate = useNavigate();
  const [profileData, setProfileData] = useState<any>(null);
  const [weeklyGoal, setWeeklyGoal] = useState<any>(null);
  const [friends, setFriends] = useState<any[]>([]);
  const [uploading, setUploading] = useState(false);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const [stats, setStats] = useState({
    totalKm: 0,
    activeHours: 0,
    totalActivities: 0,
    calories: 0,
    followers: 0,
    following: 0,
  });

  const handleFileChange = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file || !user) return;
    
    setUploading(true);
    try {
        const storageRef = ref(storage, `avatars/${user.uid}`);
        await uploadBytes(storageRef, file);
        const downloadURL = await getDownloadURL(storageRef);
        
        await updateProfile(auth.currentUser!, { photoURL: downloadURL });
        await updateDoc(doc(db, "users", user.uid), { photoURL: downloadURL });
        window.location.reload(); 
    } catch(e) {
        console.error(e);
        handleFirestoreError(e, OperationType.UPDATE, "users");
    } finally {
        setUploading(false);
    }
  };

  useEffect(() => {
    if (user) {
      const unsubUser = onSnapshot(doc(db, "users", user.uid), (doc) => {
        if (doc.exists()) setProfileData(doc.data());
      });

      const unsubGoal = onSnapshot(doc(db, "goals", user.uid), (doc) => {
        if (doc.exists()) setWeeklyGoal(doc.data());
      });

      const qActivities = query(collection(db, "activities"), where("userId", "==", user.uid));
      const unsubActivities = onSnapshot(qActivities, (snap) => {
          let dist = 0;
          let timeSecs = 0;
          snap.forEach(doc => {
            const data = doc.data();
            dist += data.distance || 0;
            timeSecs += data.timeSeconds || 0;
          });
          setStats(prev => ({ 
              ...prev, 
              totalKm: dist, 
              activeHours: timeSecs / 3600, 
              totalActivities: snap.docs.length, 
              calories: dist * 60 
          }));
      });

      const qFollowers = query(collection(db, "follows"), where("followingId", "==", user.uid));
      const unsubFollowers = onSnapshot(qFollowers, (snap) => {
          setStats(prev => ({ ...prev, followers: snap.size }));
      });

      const qFollowing = query(collection(db, "follows"), where("followerId", "==", user.uid));
      const unsubFollowing = onSnapshot(qFollowing, (snap) => {
          setStats(prev => ({ ...prev, following: snap.size }));
      });

      const unsubFriends = onSnapshot(query(collection(db, "friendships"), where("userIds", "array-contains", user.uid)), async (snap) => {
        const friendIds = snap.docs.map(doc => {
           const ids = doc.data().userIds as string[];
           return ids.find(id => id !== user.uid);
        }).filter(Boolean) as string[];

        if (friendIds.length > 0) {
           const qUsers = query(collection(db, "users")); // Simple way, optimized would be where('uid', 'in', friendIds) but firestore has limits
           const userSnap = await getDocs(qUsers);
           const friendProfiles = userSnap.docs
             .map(d => ({ id: d.id, ...d.data() }))
             .filter(u => friendIds.includes(u.id));
           setFriends(friendProfiles);
        } else {
           setFriends([]);
        }
      });

      return () => {
        unsubUser();
        unsubGoal();
        unsubActivities();
        unsubFollowers();
        unsubFollowing();
        unsubFriends();
      };
    }
  }, [user]);

  const [isEditingName, setIsEditingName] = useState(false);
  const [newName, setNewName] = useState(user.displayName || "");

  const handleUpdateName = async () => {
    if (!user) return;
    try {
      await updateProfile(auth.currentUser!, { displayName: newName });
      await updateDoc(doc(db, "users", user.uid), { displayName: newName });
      setIsEditingName(false);
    } catch(e) {
      console.error(e);
      handleFirestoreError(e, OperationType.UPDATE, "users");
    }
  };

  if (!user) return null;

  const joinDate = profileData?.joinedAt?.toDate ? format(profileData.joinedAt.toDate(), "MMM yyyy") : "recently";
  const firstName = user.displayName === "Athlete" ? (user.email?.split("@")[0] || "User") : (user.displayName?.split(" ")[0] || user.email?.split("@")[0] || "User");
  const avatarUrl = user.photoURL || `https://api.dicebear.com/7.x/avataaars/svg?seed=${firstName}`;
  const level = profileData?.level || 1;

  return (
    <div className="p-4 md:p-8 pt-20 md:pt-8 min-h-screen max-w-4xl mx-auto space-y-8 pb-24">
      
      {/* Profile Header */}
      <div className="flex flex-col md:flex-row gap-6 md:items-center">
        <div className="relative">
          <div className="w-24 h-24 md:w-32 md:h-32 rounded-full border-4 border-brand-500 p-1 relative">
            <div className="w-full h-full rounded-full bg-[#222] overflow-hidden">
              <img src={avatarUrl} alt="Avatar" className="w-full h-full object-cover" />
            </div>
            <button 
               onClick={() => fileInputRef.current?.click()}
               className="absolute bottom-0 right-0 bg-brand-500 text-black p-2 rounded-full hover:bg-brand-400 transition-colors shadow-lg"
            >
               {uploading ? <div className="w-4 h-4 rounded-full border-2 border-black border-t-transparent animate-spin"></div> : <Camera className="w-4 h-4" />}
            </button>
            <input type="file" ref={fileInputRef} onChange={handleFileChange} className="hidden" accept="image/*" />
          </div>
          <div className="absolute -bottom-2 -right-2 bg-brand-500 text-black font-bold text-xs px-2 py-1 rounded-full border-2 border-black">
            LVL {level}
          </div>
        </div>
        
        <div className="flex-1">
          {isEditingName ? (
            <div className="flex gap-2 mb-1">
              <input 
                value={newName} 
                onChange={(e) => setNewName(e.target.value)}
                className="text-3xl font-display font-bold text-white bg-[#111] border border-[#333] rounded-lg px-2 py-1 outline-none w-full"
              />
              <button 
                onClick={handleUpdateName}
                className="text-brand-500 font-bold px-3 py-1 rounded-lg border border-brand-500"
              >
                Save
              </button>
            </div>
          ) : (
             <h2 className="text-3xl font-display font-bold text-white mb-1 cursor-pointer flex items-center gap-2" onClick={() => setIsEditingName(true)}>
               {user.displayName === "Athlete" ? (user.email?.split("@")[0] || "User") : (user.displayName || 'User')}
               <span className="text-xs text-gray-500 font-normal underline">Edit</span>
             </h2>
          )}
          <p className="text-gray-400 mb-4 font-medium">Joined {joinDate} • Free Member</p>
          
          <div className="flex gap-4">
            <div className="text-center">
              <p className="text-xl font-bold text-white">{stats.followers}</p>
              <p className="text-xs text-gray-500 uppercase tracking-widest font-semibold">Followers</p>
            </div>
            <div className="w-px h-10 bg-[#333]"></div>
            <div className="text-center">
              <p className="text-xl font-bold text-white">{stats.following}</p>
              <p className="text-xs text-gray-500 uppercase tracking-widest font-semibold">Following</p>
            </div>
            <div className="w-px h-10 bg-[#333]"></div>
            <div className="text-center">
              <p className="text-xl font-bold text-white">{stats.totalActivities}</p>
              <p className="text-xs text-gray-500 uppercase tracking-widest font-semibold">Activities</p>
            </div>
          </div>
        </div>
        
        <button className="w-12 h-12 bg-[#111] border border-[#222] rounded-full flex items-center justify-center text-gray-400 hover:text-white hover:bg-[#222] transition-colors md:self-start">
          <Settings className="w-5 h-5" />
        </button>
      </div>

      {/* Friends List */}
      <div>
        <div className="flex items-center justify-between mb-4">
          <h3 className="font-display font-semibold text-xl text-white">Your Friends</h3>
          <div className="flex items-center gap-3">
            <span className="text-xs font-bold text-gray-500 bg-[#111] border border-[#222] px-3 py-1 rounded-full uppercase tracking-wider">
              {friends.length} Connections
            </span>
             <button 
                onClick={() => navigate('/community', { state: { activeTab: 'Friends' } })}
                className="text-xs font-bold text-brand-500 bg-[#222] hover:bg-[#333] transition-colors px-3 py-1 rounded-full uppercase tracking-wider"
             >
                View All
             </button>
          </div>
        </div>
        <div className="flex gap-4 overflow-x-auto pb-4 scrollbar-hide -mx-4 px-4">
           {friends.length === 0 ? (
             <p className="text-gray-500 text-sm">No friends added yet.</p>
           ) : (
             friends.map((friend, i) => (
               <motion.div 
                 key={friend.id} 
                 initial={{ opacity: 0, scale: 0.8 }} 
                 animate={{ opacity: 1, scale: 1 }} 
                 transition={{ delay: i * 0.05 }}
                 className="flex flex-col items-center shrink-0 w-20"
               >
                 <div className="w-16 h-16 rounded-full p-0.5 border border-[#333] mb-2">
                    <img src={friend.photoURL || `https://api.dicebear.com/7.x/avataaars/svg?seed=${friend.displayName}`} className="w-full h-full rounded-full object-cover" />
                 </div>
                 <p className="text-[10px] text-white font-bold text-center line-clamp-1">{friend.displayName.split(' ')[0]}</p>
                 <p className="text-[8px] text-brand-500 font-bold uppercase tracking-widest text-center">LVL {friend.level || 1}</p>
               </motion.div>
             ))
           )}
        </div>
      </div>

      {/* Weekly Performance */}
      <div>
        <div className="flex items-center justify-between mb-4">
          <h3 className="font-display font-semibold text-xl text-white">Weekly Performance</h3>
          {weeklyGoal && (
             <span className="text-xs font-bold text-brand-500 bg-brand-500/10 px-3 py-1 rounded-full uppercase tracking-wider">
               Goal: {weeklyGoal.target} {weeklyGoal.type === 'distance' ? 'km' : weeklyGoal.type === 'frequency' ? 'days' : weeklyGoal.type === 'calories' ? 'kcal' : 'mins'}
             </span>
          )}
        </div>
        {!weeklyGoal ? (
          <div className="bg-[#111] border border-[#222] border-dashed rounded-2xl p-6 text-center">
            <p className="text-gray-500 text-sm mb-3">No active goal set for this week.</p>
            <button onClick={() => window.location.href = '/'} className="text-brand-500 text-xs font-bold hover:underline">SET A GOAL</button>
          </div>
        ) : (
          <div className="bg-[#111] border border-[#222] rounded-2xl p-6 relative overflow-hidden group">
             <div className="absolute top-0 right-0 p-24 bg-brand-500/5 blur-[60px] rounded-full group-hover:bg-brand-500/10 transition-colors"></div>
             <div className="flex justify-between items-center mb-6 relative z-10">
                <div>
                   <p className="text-[10px] text-gray-500 uppercase font-bold tracking-widest mb-1">Current Progress</p>
                   {weeklyGoal.type === 'distance' && (
                     <p className="text-2xl font-display font-bold text-white">{formatDistance(stats.totalKm)} <span className="text-sm text-gray-500 font-normal italic">this week</span></p>
                   )}
                   {weeklyGoal.type === 'frequency' && (
                     <p className="text-2xl font-display font-bold text-white">{stats.totalActivities} <span className="text-sm text-gray-500 font-normal italic">sessions</span></p>
                   )}
                   {weeklyGoal.type === 'calories' && (
                     <p className="text-2xl font-display font-bold text-white">{Math.floor(stats.calories).toLocaleString()} <span className="text-sm text-gray-500 font-normal italic">kcal</span></p>
                   )}
                   {weeklyGoal.type === 'time' && (
                     <p className="text-2xl font-display font-bold text-white">{stats.activeHours.toFixed(1)} <span className="text-sm text-gray-500 font-normal italic">hours</span></p>
                   )}
                </div>
                <div className="text-right">
                   <p className="text-3xl font-display font-bold text-brand-500">{Math.min(100, Math.round((stats.totalKm / (weeklyGoal.target || 1)) * 100))}%</p>
                   <p className="text-[10px] text-gray-500 uppercase font-bold tracking-widest">Efficiency</p>
                </div>
             </div>
             <div className="h-2 w-full bg-[#222] rounded-full overflow-hidden relative z-10">
                <motion.div 
                  initial={{ width: 0 }} 
                  animate={{ width: `${Math.min(100, (stats.totalKm / (weeklyGoal.target || 1)) * 100)}%` }} 
                  className="h-full bg-brand-500" 
                />
             </div>
          </div>
        )}
      </div>

      <div>
        <h3 className="font-display font-semibold text-xl text-white mb-4">Lifetime Stats</h3>
        <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
          <div className="bg-[#111] border border-[#222] rounded-2xl p-5">
            <Map className="w-5 h-5 text-brand-400 mb-3" />
            <p className="text-3xl font-display font-bold text-white mb-1">{formatDistance(stats.totalKm)}</p>
            <p className="text-sm text-gray-400 font-medium tracking-wide">Total distance</p>
          </div>
          <div className="bg-[#111] border border-[#222] rounded-2xl p-5">
            <ActivityIcon className="w-5 h-5 text-accent-orange mb-3" />
            <p className="text-3xl font-display font-bold text-white mb-1">{stats.activeHours.toFixed(1)}</p>
            <p className="text-sm text-gray-400 font-medium tracking-wide">Active Hours</p>
          </div>
          <div className="bg-[#111] border border-[#222] rounded-2xl p-5">
            <Award className="w-5 h-5 text-accent-purple mb-3" />
            <p className="text-3xl font-display font-bold text-white mb-1">0</p>
            <p className="text-sm text-gray-400 font-medium tracking-wide">Badges</p>
          </div>
          <div className="bg-[#111] border border-[#222] rounded-2xl p-5">
            <Droplets className="w-5 h-5 text-accent-blue mb-3" />
            <p className="text-3xl font-display font-bold text-white mb-1">{Math.floor(stats.calories).toLocaleString()}</p>
            <p className="text-sm text-gray-400 font-medium tracking-wide">Calories</p>
          </div>
        </div>
      </div>

      {/* Badges */}
      <div>
        <div className="flex items-center justify-between mb-4">
          <h3 className="font-display font-semibold text-xl text-white mb-1">Achievement Badges</h3>
          <button className="text-sm font-medium text-brand-400 hover:text-brand-300">View All</button>
        </div>
        <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
          {BADGES.map((badge, i) => (
            <motion.div 
              key={badge.id}
              initial={{ opacity: 0, scale: 0.9 }} animate={{ opacity: 1, scale: 1 }} transition={{ delay: i * 0.1 }}
              className={`border rounded-2xl p-4 text-center transition-all ${badge.unlocked ? 'bg-[#111] border-[#222] hover:border-[#333]' : 'bg-transparent border-dashed border-[#222] opacity-50'}`}
            >
              <div className={`text-4xl mb-3 ${!badge.unlocked && 'grayscale'}`}>{badge.icon}</div>
              <h4 className="font-bold text-white text-sm mb-1">{badge.name}</h4>
              <p className="text-[10px] text-gray-500 font-medium">{badge.desc}</p>
            </motion.div>
          ))}
        </div>
      </div>

    </div>
  );
}
