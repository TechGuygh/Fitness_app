import React, { createContext, useContext, useState, useEffect, useRef } from "react";
import { db } from "@/src/lib/firebase";
import { doc, setDoc, collection, serverTimestamp } from "firebase/firestore";
import { handleFirestoreError, OperationType } from "@/src/lib/firebase-error";
import { useAuth } from "@/src/components/auth/AuthProvider";
import { KalmanFilter } from "@/src/lib/KalmanFilter";

interface WorkoutContextType {
  workoutState: "idle" | "tracking" | "paused" | "finished";
  activityType: "run" | "cycle" | "walk" | "hike";
  time: number;
  distance: number;
  routePath: [number, number][];
  routeData: {lat: number, lon: number, altitude: number, timeSeconds: number, distance: number}[];
  currentPosition: [number, number] | null;
  gpsSignal: "strong" | "medium" | "weak";
  autoPaused: boolean;
  startWorkout: (type: "run" | "cycle" | "walk" | "hike") => void;
  pauseWorkout: () => void;
  resumeWorkout: () => void;
  stopWorkout: () => Promise<string | null>;
  resetWorkout: () => void;
  setActivityType: (type: "run" | "cycle" | "walk" | "hike") => void;
}

const WorkoutContext = createContext<WorkoutContextType | undefined>(undefined);

function deg2rad(deg: number) {
  return deg * (Math.PI / 180);
}

function getDistance(lat1: number, lon1: number, lat2: number, lon2: number) {
  const R = 6371;
  const dLat = deg2rad(lat2 - lat1);
  const dLon = deg2rad(lon2 - lon1);
  const a =
    Math.sin(dLat / 2) * Math.sin(dLat / 2) +
    Math.cos(deg2rad(lat1)) * Math.cos(deg2rad(lat2)) *
    Math.sin(dLon / 2) * Math.sin(dLon / 2);
  const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
  return R * c;
}

export function WorkoutProvider({ children }: { children: React.ReactNode }) {
  const { user } = useAuth();
  const [workoutState, setWorkoutState] = useState<"idle" | "tracking" | "paused" | "finished">("idle");
  const [activityType, setActivityType] = useState<"run" | "cycle" | "walk" | "hike">("run");
  const [time, setTime] = useState(0);
  const [distance, setDistance] = useState(0);
  const [routePath, setRoutePath] = useState<[number, number][]>([]);
  const [routeData, setRouteData] = useState<{lat: number, lon: number, altitude: number, timeSeconds: number, distance: number}[]>([]);
  const [currentPosition, setCurrentPosition] = useState<[number, number] | null>(null);
  const [gpsSignal, setGpsSignal] = useState<"strong" | "medium" | "weak">("strong");
  const [autoPaused, setAutoPaused] = useState(false);
  
  const watchIdRef = useRef<number | null>(null);
  const lastMovementTimeRef = useRef(Date.now());
  const kalmanLat = useRef(new KalmanFilter());
  const kalmanLon = useRef(new KalmanFilter());
  const currentPosRef = useRef<[number, number] | null>(null);
  const distanceRef = useRef(0);
  const timeRef = useRef(0);

  useEffect(() => {
     currentPosRef.current = currentPosition;
  }, [currentPosition]);

  useEffect(() => {
    distanceRef.current = distance;
  }, [distance]);

  useEffect(() => {
    timeRef.current = time;
  }, [time]);

  useEffect(() => {
     let liveTrackingInterval: any;
     if (workoutState === "tracking" && user) {
        const queryParams = new URLSearchParams(window.location.search);
        const ghostId = queryParams.get("ghostId");
        const runId = queryParams.get("runId");
        const activeId = ghostId || runId;

        if (activeId) {
            const updateLiveStatus = async () => {
                if (!currentPosRef.current) return;
                try {
                    await setDoc(doc(db, "liveTracking", user.uid), {
                        userId: user.uid,
                        userName: user.displayName || user.email?.split('@')[0] || "Athlete",
                        photoURL: user.photoURL || null,
                        routeId: activeId,
                        position: currentPosRef.current,
                        distance: distanceRef.current,
                        time: timeRef.current,
                        updatedAt: serverTimestamp()
                    }, { merge: true });
                } catch (err) {
                    console.error("Live tracking update error", err);
                }
            };
            liveTrackingInterval = setInterval(updateLiveStatus, 5000);
            updateLiveStatus();
        }
     }

     return () => {
         if (liveTrackingInterval) clearInterval(liveTrackingInterval);
     };
  }, [workoutState, user]);

  useEffect(() => {
    let interval: any;
    if (workoutState === "tracking") {
      interval = setInterval(() => {
        setTime((t) => t + 1);
      }, 1000);

      if (navigator.geolocation) {
        watchIdRef.current = navigator.geolocation.watchPosition(
          (position) => {
            const { latitude, longitude, accuracy } = position.coords;
            
            // Use Kalman filter to smooth coordinates
            const smoothedLat = kalmanLat.current.filter(latitude);
            const smoothedLon = kalmanLon.current.filter(longitude);
            const newPos: [number, number] = [smoothedLat, smoothedLon];

            if (accuracy <= 15) setGpsSignal("strong");
            else if (accuracy <= 40) setGpsSignal("medium");
            else setGpsSignal("weak");

            setCurrentPosition(newPos);

            setRoutePath((prev) => {
              if (prev.length > 0) {
                const lastPos = prev[prev.length - 1];
                // Calculate distance using smoothed positions for better accuracy
                const d = getDistance(lastPos[0], lastPos[1], smoothedLat, smoothedLon);
                
                // Only add point if moved significantly (5 meters) to filter out jitter
                if (d > 0.005) {
                  lastMovementTimeRef.current = Date.now();
                  setDistance((prevDist) => {
                    const newDist = prevDist + d;
                    setRouteData((pd) => [...pd, { lat: smoothedLat, lon: smoothedLon, altitude: position.coords.altitude || 0, timeSeconds: timeRef.current, distance: newDist }]);
                    return newDist;
                  });
                  return [...prev, newPos];
                }
                return prev;
              }
              setRouteData([{ lat: smoothedLat, lon: smoothedLon, altitude: position.coords.altitude || 0, timeSeconds: timeRef.current, distance: 0 }]);
              return [newPos];
            });
          },
          (error) => {
            console.error("GPS error", error);
            setGpsSignal("weak");
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

  useEffect(() => {
    const interval = setInterval(() => {
      if (workoutState === "tracking") {
        if (Date.now() - lastMovementTimeRef.current > 30000) {
          setAutoPaused(true);
          setWorkoutState("paused");
        }
      }
    }, 5000);
    return () => clearInterval(interval);
  }, [workoutState]);

  const startWorkout = (type: "run" | "cycle" | "walk" | "hike") => {
    setActivityType(type);
    setWorkoutState("tracking");
    setRoutePath(currentPosition ? [currentPosition] : []);
    setRouteData(currentPosition ? [{lat: currentPosition[0], lon: currentPosition[1], altitude: 0, timeSeconds: 0, distance: 0}] : []);
    setTime(0);
    setDistance(0);
    // Reset filters for new session
    kalmanLat.current.reset();
    kalmanLon.current.reset();
    lastMovementTimeRef.current = Date.now();
    setAutoPaused(false);
  };

  const pauseWorkout = () => setWorkoutState("paused");
  const resumeWorkout = () => {
    setWorkoutState("tracking");
    setAutoPaused(false);
    lastMovementTimeRef.current = Date.now();
  };

  const stopWorkout = async () => {
    setWorkoutState("finished");
    if (user) {
      try {
        const queryParams = new URLSearchParams(window.location.search);
        const ghostId = queryParams.get("ghostId");

        // Remove live tracking
        import("firebase/firestore").then(({ deleteDoc }) => {
            deleteDoc(doc(db, "liveTracking", user.uid)).catch(console.error);
        });

        // Calculate splits (per 1 km)
        const splits: any[] = [];
        let nextSplitDist = 1;
        let lastSplitTime = 0;
        let lastSplitAlt = routeData[0]?.altitude || 0;
        
        for (const pt of routeData) {
          if (pt.distance >= nextSplitDist) {
            splits.push({
              split: nextSplitDist,
              timeSeconds: pt.timeSeconds - lastSplitTime,
              pace: (pt.timeSeconds - lastSplitTime) / 60,
              elevationChange: pt.altitude - lastSplitAlt
            });
            nextSplitDist++;
            lastSplitTime = pt.timeSeconds;
            lastSplitAlt = pt.altitude;
          }
        }
        // Add final uncompleted split if we have remaining distance > 0.05 km
        if (distance > nextSplitDist - 1 + 0.05) {
          const remDist = distance - (nextSplitDist - 1);
          splits.push({
            split: nextSplitDist,
            timeSeconds: time - lastSplitTime,
            pace: (time - lastSplitTime) / 60 / remDist,
            elevationChange: (routeData[routeData.length-1]?.altitude || 0) - lastSplitAlt,
            isPartial: true,
            partialDistance: remDist
          });
        }

        const newDocRef = doc(collection(db, "activities"));
        await setDoc(newDocRef, {
          userId: user.uid,
          distance,
          timeSeconds: time,
          createdAt: serverTimestamp(),
          activityType,
          pace: time > 0 ? (time / 60) / distance : 0,
          status: "finished",
          updatedAt: serverTimestamp(),
          route: routePath.map(p => ({ lat: p[0], lng: p[1] })),
          routeData,
          splits,
          ...(ghostId ? { routeId: ghostId } : {})
        });
        return newDocRef.id;
      } catch (e) {
        handleFirestoreError(e, OperationType.CREATE, "activities");
      }
    }
    return null;
  };

  const resetWorkout = () => {
    setWorkoutState("idle");
    setRoutePath([]);
    setRouteData([]);
    setTime(0);
    setDistance(0);
    kalmanLat.current.reset();
    kalmanLon.current.reset();
    setAutoPaused(false);
  };

  return (
    <WorkoutContext.Provider
      value={{
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
      }}
    >
      {children}
    </WorkoutContext.Provider>
  );
}

export const useWorkout = () => {
  const context = useContext(WorkoutContext);
  if (context === undefined) {
    throw new Error("useWorkout must be used within a WorkoutProvider");
  }
  return context;
};
