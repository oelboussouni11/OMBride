"use client";

import { useEffect, useState } from "react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { fetchRides, type RideListItem } from "@/lib/api";
import {
  Activity,
  ArrowRight,
  CheckCircle2,
  Clock,
  Filter,
  Loader2,
  MapPin,
  Navigation,
  Route,
  XCircle,
  Zap,
  Car,
  User,
  CreditCard,
  CalendarDays,
} from "lucide-react";

const statusVariant: Record<string, "default" | "success" | "warning" | "destructive"> = {
  completed: "success",
  in_progress: "warning",
  arriving: "warning",
  matched: "default",
  requested: "default",
  cancelled: "destructive",
};

const statusColors: Record<string, string> = {
  completed: "bg-emerald-50 text-emerald-700 border-emerald-200",
  in_progress: "bg-blue-50 text-blue-700 border-blue-200",
  arriving: "bg-amber-50 text-amber-700 border-amber-200",
  matched: "bg-violet-50 text-violet-700 border-violet-200",
  requested: "bg-sky-50 text-sky-700 border-sky-200",
  cancelled: "bg-red-50 text-red-700 border-red-200",
};

const statusIconMap: Record<string, typeof Activity> = {
  completed: CheckCircle2,
  in_progress: Navigation,
  arriving: Car,
  matched: Zap,
  requested: Clock,
  cancelled: XCircle,
};

const filters = ["all", "requested", "matched", "in_progress", "completed", "cancelled"] as const;

const filterIcons: Record<string, typeof Activity> = {
  all: Route,
  requested: Clock,
  matched: Zap,
  in_progress: Navigation,
  completed: CheckCircle2,
  cancelled: XCircle,
};

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
    <div className="space-y-8">
      <div>
        <h1 className="text-2xl font-bold text-zinc-900 flex items-center gap-2">
          <Route className="h-6 w-6 text-zinc-500" />
          Rides
        </h1>
        <p className="text-sm text-zinc-500 mt-1">
          Track and manage all ride requests
        </p>
      </div>

      <div className="flex flex-wrap items-center gap-2">
        <Filter className="h-4 w-4 text-zinc-400 mr-1" />
        {filters.map((f) => {
          const Icon = filterIcons[f];
          return (
            <Button
              key={f}
              variant={filter === f ? "default" : "outline"}
              size="sm"
              onClick={() => setFilter(f)}
              className="gap-1.5"
            >
              <Icon className="h-3.5 w-3.5" />
              {f.replace("_", " ").replace(/\b\w/g, (c) => c.toUpperCase())}
            </Button>
          );
        })}
        {!loading && (
          <Badge variant="secondary" className="ml-auto text-xs">
            {rides.length} ride{rides.length !== 1 ? "s" : ""}
          </Badge>
        )}
      </div>

      <Card>
        <CardHeader className="pb-4">
          <CardTitle className="text-base flex items-center gap-2">
            <Activity className="h-4 w-4 text-zinc-400" />
            Ride History
          </CardTitle>
          <CardDescription>
            {filter === "all"
              ? "Showing all rides"
              : `Filtered by: ${filter.replace("_", " ")}`}
          </CardDescription>
        </CardHeader>
        <CardContent className="p-0">
          <div className="overflow-hidden">
            <Table>
              <TableHeader>
                <TableRow className="bg-zinc-50/80 hover:bg-zinc-50/80">
                  <TableHead className="font-semibold text-zinc-700">
                    <span className="flex items-center gap-1">
                      <User className="h-3 w-3" />
                      Rider
                    </span>
                  </TableHead>
                  <TableHead className="font-semibold text-zinc-700">
                    <span className="flex items-center gap-1">
                      <Car className="h-3 w-3" />
                      Driver
                    </span>
                  </TableHead>
                  <TableHead className="font-semibold text-zinc-700">
                    <span className="flex items-center gap-1">
                      <MapPin className="h-3 w-3" />
                      Pickup
                    </span>
                  </TableHead>
                  <TableHead className="font-semibold text-zinc-700">
                    <span className="flex items-center gap-1">
                      <ArrowRight className="h-3 w-3" />
                      Dropoff
                    </span>
                  </TableHead>
                  <TableHead className="font-semibold text-zinc-700">
                    <span className="flex items-center gap-1">
                      <CreditCard className="h-3 w-3" />
                      Fare
                    </span>
                  </TableHead>
                  <TableHead className="font-semibold text-zinc-700">Status</TableHead>
                  <TableHead className="font-semibold text-zinc-700">
                    <span className="flex items-center gap-1">
                      <CalendarDays className="h-3 w-3" />
                      Date
                    </span>
                  </TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {loading && (
                  <TableRow>
                    <TableCell colSpan={7} className="text-center py-16">
                      <div className="flex flex-col items-center gap-3">
                        <Loader2 className="h-6 w-6 animate-spin text-zinc-400" />
                        <p className="text-zinc-400 text-sm">Loading rides...</p>
                      </div>
                    </TableCell>
                  </TableRow>
                )}
                {!loading && rides.length === 0 && (
                  <TableRow>
                    <TableCell colSpan={7} className="text-center py-16">
                      <div className="flex flex-col items-center gap-3">
                        <Route className="h-8 w-8 text-zinc-300" />
                        <p className="text-zinc-400 text-sm">No rides found</p>
                        <p className="text-zinc-300 text-xs">
                          Try changing the filter above
                        </p>
                      </div>
                    </TableCell>
                  </TableRow>
                )}
                {rides.map((r, idx) => {
                  const StatusIcon = statusIconMap[r.status] ?? Activity;
                  const colorClasses = statusColors[r.status] ?? "";
                  return (
                    <TableRow
                      key={r.id}
                      className={`${idx % 2 === 0 ? "bg-white" : "bg-zinc-50/50"} hover:bg-zinc-100/50 transition-colors`}
                    >
                      <TableCell className="font-medium">{r.rider_name}</TableCell>
                      <TableCell className="text-zinc-600">
                        {r.driver_name ?? (
                          <span className="text-zinc-300 italic">Unassigned</span>
                        )}
                      </TableCell>
                      <TableCell className="max-w-[160px]">
                        <div className="flex items-center gap-1.5">
                          <MapPin className="h-3 w-3 text-green-500 shrink-0" />
                          <span className="truncate text-sm">{r.pickup_address}</span>
                        </div>
                      </TableCell>
                      <TableCell className="max-w-[160px]">
                        <div className="flex items-center gap-1.5">
                          <MapPin className="h-3 w-3 text-red-500 shrink-0" />
                          <span className="truncate text-sm text-zinc-500">{r.dropoff_address}</span>
                        </div>
                      </TableCell>
                      <TableCell>
                        {r.fare != null ? (
                          <span className="font-semibold text-zinc-900">{r.fare} DH</span>
                        ) : (
                          <span className="text-zinc-300">--</span>
                        )}
                      </TableCell>
                      <TableCell>
                        <span
                          className={`inline-flex items-center gap-1 rounded-full border px-2.5 py-0.5 text-xs font-semibold ${colorClasses}`}
                        >
                          <StatusIcon className="h-3 w-3" />
                          {r.status.replace("_", " ")}
                        </span>
                      </TableCell>
                      <TableCell className="text-zinc-500 text-sm">
                        <div className="flex items-center gap-1">
                          <Clock className="h-3 w-3" />
                          {new Date(r.created_at).toLocaleDateString()}
                        </div>
                      </TableCell>
                    </TableRow>
                  );
                })}
              </TableBody>
            </Table>
          </div>
        </CardContent>
      </Card>
    </div>
  );
}
