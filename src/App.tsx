/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import { BrowserRouter, Routes, Route } from "react-router-dom";
import AppLayout from "@/src/components/layout/AppLayout";
import Dashboard from "@/src/pages/Dashboard";
import Activity from "@/src/pages/Activity";
import Runs from "@/src/pages/Runs";
import RunDetails from "@/src/pages/RunDetails";
import Community from "@/src/pages/Community";
import Profile from "@/src/pages/Profile";
import { AuthProvider } from "@/src/components/auth/AuthProvider";
import { WorkoutProvider } from "@/src/components/WorkoutProvider";
import Messages from "@/src/pages/Messages";

export default function App() {
  return (
    <AuthProvider>
      <WorkoutProvider>
        <BrowserRouter>
          <Routes>
            <Route element={<AppLayout />}>
              <Route path="/" element={<Dashboard />} />
              <Route path="/activity" element={<Activity />} />
              <Route path="/community" element={<Community />} />
              <Route path="/runs" element={<Runs />} />
              <Route path="/runs/:runId" element={<RunDetails />} />
              <Route path="/profile" element={<Profile />} />
              <Route path="/profile/:userId" element={<Profile />} />
            </Route>
            <Route path="/messages" element={<Messages />} />
          </Routes>
        </BrowserRouter>
      </WorkoutProvider>
    </AuthProvider>
  );
}
