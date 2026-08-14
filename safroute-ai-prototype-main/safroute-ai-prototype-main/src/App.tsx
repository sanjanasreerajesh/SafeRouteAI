import { Toaster } from "@/components/ui/toaster";
import { Toaster as Sonner } from "@/components/ui/sonner";
import { TooltipProvider } from "@/components/ui/tooltip";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { BrowserRouter, Routes, Route } from "react-router-dom";
import Layout from "./components/Layout";
import Dashboard from "./pages/Dashboard";
import Alerts from "./pages/Alerts";
import History from "./pages/History";
import Analytics from "./pages/Analytics";
import Index from "./pages/Index";
import NotFound from "./pages/NotFound";
import HospitalDashboard from "./pages/HospitalDashboard";
import PoliceDashboard from "./pages/PoliceDashboard";
import AmbulanceTrackingPage from "./pages/AmbulanceTrackingPage";

const queryClient = new QueryClient();

const App = () => (
  <QueryClientProvider client={queryClient}>
    <TooltipProvider>
      <Toaster />
      <Sonner />
      <BrowserRouter>
        <Routes>
          <Route path="/welcome" element={<Index />} />
          <Route element={<Layout><Dashboard /></Layout>} path="/" />
          <Route element={<Layout><Alerts /></Layout>} path="/alerts" />
          <Route element={<Layout><History /></Layout>} path="/history" />
          <Route element={<Layout><Analytics /></Layout>} path="/analytics" />
          <Route element={<Layout><HospitalDashboard /></Layout>} path="/hospital" />
          <Route element={<Layout><PoliceDashboard /></Layout>} path="/police" />
          <Route element={<Layout><AmbulanceTrackingPage /></Layout>} path="/ambulance-tracking" />
          {/* ADD ALL CUSTOM ROUTES ABOVE THE CATCH-ALL "*" ROUTE */}
          <Route path="*" element={<NotFound />} />
        </Routes>
      </BrowserRouter>
    </TooltipProvider>
  </QueryClientProvider>
);

export default App;
