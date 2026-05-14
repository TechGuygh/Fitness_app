import React, { useState, useEffect } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { X, Save } from 'lucide-react';

interface SettingsModalProps {
  isOpen: boolean;
  onClose: () => void;
  onSave: (pace: number, dist: number) => Promise<void>;
  paceThreshold: number;
  distanceThreshold: number;
}

export default function ActivitySettingsModal({
  isOpen,
  onClose,
  onSave,
  paceThreshold,
  distanceThreshold
}: SettingsModalProps) {
  const [localPace, setLocalPace] = useState(paceThreshold);
  const [localDist, setLocalDist] = useState(distanceThreshold);
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    if (isOpen) {
      setLocalPace(paceThreshold);
      setLocalDist(distanceThreshold);
    }
  }, [isOpen, paceThreshold, distanceThreshold]);

  if (!isOpen) return null;

  const handleSave = async () => {
    setSaving(true);
    await onSave(localPace, localDist);
    setSaving(false);
  };

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
                  step="0.1"
                  value={Number.isNaN(localPace) ? '' : localPace} 
                  onChange={(e) => setLocalPace(e.target.value ? parseFloat(e.target.value) : NaN)}
                  className="w-full p-4 bg-[#222] rounded-xl text-white outline-none border border-transparent focus:border-brand-500 transition-colors"
                />
              </div>
              
              <div>
                <label className="text-gray-400 text-sm block mb-2">Distance Alert (km)</label>
                <input 
                  type="number" 
                  step="0.1"
                  value={Number.isNaN(localDist) ? '' : localDist} 
                  onChange={(e) => setLocalDist(e.target.value ? parseFloat(e.target.value) : NaN)}
                  className="w-full p-4 bg-[#222] rounded-xl text-white outline-none border border-transparent focus:border-brand-500 transition-colors"
                />
              </div>

              <button 
                onClick={handleSave} 
                disabled={saving}
                className="w-full py-4 bg-brand-500 text-black font-bold rounded-full flex items-center justify-center gap-2 hover:bg-brand-400 disabled:opacity-50 transition-all"
              >
                {saving ? (
                  <div className="w-5 h-5 rounded-full border-2 border-black border-t-transparent animate-spin"></div>
                ) : (
                  <>
                    <Save className="w-4 h-4" />
                    Save Settings
                  </>
                )}
              </button>
            </div>
          </motion.div>
        </motion.div>
      )}
    </AnimatePresence>
  );
}
