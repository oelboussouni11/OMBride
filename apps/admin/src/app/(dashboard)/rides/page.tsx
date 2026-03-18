"use client";

import { useEffect, useState } from "react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { fetchRides, type RideListItem } from "@/lib/api";

const statusVariant: Record<string, "default" | "success" | "warning" | "destructive"> = {
  completed: "success",
  in_progress: "warning",
  arriving: "warning",
  matched: "default",
  requested: "default",
  cancelled: "destructive",
};

const filters = ["all", "requested", "matched", "in_progress", "completed", "cancelled"] as const;

export default function RidesPage() {
  const [rides, setRides] = useState<RideListItem[]>([]);
  const [filter, setFilter] = useState<string>("all");
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    setLoading(true);
    fetchRides(filter === "all" ? undefined : filter)
      .then(setRides)
      .finally(() => setLoading(false));
  }, [filter]);

  return (
    <div className="space-y-6">
      <h1 className="text-2xl font-bold">Rides</h1>

      <div className="flex flex-wrap gap-2">
        {filters.map((f) => (
          <Button
            key={f}
            variant={filter === f ? "default" : "outline"}
            size="sm"
            onClick={() => setFilter(f)}
          >
            {f.replace("_", " ").replace(/\b\w/g, (c) => c.toUpperCase())}
          </Button>
        ))}
      </div>

      <Card>
        <CardContent className="p-0">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Rider</TableHead>
                <TableHead>Driver</TableHead>
                <TableHead>Pickup</TableHead>
                <TableHead>Dropoff</TableHead>
                <TableHead>Fare</TableHead>
                <TableHead>Status</TableHead>
                <TableHead>Date</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {loading && (
                <TableRow>
                  <TableCell colSpan={7} className="text-center text-zinc-400">Loading...</TableCell>
                </TableRow>
              )}
              {!loading && rides.length === 0 && (
                <TableRow>
                  <TableCell colSpan={7} className="text-center text-zinc-400">No rides found</TableCell>
                </TableRow>
              )}
              {rides.map((r) => (
                <TableRow key={r.id}>
                  <TableCell>{r.rider_name}</TableCell>
                  <TableCell>{r.driver_name ?? "—"}</TableCell>
                  <TableCell className="max-w-[150px] truncate">{r.pickup_address}</TableCell>
                  <TableCell className="max-w-[150px] truncate">{r.dropoff_address}</TableCell>
                  <TableCell>{r.fare != null ? `${r.fare} DH` : "—"}</TableCell>
                  <TableCell>
                    <Badge variant={statusVariant[r.status] ?? "default"}>
                      {r.status.replace("_", " ")}
                    </Badge>
                  </TableCell>
                  <TableCell className="text-zinc-500 text-sm">
                    {new Date(r.created_at).toLocaleDateString()}
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </CardContent>
      </Card>
    </div>
  );
}
