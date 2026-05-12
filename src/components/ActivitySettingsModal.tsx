import React from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { X } from 'lucide-react';

interface SettingsModalProps {
  isOpen: boolean;
  onClose: () => void;
  paceThreshold: number;
  setPaceThreshold: (val: number) => void;
  distanceThreshold: number;
  setDistanceThreshold: (val: number) => void;
}

export default function ActivitySettingsModal({
  isOpen,
  onClose,
  paceThreshold,
  setPaceThreshold,
  distanceThreshold,
  setDistanceThreshold
}: SettingsModalProps) {
  if (!isOpen) return null;

  return (
    <AnimatePresence>
      {isOpen && (
        <motion.div
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          exit={{ opacity: 0 }}
          className="fixed inset-0 z-[2000] bg-black/80 backdrop-blur-md flex items-center justify-center p-6"
        >
          <motion.div
            initial={{ scale: 0.9, opacity: 0 }}
            animate={{ scale: 1, opacity: 1 }}
            exit={{ scale: 0.9, opacity: 0 }}
            className="bg-[#111] border border-[#333] p-8 rounded-3xl w-full max-w-sm"
          >
            <div className="flex justify-between items-center mb-6">
              <h3 className="text-xl font-bold text-white">Workout Settings</h3>
              <button onClick={onClose} className="text-gray-500 hover:text-white">
                <X className="w-6 h-6" />
              </button>
            </div>
            
            <div className="space-y-6">
              <div>
                <label className="text-gray-400 text-sm block mb-2">Pace Alert (min/km)</label>
                <input 
                  type="number" 
                  value={paceThreshold} 
                  onChange={(e) => setPaceThreshold(parseFloat(e.target.value))}
                  className="w-full p-4 bg-[#222] rounded-xl text-white outline-none"
                />
              </div>
              
              <div>
                <label className="text-gray-400 text-sm block mb-2">Distance Alert (km)</label>
                <input 
                  type="number" 
                  value={distanceThreshold} 
                  onChange={(e) => setDistanceThreshold(parseFloat(e.target.value))}
                  className="w-full p-4 bg-[#222] rounded-xl text-white outline-none"
                />
              </div>

              <button onClick={onClose} className="w-full py-4 bg-brand-500 text-black font-bold rounded-full">Save Changes</button>
            </div>
          </motion.div>
        </motion.div>
      )}
    </AnimatePresence>
  );
}
