import { Terminal } from "lucide-react";

import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import type { CommandLogEntry } from "@/types/traffic";

const STATUS_COLOR: Record<CommandLogEntry["status"], string> = {
  SUCCESS: "text-green-600",
  PENDING: "text-yellow-600",
  FAILED: "text-red-600",
};

interface CommandLogProps {
  entries: CommandLogEntry[];
}

const CommandLog = ({ entries }: CommandLogProps) => {
  return (
    <Card className="border-l-4 border-l-primary h-full flex flex-col">
      <CardHeader className="pb-2">
        <CardTitle className="flex items-center gap-2 text-lg">
          <Terminal className="h-5 w-5 text-primary" />
          Live Command Log
        </CardTitle>
      </CardHeader>
      <CardContent className="flex-1 overflow-hidden">
        <div className="h-full overflow-y-auto space-y-2 pr-1 font-mono text-sm max-h-72">
          {entries.length === 0 ? (
            <p className="text-muted-foreground">No commands yet — start the simulation to see live ESP32 traffic.</p>
          ) : (
            entries.map((entry) => (
              <div key={entry.id} className="rounded border bg-muted/40 px-2.5 py-1.5">
                <div className="flex items-center justify-between">
                  <span className="text-muted-foreground">
                    {new Date(entry.timestampIso).toLocaleTimeString([], {
                      hour: "2-digit",
                      minute: "2-digit",
                      second: "2-digit",
                    })}
                  </span>
                  <span className={`font-semibold ${STATUS_COLOR[entry.status]}`}>{entry.status}</span>
                </div>
                <p>{entry.event}</p>
                <p className="text-muted-foreground">{entry.detail}</p>
              </div>
            ))
          )}
        </div>
      </CardContent>
    </Card>
  );
};

export default CommandLog;
