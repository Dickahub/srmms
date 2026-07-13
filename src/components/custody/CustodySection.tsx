import { useState } from "react";
import { MapPin, User } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import {
  Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle, DialogTrigger,
} from "@/components/ui/dialog";
import { useLocations } from "@/hooks/use-locations";
import type { LocationHistoryEntry } from "@/hooks/use-location-history";

type Props = {
  location: { id: string; name: string; code: string | null } | null;
  holder: { id: string; name: string } | null;
  heldSince: string | null;
  canRetrieve: boolean;
  canPlace: boolean;
  retrieveDisabledReason?: string;
  onRetrieve: () => void;
  onPlace: (locationId: string) => void;
  retrieving?: boolean;
  placing?: boolean;
  history: LocationHistoryEntry[] | undefined;
  historyLoading?: boolean;
};

export function CustodySection({
  location, holder, heldSince, canRetrieve, canPlace, retrieveDisabledReason,
  onRetrieve, onPlace, retrieving, placing, history, historyLoading,
}: Props) {
  const [placeOpen, setPlaceOpen] = useState(false);
  const [locationId, setLocationId] = useState("");
  const { data: locations } = useLocations();

  return (
    <Card>
      <CardHeader className="flex flex-row items-center justify-between space-y-0">
        <CardTitle className="text-base">Custody</CardTitle>
        <div className="flex gap-2">
          {canRetrieve && (
            <Button
              size="sm"
              variant="outline"
              disabled={retrieving || !!retrieveDisabledReason}
              title={retrieveDisabledReason}
              onClick={onRetrieve}
            >
              {retrieving ? "Retrieving…" : "Retrieve"}
            </Button>
          )}
          {canPlace && (
            <Dialog open={placeOpen} onOpenChange={(v) => { setPlaceOpen(v); if (!v) setLocationId(""); }}>
              <DialogTrigger asChild>
                <Button size="sm">Place in location</Button>
              </DialogTrigger>
              <DialogContent>
                <DialogHeader><DialogTitle>Place in location</DialogTitle></DialogHeader>
                <Select value={locationId} onValueChange={setLocationId}>
                  <SelectTrigger><SelectValue placeholder="Select a location" /></SelectTrigger>
                  <SelectContent>
                    {(locations ?? []).map((l) => (
                      <SelectItem key={l.id} value={l.id}>{l.code ? `${l.code} — ${l.name}` : l.name}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
                <DialogFooter>
                  <Button variant="ghost" onClick={() => setPlaceOpen(false)}>Cancel</Button>
                  <Button
                    disabled={!locationId || placing}
                    onClick={() => {
                      onPlace(locationId);
                      setPlaceOpen(false);
                      setLocationId("");
                    }}
                  >
                    {placing ? "Saving…" : "Place"}
                  </Button>
                </DialogFooter>
              </DialogContent>
            </Dialog>
          )}
        </div>
      </CardHeader>
      <CardContent className="space-y-4">
        <div className="flex items-center gap-2 text-sm">
          {holder ? (
            <>
              <User className="h-4 w-4 text-muted-foreground" />
              Held by <span className="font-medium">{holder.name}</span>
              {heldSince && <span className="text-muted-foreground">since {new Date(heldSince).toLocaleDateString()}</span>}
            </>
          ) : location ? (
            <>
              <MapPin className="h-4 w-4 text-muted-foreground" />
              Location: <span className="font-medium">{location.code || location.name}</span>
            </>
          ) : (
            <span className="text-muted-foreground">No location or holder recorded.</span>
          )}
        </div>

        <div>
          <div className="mb-2 text-xs font-medium uppercase tracking-wide text-muted-foreground">History</div>
          {historyLoading ? (
            <p className="text-sm text-muted-foreground">Loading…</p>
          ) : !history || history.length === 0 ? (
            <p className="text-sm text-muted-foreground">No movements recorded yet.</p>
          ) : (
            <ul className="space-y-2">
              {history.map((h) => (
                <li key={h.id} className="text-sm">
                  <span className="font-medium capitalize">{h.movement_type}</span>
                  {h.location && ` — ${h.location.code || h.location.name}`}
                  <span className="text-muted-foreground"> · {h.mover?.name ?? "Unknown"} · {new Date(h.moved_at).toLocaleString()}</span>
                </li>
              ))}
            </ul>
          )}
        </div>
      </CardContent>
    </Card>
  );
}
