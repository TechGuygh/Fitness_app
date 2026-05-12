import React, { createContext, useContext, useState, useEffect, useRef } from "react";
import { db } from "@/src/lib/firebase";
import { doc, setDoc, collection, serverTimestamp } from "firebase/firestore";
import { handleFirestoreError, OperationType } from "@/src/lib/firebase-error";
import { useAuth } from "@/src/components/auth/AuthProvider";
import { KalmanFilter } from "@/src/lib/KalmanFilter";

interface WorkoutContextType {
  workoutState: "idle" | "tracking" | "paused" | "finished";
  activityType: "run" | "cycle";
  time: number;
  distance: number;
  routePath: [number, number][];
  currentPosition: [number, number] | null;
  gpsSignal: "strong" | "medium" | "weak";
  autoPaused: boolean;
  startWorkout: (type: "run" | "cycle") => void;
  pauseWorkout: () => void;
  resumeWorkout: () => void;
  stopWorkout: () => Promise<string | null>;
  resetWorkout: () => void;
  setActivityType: (type: "run" | "cycle") => void;
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
  const [activityType, setActivityType] = useState<"run" | "cycle">("run");
  const [time, setTime] = useState(0);
  const [distance, setDistance] = useState(0);
  const [routePath, setRoutePath] = useState<[number, number][]>([]);
  const [currentPosition, setCurrentPosition] = useState<[number, number] | null>(null);
  const [gpsSignal, setGpsSignal] = useState<"strong" | "medium" | "weak">("strong");
  const [autoPaused, setAutoPaused] = useState(false);
  
  const watchIdRef = useRef<number | null>(null);
  const lastMovementTimeRef = useRef(Date.now());
  const kalmanLat = useRef(new KalmanFilter());
  const kalmanLon = useRef(new KalmanFilter());

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
            const smoothedLat = kalmanLat.current.filter(latitude);
            const smoothedLon = kalmanLon.current.filter(longitude);
            const newPos: [number, number] = [smoothedLat, smoothedLon];

            if (accuracy <= 30) setGpsSignal("strong");
            else if (accuracy <= 100) setGpsSignal("medium");
            else setGpsSignal("weak");

            setCurrentPosition(newPos);

            setRoutePath((prev) => {
              if (prev.length > 0) {
                const lastPos = prev[prev.length - 1];
                const d = getDistance(lastPos[0], lastPos[1], latitude, longitude);
                if (d > 0.005) {
                  lastMovementTimeRef.current = Date.now();
                  setDistance((prevDist) => prevDist + d);
                  return [...prev, newPos];
                }
                return prev;
              }
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

  const startWorkout = (type: "run" | "cycle") => {
    setActivityType(type);
    setWorkoutState("tracking");
    setRoutePath(currentPosition ? [currentPosition] : []);
    setTime(0);
    setDistance(0);
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
          route: routePath,
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
    setTime(0);
    setDistance(0);
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
