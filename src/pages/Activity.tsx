import React, { useState, useEffect, useRef } from "react";
import { Play, Pause, Square, MapPin, X, Signal, Settings, Share2, ChevronLeft } from "lucide-react";
import { MapContainer, TileLayer, Marker, Polyline, Popup, useMap } from "react-leaflet";
import { AreaChart, Area, ResponsiveContainer, XAxis, YAxis, Tooltip, BarChart, Bar, ComposedChart, Line, Legend } from "recharts";
import { motion, AnimatePresence } from "framer-motion";
import L from "leaflet";
import "leaflet/dist/leaflet.css";
import { useAuth } from "@/src/components/auth/AuthProvider";
import { db } from "@/src/lib/firebase";
import { doc, setDoc, collection, serverTimestamp, getDoc, query, where, onSnapshot } from "firebase/firestore";
import { handleFirestoreError, OperationType } from "@/src/lib/firebase-error";
import { useSearchParams, useNavigate } from "react-router-dom";
import { KalmanFilter } from "@/src/lib/KalmanFilter";
import ActivitySettingsModal from "@/src/components/ActivitySettingsModal";

// ... (rest of the file as before until watchPosition logic) ...

// Fix Leaflet marker icons with custom ones to avoid Vite import issues
const createCustomIcon = (color: string, text?: string) => {
  if (typeof L === 'undefined' || !L.divIcon) return null as any;
  return L.divIcon({
    className: "custom-marker",
    html: `
      <div style="
        background-color: ${color};
        width: 24px;
        height: 24px;
        border-radius: 50%;
        border: 3px solid white;
        box-shadow: 0 0 10px rgba(0,0,0,0.5);
        display: flex;
        align-items: center;
        justify-content: center;
        font-size: 12px;
        font-weight: bold;
        color: white;
      ">${text || ''}</div>
    `,
    iconSize: [24, 24],
    iconAnchor: [12, 12],
  });
};

const createAvatarIcon = (url?: string, seed?: string) => {
  if (typeof L === 'undefined' || !L.divIcon) return null as any;
  const imageUrl = url || `https://api.dicebear.com/7.x/avataaars/svg?seed=${seed || Math.random()}`;
  return L.divIcon({
    className: "custom-avatar-marker",
    iconSize: [36, 36],
    iconAnchor: [18, 18],
    html: `
      <div style="
        width: 36px;
        height: 36px;
        border-radius: 50%;
        border: 3px solid #3b82f6;
        box-shadow: 0 0 10px rgba(59,130,246,0.5);
        background-color: #111;
        background-image: url('${imageUrl}');
        background-size: cover;
        background-position: center;
      "></div>
    `
  });
};

function deg2rad(deg: number) {
  return deg * (Math.PI/180);
}

function getDistance(lat1: number, lon1: number, lat2: number, lon2: number) {
  const R = 6371; // Earth radius in km
  const dLat = deg2rad(lat2-lat1);
  const dLon = deg2rad(lon2-lon1);
  const a = 
    Math.sin(dLat/2) * Math.sin(dLat/2) +
    Math.cos(deg2rad(lat1)) * Math.cos(deg2rad(lat2)) * 
    Math.sin(dLon/2) * Math.sin(dLon/2);
  const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1-a)); 
  return R * c; 
}

function formatTime(seconds: number) {
  const mins = Math.floor(seconds / 60);
  const secs = seconds % 60;
  return `${mins.toString().padStart(2, '0')}:${secs.toString().padStart(2, '0')}`;
}

function calculateDistance(path: [number, number][]) {
  let dist = 0;
  for (let i = 0; i < path.length - 1; i++) {
    dist += getDistance(path[i][0], path[i][1], path[i+1][0], path[i+1][1]);
  }
  return dist;
}

// Component to recenter map during tracking/replay
function MapController({ position, isAutoCenter, setIsAutoCenter }: { 
  position: [number, number] | null;
  isAutoCenter: boolean;
  setIsAutoCenter: (v: boolean) => void;
}) {
  const map = useMap();

  useEffect(() => {
    const handleDragStart = () => setIsAutoCenter(false);
    map.on('dragstart', handleDragStart);
    return () => {
      map.off('dragstart', handleDragStart);
    };
  }, [map, setIsAutoCenter]);

  useEffect(() => {
    if (position && isAutoCenter) {
      map.panTo(position, { animate: true, duration: 0.4 });
    }
  }, [position, map, isAutoCenter]);
  
  return null;
}

const InteractiveMarker: React.FC<{ 
  position: [number, number];
  icon: L.Icon | L.DivIcon;
  label: string;
  setIsAutoCenter: (v: boolean) => void;
}> = ({ position, icon, label, setIsAutoCenter }) => {
  const map = useMap();
  return (
    <Marker 
      position={position} 
      icon={icon}
      eventHandlers={{
        click: () => {
          setIsAutoCenter(false);
          map.panTo(position, { animate: true, duration: 0.5 });
        }
      }}
    >
      <Popup className="custom-popup">
        <div className="font-display font-bold text-center">{label}</div>
      </Popup>
    </Marker>
  );
}

import { useWorkout } from "@/src/components/WorkoutProvider";
import { formatDistance } from "@/src/lib/utils";

export default function Activity() {
  const { user } = useAuth();
  const navigate = useNavigate();
  
  // Create icons lazily
  const startIcon = React.useMemo(() => createCustomIcon("#22c55e", "S"), []);
  const finishIcon = React.useMemo(() => createCustomIcon("#ef4444", "F"), []);
  const currentIcon = React.useMemo(() => createCustomIcon("#f97316"), []);
  const ghostIcon = React.useMemo(() => createCustomIcon("#a855f7"), []);
  const {
    workoutState,
    activityType,
    time,
    distance,
    routePath,
    routeData,
    currentPosition,
    gpsSignal,
    autoPaused,
    startWorkout,
    pauseWorkout,
    resumeWorkout,
    stopWorkout,
    resetWorkout,
    setActivityType,
  } = useWorkout();

  const [mapCenter, setMapCenter] = useState<[number, number]>([40.7812, -73.9665]);
  const [isAutoCenter, setIsAutoCenter] = useState(true);
  const [currentActivityId, setCurrentActivityId] = useState<string | null>(null);
  const [showConfirmStop, setShowConfirmStop] = useState(false);
  const [paceThreshold, setPaceThreshold] = useState(5.0);
  const [distanceThreshold, setDistanceThreshold] = useState(1.0);
  const [searchParams] = useSearchParams();
  const [ghostPath, setGhostPath] = useState<[number, number][] | null>(null);
  const [ghostTotalTime, setGhostTotalTime] = useState(0);
  const ghostId = searchParams.get('ghostId');
  const runId = searchParams.get('runId');
  const activeId = ghostId || runId;
  
  const [isSettingsOpen, setIsSettingsOpen] = useState(false);
  const [loadingSettings, setLoadingSettings] = useState(true);
  const [liveUsers, setLiveUsers] = useState<any[]>([]);
  const lastLiveUpdate = useRef(0);

  useEffect(() => {
    if (workoutState === 'tracking' && activeId && currentPosition && user) {
        const now = Date.now();
        if (now - lastLiveUpdate.current > 5000) {
            lastLiveUpdate.current = now;
            setDoc(doc(db, "liveTracking", `${activeId}_${user.uid}`), {
                routeId: activeId,
                userId: user.uid,
                userName: user.displayName || 'Athlete',
                position: currentPosition,
                distance,
                time,
                updatedAt: serverTimestamp()
            }, { merge: true }).catch(e => console.error(e));
        }
    }
  }, [currentPosition, workoutState, activeId, user, distance, time]);

  useEffect(() => {
    if (activeId && user) {
       const qLive = query(collection(db, "liveTracking"), where("routeId", "==", activeId));
       const unsub = onSnapshot(qLive, (snap) => {
           const others = snap.docs
               .map(d => ({ id: d.id, ...d.data() }))
               .filter(d => d.id !== user.uid); // exclude self
           setLiveUsers(others);
       });
       return () => unsub();
    }
  }, [activeId, user]);

  useEffect(() => {
    if (user) {
      const fetchSettings = async () => {
        try {
          const docSnap = await getDoc(doc(db, "settings", user.uid));
          if (docSnap.exists()) {
            const data = docSnap.data();
            if (data.paceThreshold) setPaceThreshold(data.paceThreshold);
            if (data.distanceThreshold) setDistanceThreshold(data.distanceThreshold);
          }
        } catch (e) {
          console.error("Error fetching settings", e);
        } finally {
          setLoadingSettings(false);
        }
      };
      fetchSettings();
    }
  }, [user]);

  const saveSettings = async (newPace: number, newDist: number) => {
    if (!user) return;
    try {
      await setDoc(doc(db, "settings", user.uid), {
        paceThreshold: newPace,
        distanceThreshold: newDist,
        updatedAt: serverTimestamp()
      }, { merge: true });
      setPaceThreshold(newPace);
      setDistanceThreshold(newDist);
      setIsSettingsOpen(false);
    } catch (e) {
      handleFirestoreError(e, OperationType.WRITE, `settings/${user.uid}`);
    }
  };

  const triggerHaptics = (type: 'light' | 'medium' | 'heavy') => {
    if (navigator.vibrate) {
      switch (type) {
          case 'light': navigator.vibrate(50); break;
          case 'medium': navigator.vibrate(100); break;
          case 'heavy': navigator.vibrate(200); break;
      }
    }
  };

  useEffect(() => {
    if (ghostId) {
      const fetchGhost = async () => {
        try {
          const docSnap = await getDoc(doc(db, "activities", ghostId));
          if (docSnap.exists()) {
            setGhostPath(docSnap.data().route || []);
            setGhostTotalTime(docSnap.data().timeSeconds || 0);
          }
        } catch (error) {
          console.error("Error fetching ghost", error);
        }
      };
      fetchGhost();
    }
  }, [ghostId]);
  
  const getGhostPosition = (): [number, number] | null => {
      if (!ghostPath || ghostPath.length === 0 || ghostTotalTime === 0 || time === 0) return null;
      const progress = Math.min(time / ghostTotalTime, 1);
      const index = Math.floor(progress * (ghostPath.length - 1));
      return ghostPath[index];
  };
  const ghostPosition = getGhostPosition();
  
  const mapboxUrl = "https://{s}.basemaps.cartocdn.com/dark_all/{z}/{x}/{y}{r}.png";

  useEffect(() => {
    if (currentPosition) {
       setMapCenter(currentPosition);
    } else if (navigator.geolocation && workoutState === 'idle') {
      navigator.geolocation.getCurrentPosition((pos) => {
        setMapCenter([pos.coords.latitude, pos.coords.longitude]);
      });
    }
  }, [currentPosition, workoutState]);

  const handleStart = () => {
    triggerHaptics('medium');
    startWorkout(activityType);
    setIsAutoCenter(true);
  };

  const handlePause = () => {
    triggerHaptics('light');
    pauseWorkout();
  }
  const handleResume = () => {
    triggerHaptics('light');
    resumeWorkout();
  }
  
  const handleStop = () => setShowConfirmStop(true);
  
  const performStop = async () => {
    triggerHaptics('heavy');
    const id = await stopWorkout();
    if (id) setCurrentActivityId(id);
  };
  
  const handleClose = () => {
    resetWorkout();
    setCurrentActivityId(null);
    setShowConfirmStop(false);
  };

  const handleShareWorkout = async () => {
    const shareText = `I just completed a ${distance.toFixed(2)} km ${activityType} in ${formatTime(time)} on Runly!`;
    const shareUrl = window.location.origin;

    try {
        if (navigator.share) {
            await navigator.share({
                title: 'My Workout on Runly',
                text: shareText,
                url: shareUrl,
            });
        } else {
            await navigator.clipboard.writeText(`${shareText} ${shareUrl}`);
            alert('Workout details copied to clipboard!');
        }
    } catch (error) {
        console.error("Error sharing", error);
    }
  };

  const currentPace = distance > 0 ? (time / 60) / distance : 0;
  const PaceFormatted = currentPace > 0 && currentPace < 60 ? `${Math.floor(currentPace)}'${Math.floor((currentPace % 1) * 60).toString().padStart(2, '0')}"` : "0'00\"";

  const ghostDistance = ghostPath ? calculateDistance(ghostPath) : 0;
  const ghostPace = ghostDistance > 0 ? (ghostTotalTime / 60) / ghostDistance : 0;
  const GhostPaceFormatted = ghostPace > 0 && ghostPace < 60 ? `${Math.floor(ghostPace)}'${Math.floor((ghostPace % 1) * 60).toString().padStart(2, '0')}"` : "0'00\"";

  const calculatedSplits = React.useMemo(() => {
    if (!routeData || routeData.length === 0) return [];
    const splitsList = [];
    let nextSplitDist = 1;
    let lastSplitTime = 0;
    let lastSplitAlt = routeData[0]?.altitude || 0;
    
    for (const pt of routeData) {
      if (pt.distance >= nextSplitDist) {
        splitsList.push({
          split: nextSplitDist,
          pace: (pt.timeSeconds - lastSplitTime) / 60,
          elevationChange: pt.altitude - lastSplitAlt,
        });
        nextSplitDist++;
        lastSplitTime = pt.timeSeconds;
        lastSplitAlt = pt.altitude;
      }
    }
    if (distance > nextSplitDist - 1 + 0.05) {
      const remDist = distance - (nextSplitDist - 1);
      splitsList.push({
        split: nextSplitDist,
        pace: (time - lastSplitTime) / 60 / remDist,
        elevationChange: (routeData[routeData.length - 1]?.altitude || 0) - lastSplitAlt,
        isPartial: true,
      });
    }
    return splitsList;
  }, [routeData, distance, time]);

  return (
    <div className="relative h-[100dvh] w-full bg-black overflow-hidden">
      <AnimatePresence>
        {showConfirmStop && (
          <motion.div
            initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}
            className="absolute inset-0 z-[1000] bg-black/80 backdrop-blur-md flex items-center justify-center p-8"
          >
            <div className="bg-[#111] border border-[#333] p-8 rounded-3xl w-full max-w-sm text-center">
              <h3 className="text-xl font-bold text-white mb-6">Stop Workout?</h3>
              <div className="flex gap-4">
                <button onClick={() => setShowConfirmStop(false)} className="flex-1 py-4 bg-[#222] rounded-full font-bold text-white">Resume</button>
                <button onClick={() => { setShowConfirmStop(false); performStop(); }} className="flex-1 py-4 bg-red-600 rounded-full font-bold text-white">Stop</button>
              </div>
            </div>
          </motion.div>
        )}
      </AnimatePresence>
      
      <div className="absolute top-8 left-4 md:left-8 z-[500]">
        <button 
          onClick={() => navigate('/')} 
          className="w-10 h-10 bg-black/80 backdrop-blur-md rounded-full flex items-center justify-center border border-[#333] hover:bg-[#222] active:scale-95 transition-all text-white shadow-lg"
        >
          <ChevronLeft className="w-6 h-6" />
        </button>
      </div>

      <div className="absolute inset-0 z-0">
        <MapContainer 
          center={mapCenter} 
          zoom={15} 
          zoomControl={false}
          className="w-full h-full pb-64 md:pb-32"
        >
          <TileLayer url={mapboxUrl} attribution="&copy; OpenStreetMap &copy; CARTO" />
          <MapController position={currentPosition} isAutoCenter={isAutoCenter} setIsAutoCenter={setIsAutoCenter} />
          {routePath.length > 0 && (
            <Polyline positions={routePath} color="#CCFF00" weight={6} opacity={0.8} />
          )}
          {(workoutState === 'finished') && routePath.length > 0 && (
            <>
              <InteractiveMarker position={routePath[0]} icon={startIcon} label="Start" setIsAutoCenter={setIsAutoCenter} />
              <InteractiveMarker position={routePath[routePath.length - 1]} icon={finishIcon} label="Finish" setIsAutoCenter={setIsAutoCenter} />
            </>
          )}
          {currentPosition && workoutState !== 'finished' && (
            <InteractiveMarker position={currentPosition} icon={currentIcon} label="Current Position" setIsAutoCenter={setIsAutoCenter} />
          )}
          {ghostPosition && workoutState === 'tracking' && (
            <InteractiveMarker position={ghostPosition} icon={ghostIcon} label="Ghost Position" setIsAutoCenter={setIsAutoCenter} />
          )}
          {liveUsers.map((liveUser) => (
             liveUser.position ? (
                <InteractiveMarker 
                   key={liveUser.id} 
                   position={liveUser.position as [number, number]} 
                   icon={createAvatarIcon(liveUser.photoURL, liveUser.userName)} 
                   label={`${liveUser.userName || 'Athlete'} (${formatDistance(liveUser.distance || 0)})`} 
                   setIsAutoCenter={() => {}} 
                />
             ) : null
          ))}
        </MapContainer>

        {!isAutoCenter && currentPosition && workoutState !== 'finished' && workoutState !== 'idle' && (
          <div className="absolute bottom-[280px] md:bottom-8 right-6 z-[400]">
            <motion.button 
              initial={{ opacity: 0, scale: 0.8 }} animate={{ opacity: 1, scale: 1 }}
              onClick={() => setIsAutoCenter(true)}
              className="bg-[#22c55e] text-black w-12 h-12 rounded-full flex items-center justify-center shadow-[0_0_20px_rgba(34,197,94,0.3)] hover:scale-105 active:scale-95 transition-all"
            >
              <MapPin className="w-5 h-5 fill-black" />
            </motion.button>
          </div>
        )}
        
        {(workoutState === 'tracking' || workoutState === 'paused') && (
          <div className="absolute top-[180px] md:top-20 left-4 md:left-8 z-[400]">
            <motion.div 
              initial={{ opacity: 0, scale: 0.8 }} animate={{ opacity: 1, scale: 1 }}
              className={`flex items-center gap-1.5 px-3 py-1.5 rounded-full backdrop-blur-xl border border-[#333]/50 shadow-lg ${
                gpsSignal === 'strong' ? 'bg-[#22c55e]/10 text-[#22c55e]' : 
                gpsSignal === 'medium' ? 'bg-yellow-500/10 text-yellow-500' : 'bg-red-500/10 text-red-500'
              }`}
            >
              <Signal className="w-4 h-4" />
              <span className="text-xs font-semibold tracking-wider uppercase">
                GPS {gpsSignal === 'strong' ? 'Strong' : gpsSignal === 'medium' ? 'Fair' : 'Weak'}
              </span>
            </motion.div>
          </div>
        )}
        
        <div className="absolute top-0 inset-x-0 h-32 bg-gradient-to-b from-black/80 to-transparent z-10 pointer-events-none md:hidden" />

        <AnimatePresence>
          {liveUsers.length > 0 && (workoutState === 'tracking' || workoutState === 'paused') && (
            <motion.div 
              initial={{ x: -100, opacity: 0 }} animate={{ x: 0, opacity: 1 }} exit={{ x: -100, opacity: 0 }}
              className="absolute top-[230px] md:top-32 left-4 z-[400] flex flex-col gap-2 max-w-[150px]"
            >
              <div className="bg-black/80 backdrop-blur-md border border-[#333] rounded-2xl p-3 shadow-2xl overflow-hidden">
                <p className="text-[10px] text-brand-500 font-bold uppercase tracking-wider mb-2 flex items-center gap-1.5">
                  <span className="w-1.5 h-1.5 bg-brand-500 rounded-full animate-pulse" />
                  Live Participants
                </p>
                <div className="space-y-2">
                  {liveUsers.map(u => (
                    <div key={u.id} className="flex flex-col gap-0.5 border-l-2 border-[#444] pl-2">
                      <span className="text-white text-[11px] font-bold truncate">{u.userName}</span>
                      <span className="text-gray-400 text-[9px]">{formatDistance(u.distance || 0)} • {formatTime(u.time || 0)}</span>
                    </div>
                  ))}
                </div>
              </div>
            </motion.div>
          )}
        </AnimatePresence>

        <AnimatePresence>
          {(workoutState === 'tracking' || workoutState === 'paused') && (
            <motion.div 
              initial={{ y: -100, opacity: 0 }} animate={{ y: 0, opacity: 1 }} exit={{ y: -100, opacity: 0 }}
              className="absolute top-24 md:top-8 inset-x-4 md:left-[20%] md:right-[20%] z-[400] flex flex-col gap-2"
            >
              {autoPaused && (
                <div className="bg-yellow-500 text-black font-bold py-2 rounded-2xl text-center text-sm shadow-lg">
                  AUTO-PAUSED due to inactivity
                </div>
              )}
              <div className="relative bg-black/80 backdrop-blur-xl border border-[#222] rounded-3xl p-4 flex items-center justify-around shadow-[0_10px_40px_rgba(0,0,0,0.8)]">
                <button onClick={() => setIsSettingsOpen(true)} className="absolute top-2 right-4 text-gray-400 hover:text-white">
                  <Settings className="w-5 h-5"/>
                </button>
                <div className="text-center">
                  <p className="text-gray-400 font-medium tracking-widest uppercase text-[10px] mb-0.5">Time</p>
                  <span className="font-display font-bold text-2xl text-white">{formatTime(time)}</span>
                </div>
                <div className="w-px h-8 bg-[#333]"></div>
                <div className="text-center">
                  <p className="text-gray-400 font-medium tracking-widest uppercase text-[10px] mb-0.5">Dist</p>
                  <span className="font-display font-bold text-2xl text-white">{formatDistance(distance)}</span>
                </div>
                <div className="w-px h-8 bg-[#333]"></div>
                <div className="text-center">
                  <p className="text-gray-400 font-medium tracking-widest uppercase text-[10px] mb-0.5">{ghostId ? "Ghost Pace" : "Pace"}</p>
                  <span className="font-display font-bold text-2xl text-white">{ghostId ? GhostPaceFormatted : PaceFormatted}</span>
                </div>
              </div>
            </motion.div>
          )}
        </AnimatePresence>
      </div>

      <div className="absolute bottom-0 md:bottom-6 inset-x-0 z-20 flex flex-col justify-end pointer-events-none">
        <div className="bg-black/80 backdrop-blur-2xl max-h-[85vh] border-t md:border border-[#222] p-6 md:p-8 rounded-t-[40px] md:rounded-[40px] flex flex-col transition-all duration-500 overflow-y-auto pointer-events-auto w-full md:w-[600px] mx-auto md:shadow-2xl md:shadow-black/50">
          <div className="w-12 h-1.5 bg-[#333] rounded-full mx-auto mb-6 md:hidden shrink-0" />

          {(workoutState === 'idle' || workoutState === 'finished') && (
            <div className="flex-1 flex flex-col md:justify-center mb-8 md:mb-0 shrink-0">
              {workoutState === 'idle' && (
                <div className="flex flex-wrap gap-3 justify-center mb-8">
                  <button onClick={() => setActivityType('run')} className={`px-6 py-2 rounded-full font-bold ${activityType === 'run' ? 'bg-white text-black font-bold' : 'bg-[#222] text-white'}`}>Run</button>
                  <button onClick={() => setActivityType('cycle')} className={`px-6 py-2 rounded-full font-bold ${activityType === 'cycle' ? 'bg-white text-black font-bold' : 'bg-[#222] text-white'}`}>Cycle</button>
                  <button onClick={() => setActivityType('walk')} className={`px-6 py-2 rounded-full font-bold ${activityType === 'walk' ? 'bg-white text-black font-bold' : 'bg-[#222] text-white'}`}>Walk</button>
                  <button onClick={() => setActivityType('hike')} className={`px-6 py-2 rounded-full font-bold ${activityType === 'hike' ? 'bg-white text-black font-bold' : 'bg-[#222] text-white'}`}>Hike</button>
                </div>
              )}
              <div className="text-center mb-10 shrink-0">
                <p className="text-gray-400 font-medium tracking-widest uppercase text-sm mb-2">
                  {workoutState === 'finished' ? 'Workout Summary' : 'Distance'}
                </p>
                <div className="flex items-baseline justify-center gap-1">
                  <span className="font-display font-bold text-7xl tracking-tighter text-white">{formatDistance(distance).replace(/[a-z]/g, '')}</span>
                  <span className="text-xl text-gray-500 font-medium">{formatDistance(distance).replace(/[\d.]/g, '')}</span>
                </div>
              </div>

              <div className="grid grid-cols-2 gap-4 px-2 md:px-0 shrink-0">
                <div className="text-center bg-[#111] p-4 rounded-2xl border border-[#222]">
                  <p className="text-gray-500 font-medium tracking-widest uppercase text-[10px] mb-1">Time</p>
                  <span className="font-display font-medium text-xl text-white">{formatTime(time)}</span>
                </div>
                <div className="text-center bg-[#111] p-4 rounded-2xl border border-[#222]">
                  <p className="text-gray-500 font-medium tracking-widest uppercase text-[10px] mb-1">
                    {activityType === 'cycle' ? 'Avg Speed' : 'Avg Pace'}
                  </p>
                  <span className="font-display font-medium text-xl text-white">
                    {activityType === 'cycle' 
                      ? (time > 0 ? (distance / (time / 3600)).toFixed(1) + ' km/h' : '0.0 km/h')
                      : PaceFormatted}
                  </span>
                </div>
                {workoutState === 'finished' && (
                   <>
                    <div className="text-center bg-[#111] p-4 rounded-2xl border border-[#222]">
                      <p className="text-gray-500 font-medium tracking-widest uppercase text-[10px] mb-1">Calories</p>
                      <span className="font-display font-medium text-xl text-white">{Math.floor(distance * 60)}</span>
                    </div>
                    <div className="text-center bg-[#111] p-4 rounded-2xl border border-[#222]">
                        <p className="text-gray-500 font-medium tracking-widest uppercase text-[10px] mb-1">Type</p>
                        <span className="font-display font-medium text-xl text-white capitalize">{activityType}</span>
                    </div>
                   </>
                )}
              </div>

              {workoutState === 'finished' && (
                <div className="mt-8 flex flex-col gap-6 shrink-0 w-full mb-8">
                  {calculatedSplits.length > 0 && (
                      <div>
                          <h5 className="text-gray-300 text-xs font-bold mb-3 uppercase tracking-wider">Splits: Pace & Elevation Change</h5>
                          <div className="h-40 w-full">
                            <ResponsiveContainer width="100%" height="100%">
                                <ComposedChart data={calculatedSplits}>
                                    <XAxis dataKey="split" axisLine={false} tickLine={false} tick={{ fill: '#666', fontSize: 10 }} />
                                    <YAxis yAxisId="left" hide domain={['auto', 'auto']} />
                                    <YAxis yAxisId="right" orientation="right" hide domain={['auto', 'auto']} />
                                    <Tooltip 
                                        contentStyle={{ backgroundColor: '#111', borderColor: '#333', borderRadius: '8px' }}
                                        itemStyle={{ color: '#fff' }}
                                        cursor={{ fill: '#ffffff10' }}
                                        formatter={(value: number, name: string) => {
                                            if (name === "elevationChange") return [`${value > 0 ? '+' : ''}${value.toFixed(1)} m`, "Elevation Change"];
                                            return [`${Math.floor(value)}'${Math.floor((value % 1) * 60).toString().padStart(2, '0')}"`, "Pace"];
                                        }}
                                        labelFormatter={(label) => `Split: ${label} km`}
                                    />
                                    <Legend wrapperStyle={{ fontSize: 10, paddingTop: 10 }} />
                                    <Bar yAxisId="left" dataKey="pace" fill="var(--color-brand-500)" radius={[4, 4, 0, 0]} name="Pace" />
                                    <Line yAxisId="right" type="monotone" dataKey="elevationChange" stroke="#4ade80" strokeWidth={2} dot={{ r: 3, fill: '#4ade80' }} name="Elevation Change" />
                                </ComposedChart>
                            </ResponsiveContainer>
                          </div>
                      </div>
                  )}

                  {routeData && routeData.length > 0 && (
                      <div>
                          <h5 className="text-gray-300 text-xs font-bold mb-3 uppercase tracking-wider">Elevation (m)</h5>
                          <div className="h-32 w-full">
                            <ResponsiveContainer width="100%" height="100%">
                                <AreaChart data={routeData}>
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
                </div>
              )}
            </div>
          )}

          <div className="flex items-center justify-center gap-4 mt-auto shrink-0 pt-4">
            <AnimatePresence mode="popLayout">
              {workoutState === 'idle' && (
                <motion.button
                  key="start-btn" initial={{ scale: 0.8, opacity: 0 }} animate={{ scale: 1, opacity: 1 }} exit={{ scale: 0.8, opacity: 0 }}
                  onClick={handleStart}
                  className="w-full max-w-[280px] bg-brand-500 text-black font-display font-bold text-xl py-5 rounded-full flex items-center justify-center gap-2 hover:bg-brand-400 active:scale-95 transition-all shadow-[0_0_40px_rgba(34,197,94,0.3)] border-4 border-black/10"
                >
                  <Play className="w-6 h-6 fill-black" /> START
                </motion.button>
              )}
              {(workoutState === 'tracking' || workoutState === 'paused') && (
                <motion.div key="tracking-controls" className="flex items-center justify-center gap-4 w-full" initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}>
                  <motion.button
                    initial={{ scale: 0.8, opacity: 0, x: 20 }} animate={{ scale: 1, opacity: 1, x: 0 }}
                    className="w-20 h-20 bg-[#222] text-white rounded-full flex items-center justify-center hover:bg-[#333] active:scale-95 transition-all border border-[#333]"
                    onClick={handleStop}
                  >
                    <Square className="w-8 h-8 fill-white" />
                  </motion.button>
                  <motion.button
                    initial={{ scale: 0.8, opacity: 0, x: -20 }} animate={{ scale: 1, opacity: 1, x: 0 }}
                    className={`w-28 h-28 text-black rounded-full flex items-center justify-center active:scale-95 transition-all shadow-[0_0_40px_rgba(255,255,255,0.1)] border-4 border-black/20 ${workoutState === 'paused' ? 'bg-accent-orange' : 'bg-brand-500'}`}
                    onClick={workoutState === 'paused' ? handleResume : handlePause}
                  >
                    {workoutState === 'paused' ? <Play className="w-10 h-10 fill-black" /> : <Pause className="w-10 h-10 fill-black" />}
                  </motion.button>
                </motion.div>
              )}
              {(workoutState === 'finished') && (
                 <motion.div key="finished-controls" className="flex flex-col md:flex-row items-center justify-center gap-4 w-full" initial={{ opacity: 0, y: 20 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0, y: 20 }}>
                  <button onClick={handleShareWorkout} className="w-full md:flex-1 bg-brand-500 text-black hover:bg-brand-400 font-display font-bold text-lg py-5 rounded-full flex items-center justify-center gap-2 active:scale-95 transition-all">
                    <Share2 className="w-5 h-5" /> SHARE
                  </button>
                  <button onClick={handleClose} className="w-full md:flex-1 bg-[#222] text-white hover:bg-[#333] font-display font-bold text-lg py-5 rounded-full flex items-center justify-center gap-2 active:scale-95 transition-all border border-[#333]">
                    <X className="w-5 h-5" /> CLOSE
                  </button>
                </motion.div>
              )}
            </AnimatePresence>
          </div>
        </div>
      </div>

      <ActivitySettingsModal 
        isOpen={isSettingsOpen} 
        onClose={() => setIsSettingsOpen(false)}
        onSave={saveSettings}
        paceThreshold={paceThreshold}
        distanceThreshold={distanceThreshold}
      />
    </div>
  );
}
