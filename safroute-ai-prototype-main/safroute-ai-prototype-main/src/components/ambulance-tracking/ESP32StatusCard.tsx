import { Cpu, Power, Wifi, WifiOff } from "lucide-react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import type { ESP32ControllerStatus } from "@/types/traffic";

interface ESP32StatusCardProps {
  status: ESP32ControllerStatus;
  onToggleConnection: () => void;
}

function Dot({ ok }: { ok: boolean }) {
  return (
    <span
      className={`inline-block h-2.5 w-2.5 rounded-full ${
        ok ? "bg-green-500 shadow-[0_0_6px_2px_rgba(34,197,94,0.6)]" : "bg-red-500 shadow-[0_0_6px_2px_rgba(239,68,68,0.5)]"
      }`}
    />
  );
}

const ESP32StatusCard = ({ status, onToggleConnection }: ESP32StatusCardProps) => {
  const lastUpdated = new Date(status.lastUpdatedIso).toLocaleTimeString([], {
    hour: "2-digit",
    minute: "2-digit",
    second: "2-digit",
  });

  return (
    <Card className="border-l-4 border-l-primary">
      <CardHeader className="pb-2">
        <div className="flex items-center justify-between">
          <CardTitle className="flex items-center gap-2 text-lg">
            <Cpu className="h-5 w-5 text-primary" />
            ESP32 Traffic Controller
          </CardTitle>
          <Button type="button" size="sm" variant="outline" className="h-8 px-3 text-sm" onClick={onToggleConnection}>
            <Power className="h-3.5 w-3.5 mr-1.5" />
            {status.online ? "Disconnect" : "Connect"}
          </Button>
        </div>
      </CardHeader>
      <CardContent>
        <div className="grid grid-cols-2 gap-y-3 gap-x-4 text-base">
          <div>
            <p className="text-sm text-muted-foreground">Controller ID</p>
            <p className="font-mono">{status.controllerId}</p>
          </div>
          <div>
            <p className="text-sm text-muted-foreground">Connection</p>
            <p className="flex items-center gap-1.5 font-semibold">
              <Dot ok={status.online} />
              {status.online ? "ONLINE" : "OFFLINE"}
            </p>
          </div>
          <div>
            <p className="text-sm text-muted-foreground">WiFi</p>
            <p className="flex items-center gap-1.5 font-semibold">
              {status.online ? <Wifi className="h-4 w-4 text-green-600" /> : <WifiOff className="h-4 w-4 text-red-600" />}
              {status.wifiStatus}
            </p>
          </div>
          <div>
            <p className="text-sm text-muted-foreground">IP Address</p>
            <p className="font-mono">{status.ip}</p>
          </div>
          <div className="col-span-2">
            <p className="text-sm text-muted-foreground">Last Command</p>
            <p className="font-mono text-primary text-sm">{status.lastCommand}</p>
          </div>
          <div>
            <p className="text-sm text-muted-foreground">Response Time</p>
            <p className="font-semibold">{status.responseTimeMs} ms</p>
          </div>
          <div>
            <p className="text-sm text-muted-foreground">Last Updated</p>
            <p className="font-mono">{lastUpdated}</p>
          </div>
        </div>
      </CardContent>
    </Card>
  );
};

export default ESP32StatusCard;
