import React, { useState, useEffect, useRef } from "react";
import { Play, Pause, Square, MapPin, X, Signal } from "lucide-react";
import { MapContainer, TileLayer, Marker, Polyline, Popup, useMap } from "react-leaflet";
import { motion, AnimatePresence } from "framer-motion";
import L from "leaflet";
import "leaflet/dist/leaflet.css";
import { useAuth } from "@/src/components/auth/AuthProvider";
import { db } from "@/src/lib/firebase";
import { doc, setDoc, collection, serverTimestamp } from "firebase/firestore";
import { handleFirestoreError, OperationType } from "@/src/lib/firebase-error";

// Fix Leaflet marker icons with custom ones to avoid Vite import issues
const createCustomIcon = (color: string) => {
  return L.divIcon({
    className: "custom-marker",
    html: `
      <div style="
        background-color: ${color};
        width: 20px;
        height: 20px;
        border-radius: 50%;
        border: 3px solid white;
        box-shadow: 0 0 10px rgba(0,0,0,0.5);
      "></div>
    `,
    iconSize: [20, 20],
    iconAnchor: [10, 10],
  });
};

const startIcon = createCustomIcon("#22c55e");
const finishIcon = createCustomIcon("#ef4444");
const currentIcon = createCustomIcon("#f97316");

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

export default function Activity() {
  const { user } = useAuth();
  const [workoutState, setWorkoutState] = useState<'idle' | 'tracking' | 'paused' | 'finished'>('idle');
  const [activityType, setActivityType] = useState<'run' | 'cycle'>('run');
  const [time, setTime] = useState(0);
  const [distance, setDistance] = useState(0); // in km
  
  const triggerHaptics = (type: 'light' | 'medium' | 'heavy') => {
    if (navigator.vibrate) {
      switch (type) {
          case 'light': navigator.vibrate(50); break;
          case 'medium': navigator.vibrate(100); break;
          case 'heavy': navigator.vibrate(200); break;
      }
    }
  };

  // Tracking state
  const [routePath, setRoutePath] = useState<[number, number][]>([]);
  const [currentPosition, setCurrentPosition] = useState<[number, number] | null>(null);
  const [mapCenter, setMapCenter] = useState<[number, number]>([40.7812, -73.9665]);
  const watchIdRef = useRef<number | null>(null);
  const [isAutoCenter, setIsAutoCenter] = useState(true);
  const [gpsSignal, setGpsSignal] = useState<'strong' | 'medium' | 'weak'>('strong');
  const [currentActivityId, setCurrentActivityId] = useState<string | null>(null);
  const [showConfirmStop, setShowConfirmStop] = useState(false);
  const [paceThreshold, setPaceThreshold] = useState(5.0); // min/km
  const [distanceThreshold, setDistanceThreshold] = useState(1.0); // km
  const [alertTriggered, setAlertTriggered] = useState<string | null>(null);
  
  // Custom dark map tiles via CartoDB
  const mapboxUrl = "https://{s}.basemaps.cartocdn.com/dark_all/{z}/{x}/{y}{r}.png";

  // Initialize map center to user's current location on mount
  useEffect(() => {
    if (navigator.geolocation) {
      navigator.geolocation.getCurrentPosition((pos) => {
        const coords: [number, number] = [pos.coords.latitude, pos.coords.longitude];
        setMapCenter(coords);
        if (workoutState === 'idle') {
          setCurrentPosition(coords);
        }
      }, (err) => {
        console.error("Error getting initial location", err);
      });
    }
  }, []);

  useEffect(() => {
    let interval: any;
    if (workoutState === 'tracking') {
      interval = setInterval(() => {
        setTime(t => t + 1);
      }, 1000);

      if (navigator.geolocation) {
        watchIdRef.current = navigator.geolocation.watchPosition(
          (position) => {
            const { latitude, longitude, accuracy } = position.coords;
            const newPos: [number, number] = [latitude, longitude];
            
            if (accuracy <= 30) {
              setGpsSignal('strong');
            } else if (accuracy <= 100) {
              setGpsSignal('medium');
            } else {
              setGpsSignal('weak');
            }

            setCurrentPosition(newPos);
            
            setRoutePath(prev => {
              if (prev.length > 0) {
                const lastPos = prev[prev.length - 1];
                const d = getDistance(lastPos[0], lastPos[1], latitude, longitude);
                // Require at least 5 meters movement to add to path
                if (d > 0.005) {
                  const newDist = distance + d;

                  // Pace/Distance Alert Check
                  const currentPace = (time / 60) / (newDist || 1); // simple pace projection
                  if (newDist >= distanceThreshold && alertTriggered !== 'distance') {
                      triggerHaptics('heavy');
                      setAlertTriggered('distance');
                  } else if (currentPace <= paceThreshold && alertTriggered !== 'pace') {
                      triggerHaptics('heavy');
                      setAlertTriggered('pace');
                  }

                  setDistance(newDist);
                  return [...prev, newPos];
                }
                return prev;
              }
              return [newPos];
            });
          },
          (error) => {
            console.error("GPS error", error);
            setGpsSignal('weak');
          },
          { enableHighAccuracy: true, timeout: 5000, maximumAge: 0 }
        );
      }
    }
    
    return () => {
      clearInterval(interval);
      if (watchIdRef.current !== null) {
        navigator.geolocation.clearWatch(watchIdRef.current);
        watchIdRef.current = null;
      }
    };
  }, [workoutState]);

  const handleStart = async () => {
    triggerHaptics('medium');
    setWorkoutState('tracking');
    setRoutePath(currentPosition ? [currentPosition] : []);
    setTime(0);
    setDistance(0);
    setIsAutoCenter(true);
  };

  const handlePause = () => {
    triggerHaptics('light');
    setWorkoutState('paused');
  }
  const handleResume = () => {
    triggerHaptics('light');
    setWorkoutState('tracking');
  }
  
  const handleStop = async () => {
    setShowConfirmStop(true);
  };
  
  const performStop = async () => {
    triggerHaptics('heavy');
    setWorkoutState('finished');
    if (routePath.length > 0) {
      setCurrentPosition(routePath[routePath.length - 1]);
    }

    if (user) {
      try {
        const path = `activities`;
        const newDocRef = doc(collection(db, path));
        await setDoc(newDocRef, {
          userId: user.uid,
          distance: distance,
          timeSeconds: time,
          createdAt: serverTimestamp(),
          activityType: activityType,
          pace: time > 0 ? (time / 60) / distance : 0,
          status: 'finished',
          updatedAt: serverTimestamp(),
        });
        setCurrentActivityId(newDocRef.id);
      } catch (e) {
        handleFirestoreError(e, OperationType.CREATE, 'activities');
      }
    }
  };
  
  const handleClose = () => {
    setWorkoutState('idle');
    setRoutePath([]);
    setTime(0);
    setDistance(0);
    setCurrentActivityId(null);
    setShowConfirmStop(false);
    setAlertTriggered(null);
  };

  const currentPace = distance > 0 ? (time / 60) / distance : 0;
  const PaceFormatted = currentPace > 0 && currentPace < 60 ? `${Math.floor(currentPace)}'${Math.floor((currentPace % 1) * 60).toString().padStart(2, '0')}"` : "0'00\"";

  return (
    <div className="relative h-[100dvh] w-full bg-black overflow-hidden flex flex-col md:flex-row">
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
      
      {/* Map Area */}
      <div className="absolute inset-0 md:relative md:flex-1 z-0">
        <MapContainer 
          center={mapCenter} 
          zoom={15} 
          zoomControl={false}
          className="w-full h-full md:pb-0 pb-64"
        >
          <TileLayer url={mapboxUrl} attribution="&copy; OpenStreetMap &copy; CARTO" />
          
          <MapController position={currentPosition} isAutoCenter={isAutoCenter} setIsAutoCenter={setIsAutoCenter} />
          
          {routePath.length > 0 && (
            <Polyline positions={routePath} color="var(--color-brand-500)" weight={6} opacity={0.8} />
          )}

          {/* Interactive markers */}
          {(workoutState === 'finished') && routePath.length > 0 && (
            <>
              <InteractiveMarker 
                position={routePath[0]} 
                icon={startIcon} 
                label="Start" 
                setIsAutoCenter={setIsAutoCenter} 
              />
              <InteractiveMarker 
                position={routePath[routePath.length - 1]} 
                icon={finishIcon} 
                label="Finish" 
                setIsAutoCenter={setIsAutoCenter} 
              />
            </>
          )}
          
          {/* Current Position Marker */}
          {currentPosition && workoutState !== 'finished' && (
            <Marker position={currentPosition} icon={currentIcon} />
          )}

        </MapContainer>

        {/* Recenter Button */}
        {!isAutoCenter && currentPosition && workoutState !== 'finished' && workoutState !== 'idle' && (
          <div className="absolute bottom-[280px] md:bottom-8 right-6 z-[400]">
            <motion.button 
              initial={{ opacity: 0, scale: 0.8 }}
              animate={{ opacity: 1, scale: 1 }}
              onClick={() => setIsAutoCenter(true)}
              className="bg-[#22c55e] text-black w-12 h-12 rounded-full flex items-center justify-center shadow-[0_0_20px_rgba(34,197,94,0.3)] hover:scale-105 active:scale-95 transition-all"
            >
              <MapPin className="w-5 h-5 fill-black" />
            </motion.button>
          </div>
        )}
        
        {/* GPS Signal Indicator */}
        {(workoutState === 'tracking' || workoutState === 'paused') && (
          <div className="absolute top-20 md:top-8 left-4 md:left-8 z-[400]">
            <motion.div 
              initial={{ opacity: 0, scale: 0.8 }}
              animate={{ opacity: 1, scale: 1 }}
              className={`flex items-center gap-1.5 px-3 py-1.5 rounded-full backdrop-blur-xl border border-[#333]/50 shadow-lg ${
                gpsSignal === 'strong' ? 'bg-[#22c55e]/10 text-[#22c55e]' : 
                gpsSignal === 'medium' ? 'bg-yellow-500/10 text-yellow-500' : 
                'bg-red-500/10 text-red-500'
              }`}
            >
              <Signal className="w-4 h-4" />
              <span className="text-xs font-semibold tracking-wider uppercase">
                GPS {gpsSignal === 'strong' ? 'Strong' : gpsSignal === 'medium' ? 'Fair' : 'Weak'}
              </span>
            </motion.div>
          </div>
        )}
        
        {/* Gradient overlays for seamless blend */}
        <div className="absolute top-0 inset-x-0 h-32 bg-gradient-to-b from-black/80 to-transparent z-10 pointer-events-none md:hidden" />

        {/* HUD overlay when tracking */}
        <AnimatePresence>
          {(workoutState === 'tracking' || workoutState === 'paused') && (
            <motion.div 
              initial={{ y: -100, opacity: 0 }}
              animate={{ y: 0, opacity: 1 }}
              exit={{ y: -100, opacity: 0 }}
              className="absolute top-8 inset-x-4 md:left-[20%] md:right-[20%] z-[400] bg-black/80 backdrop-blur-xl border border-[#222] rounded-3xl p-4 flex items-center justify-around shadow-[0_10px_40px_rgba(0,0,0,0.8)]"
            >
              <div className="text-center">
                <p className="text-gray-400 font-medium tracking-widest uppercase text-[10px] mb-0.5">Time</p>
                <span className="font-display font-bold text-2xl text-white">{formatTime(time)}</span>
              </div>
              <div className="w-px h-8 bg-[#333]"></div>
              <div className="text-center">
                <p className="text-gray-400 font-medium tracking-widest uppercase text-[10px] mb-0.5">Dist (km)</p>
                <span className="font-display font-bold text-2xl text-white">{distance.toFixed(2)}</span>
              </div>
              <div className="w-px h-8 bg-[#333]"></div>
              <div className="text-center">
                <p className="text-gray-400 font-medium tracking-widest uppercase text-[10px] mb-0.5">Pace</p>
                <span className="font-display font-bold text-2xl text-white">{PaceFormatted}</span>
              </div>
            </motion.div>
          )}
        </AnimatePresence>
      </div>

      {/* Tracking overlay */}
      <div className="absolute bottom-20 md:bottom-0 inset-x-0 md:relative md:w-[400px] md:h-full z-20 flex flex-col justify-end md:justify-start">
        
        <div className="bg-black/80 md:bg-[#0a0a0a] backdrop-blur-2xl md:h-full border-t md:border-t-0 md:border-l border-[#222] p-6 md:p-8 rounded-t-[40px] md:rounded-none flex flex-col transition-all duration-500">
          
          <div className="w-12 h-1.5 bg-[#333] rounded-full mx-auto mb-8 md:hidden" />

          {/* Stats Display */}
          {(workoutState === 'idle' || workoutState === 'finished') && (
            <div className="flex-1 flex flex-col md:justify-center mb-8 md:mb-0">
              {workoutState === 'idle' && (
                <div className="flex gap-4 justify-center mb-8">
                  <button onClick={() => setActivityType('run')} className={`px-6 py-2 rounded-full font-bold ${activityType === 'run' ? 'bg-white text-black' : 'bg-[#222] text-white'}`}>Run</button>
                  <button onClick={() => setActivityType('cycle')} className={`px-6 py-2 rounded-full font-bold ${activityType === 'cycle' ? 'bg-white text-black' : 'bg-[#222] text-white'}`}>Cycle</button>
                </div>
              )}
              <div className="text-center mb-10">
                <p className="text-gray-400 font-medium tracking-widest uppercase text-sm mb-2">
                  {workoutState === 'finished' ? 'Workout Summary' : 'Distance'}
                </p>
                <div className="flex items-baseline justify-center gap-1">
                  <span className="font-display font-bold text-7xl tracking-tighter text-white">{distance.toFixed(2)}</span>
                  <span className="text-xl text-gray-500 font-medium">km</span>
                </div>
              </div>

              <div className="grid grid-cols-2 gap-4 px-6 md:grid-cols-2">
                <div className="text-center bg-[#111] p-4 rounded-2xl">
                  <p className="text-gray-500 font-medium tracking-widest uppercase text-[10px] mb-1">Time</p>
                  <span className="font-display font-medium text-xl text-white">{formatTime(time)}</span>
                </div>
                <div className="text-center bg-[#111] p-4 rounded-2xl">
                  <p className="text-gray-500 font-medium tracking-widest uppercase text-[10px] mb-1">Avg Pace</p>
                  <span className="font-display font-medium text-xl text-white">{PaceFormatted}</span>
                </div>
                {workoutState === 'finished' && (
                   <>
                    <div className="text-center bg-[#111] p-4 rounded-2xl">
                      <p className="text-gray-500 font-medium tracking-widest uppercase text-[10px] mb-1">Calories</p>
                      <span className="font-display font-medium text-xl text-white">{Math.floor(distance * 60)}</span>
                    </div>
                    <div className="text-center bg-[#111] p-4 rounded-2xl">
                        <p className="text-gray-500 font-medium tracking-widest uppercase text-[10px] mb-1">Type</p>
                        <span className="font-display font-medium text-xl text-white capitalize">{activityType}</span>
                    </div>
                   </>
                )}
              </div>
            </div>
          )}

          {/* Controls */}
          <div className="flex items-center justify-center gap-4 mt-auto">
            <AnimatePresence mode="popLayout">
              {workoutState === 'idle' && (
                <motion.button
                  key="start-btn"
                  initial={{ scale: 0.8, opacity: 0 }}
                  animate={{ scale: 1, opacity: 1 }}
                  exit={{ scale: 0.8, opacity: 0 }}
                  onClick={handleStart}
                  className="w-full max-w-[280px] bg-brand-500 text-black font-display font-bold text-xl py-5 rounded-full flex items-center justify-center gap-2 hover:bg-brand-400 active:scale-95 transition-all shadow-[0_0_40px_rgba(34,197,94,0.3)]"
                >
                  <Play className="w-6 h-6 fill-black" /> START WORKOUT
                </motion.button>
              )}

              {(workoutState === 'tracking' || workoutState === 'paused') && (
                <motion.div
                  key="tracking-controls"
                  className="flex items-center justify-center gap-4 w-full"
                  initial={{ opacity: 0 }}
                  animate={{ opacity: 1 }}
                  exit={{ opacity: 0 }}
                >
                  <motion.button
                    initial={{ scale: 0.8, opacity: 0, x: 20 }}
                    animate={{ scale: 1, opacity: 1, x: 0 }}
                    className="w-20 h-20 bg-[#222] text-white rounded-full flex items-center justify-center hover:bg-[#333] active:scale-95 transition-all"
                    onClick={handleStop}
                  >
                    <Square className="w-8 h-8 fill-white" />
                  </motion.button>
                  <motion.button
                    initial={{ scale: 0.8, opacity: 0, x: -20 }}
                    animate={{ scale: 1, opacity: 1, x: 0 }}
                    className={`w-28 h-28 text-black rounded-full flex items-center justify-center active:scale-95 transition-all shadow-[0_0_40px_rgba(255,255,255,0.1)] ${workoutState === 'paused' ? 'bg-accent-orange' : 'bg-brand-500'}`}
                    onClick={workoutState === 'paused' ? handleResume : handlePause}
                  >
                    {workoutState === 'paused' ? <Play className="w-10 h-10 fill-black" /> : <Pause className="w-10 h-10 fill-black" />}
                  </motion.button>
                </motion.div>
              )}

              {(workoutState === 'finished') && (
                 <motion.div
                 key="finished-controls"
                 className="flex items-center justify-center gap-4 w-full"
                 initial={{ opacity: 0, y: 20 }}
                 animate={{ opacity: 1, y: 0 }}
                 exit={{ opacity: 0, y: 20 }}
               >
                 <button
                   onClick={handleClose}
                   className="flex-1 bg-[#222] text-white hover:bg-[#333] font-display font-bold text-lg py-5 rounded-full flex items-center justify-center gap-2 active:scale-95 transition-all"
                 >
                   <X className="w-5 h-5" /> 
                   CLOSE
                 </button>
               </motion.div>
              )}
            </AnimatePresence>
          </div>
        </div>
      </div>
    </div>
  );
}
