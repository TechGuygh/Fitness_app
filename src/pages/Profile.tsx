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

const BADGES = [
  { id: 1, name: "Early Bird", desc: "5 runs before 6 AM", icon: "🌅", unlocked: true },
  { id: 2, name: "Marathoner", desc: "Ran 42.2km", icon: "🏅", unlocked: false },
  { id: 3, name: "Streak Master", desc: "30 day active streak", icon: "🔥", unlocked: true },
  { id: 4, name: "Night Owl", desc: "10 runs after 8 PM", icon: "🦉", unlocked: false },
];

export default function Profile() {
  const { user } = useAuth();
  const [profileData, setProfileData] = useState<any>(null);
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

      return () => {
        unsubUser();
        unsubActivities();
        unsubFollowers();
        unsubFollowing();
      };
    }
  }, [user]);

  if (!user) return null;

  const joinDate = profileData?.joinedAt?.toDate ? format(profileData.joinedAt.toDate(), "MMM yyyy") : "recently";
  const firstName = user.displayName?.split(" ")[0] || "Athlete";
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
          <h2 className="text-3xl font-display font-bold text-white mb-1">{user.displayName || 'Athlete'}</h2>
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

      {/* Lifetime Stats */}
      <div>
        <h3 className="font-display font-semibold text-xl text-white mb-4">Lifetime Stats</h3>
        <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
          <div className="bg-[#111] border border-[#222] rounded-2xl p-5">
            <Map className="w-5 h-5 text-brand-400 mb-3" />
            <p className="text-3xl font-display font-bold text-white mb-1">{stats.totalKm.toFixed(1)}</p>
            <p className="text-sm text-gray-400 font-medium tracking-wide">Total km</p>
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
