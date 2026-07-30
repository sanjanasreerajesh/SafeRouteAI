import { useEffect, useState } from "react";
import { getAccidentAlerts, subscribeAccidentAlerts, dedupeAlertsByEvent, type AccidentAlert } from "@/lib/accidentAlerts";

export function useAccidentAlerts() {
  const [alerts, setAlerts] = useState<AccidentAlert[]>(() => dedupeAlertsByEvent(getAccidentAlerts()));

  useEffect(() => {
    return subscribeAccidentAlerts((next) => setAlerts(dedupeAlertsByEvent(next)));
  }, []);

  return alerts;
}

