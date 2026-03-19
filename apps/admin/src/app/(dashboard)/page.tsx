"use client";

import { useEffect, useState } from "react";
import {
  Car,
  CreditCard,
  Route,
  ShieldAlert,
  TrendingUp,
  Clock,
  MapPin,
  ArrowRight,
  Activity,
  Loader2,
  AlertCircle,
} from "lucide-react";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import {
  fetchDashboard,
  type DashboardData,
} from "@/lib/api";

const statusVariant: Record<string, "default" | "success" | "warning" | "destructive"> = {
  completed: "success",
  in_progress: "warning",
  arriving: "warning",
  matched: "default",
  requested: "default",
  cancelled: "destructive",
};

const statusIcon: Record<string, typeof Activity> = {
  completed: TrendingUp,
  in_progress: Activity,
  arriving: MapPin,
  matched: ArrowRight,
  requested: Clock,
  cancelled: AlertCircle,
};

export default function DashboardPage() {
  const [data, setData] = useState<DashboardData | null>(null);
  const [error, setError] = useState("");

  useEffect(() => {
    fetchDashboard().then(setData).catch((e) => setError(e.message));
  }, []);

  if (error)
    return (
      <div className="flex items-center justify-center min-h-[400px]">
        <Card className="max-w-md w-full border-red-200 bg-red-50">
          <CardContent className="flex flex-col items-center gap-3 py-8">
            <AlertCircle className="h-10 w-10 text-red-500" />
            <p className="text-red-700 font-medium text-center">{error}</p>
          </CardContent>
        </Card>
      </div>
    );

  if (!data)
    return (
      <div className="flex items-center justify-center min-h-[400px]">
        <div className="flex flex-col items-center gap-3">
          <Loader2 className="h-8 w-8 animate-spin text-zinc-400" />
          <p className="text-zinc-500 text-sm">Loading dashboard...</p>
        </div>
      </div>
    );

  const { stats, recent_rides } = data;

  const statCards = [
    {
      label: "Rides Today",
      value: stats.rides_today,
      icon: Route,
      desc: `${stats.rides_week} this week`,
      color: "text-blue-600",
      bg: "bg-blue-50",
    },
    {
      label: "Revenue (DH)",
      value: stats.revenue_total.toFixed(2),
      icon: CreditCard,
      desc: "Total commission",
      color: "text-emerald-600",
      bg: "bg-emerald-50",
    },
    {
      label: "Active Drivers",
      value: stats.active_drivers,
      icon: Car,
      desc: "Online & verified",
      color: "text-violet-600",
      bg: "bg-violet-50",
    },
    {
      label: "Pending Verifications",
      value: stats.pending_verifications,
      icon: ShieldAlert,
      desc: "Awaiting review",
      color: "text-amber-600",
      bg: "bg-amber-50",
    },
  ];

  return (
    <div className="space-y-8">
      <div>
        <h1 className="text-2xl font-bold text-zinc-900">Dashboard</h1>
        <p className="text-sm text-zinc-500 mt-1">
          Overview of your ride-hailing platform
        </p>
      </div>

      <div className="grid gap-5 sm:grid-cols-2 lg:grid-cols-4">
        {statCards.map((s) => (
          <Card key={s.label} className="hover:shadow-md transition-shadow">
            <CardHeader className="flex flex-row items-center justify-between pb-2">
              <CardTitle className="text-sm font-medium text-zinc-500">
                {s.label}
              </CardTitle>
              <div className={`${s.bg} rounded-lg p-2`}>
                <s.icon className={`h-4 w-4 ${s.color}`} />
              </div>
            </CardHeader>
            <CardContent>
              <div className="text-3xl font-bold tracking-tight">{s.value}</div>
              <p className="text-xs text-zinc-500 mt-1 flex items-center gap-1">
                <TrendingUp className="h-3 w-3" />
                {s.desc}
              </p>
            </CardContent>
          </Card>
        ))}
      </div>

      <Card>
        <CardHeader className="pb-4">
          <div className="flex items-center justify-between">
            <div>
              <CardTitle className="flex items-center gap-2">
                <Activity className="h-5 w-5 text-zinc-500" />
                Recent Rides
              </CardTitle>
              <CardDescription className="mt-1">
                Latest ride activity across the platform
              </CardDescription>
            </div>
            <Badge variant="secondary" className="text-xs">
              {recent_rides.length} rides
            </Badge>
          </div>
        </CardHeader>
        <CardContent>
          <div className="rounded-lg border border-zinc-100 overflow-hidden">
            <Table>
              <TableHeader>
                <TableRow className="bg-zinc-50/80 hover:bg-zinc-50/80">
                  <TableHead className="font-semibold text-zinc-700">Rider</TableHead>
                  <TableHead className="font-semibold text-zinc-700">Driver</TableHead>
                  <TableHead className="font-semibold text-zinc-700">Route</TableHead>
                  <TableHead className="font-semibold text-zinc-700">Fare</TableHead>
                  <TableHead className="font-semibold text-zinc-700">Status</TableHead>
                  <TableHead className="font-semibold text-zinc-700">Date</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {recent_rides.length === 0 && (
                  <TableRow>
                    <TableCell colSpan={6} className="text-center py-12">
                      <div className="flex flex-col items-center gap-2">
                        <Route className="h-8 w-8 text-zinc-300" />
                        <p className="text-zinc-400 text-sm">No rides yet</p>
                      </div>
                    </TableCell>
                  </TableRow>
                )}
                {recent_rides.map((r, idx) => {
                  const StatusIcon = statusIcon[r.status] ?? Activity;
                  return (
                    <TableRow
                      key={r.id}
                      className={idx % 2 === 0 ? "bg-white" : "bg-zinc-50/50"}
                    >
                      <TableCell className="font-medium">{r.rider_name}</TableCell>
                      <TableCell className="text-zinc-600">
                        {r.driver_name ?? (
                          <span className="text-zinc-300 italic">Unassigned</span>
                        )}
                      </TableCell>
                      <TableCell className="max-w-[200px]">
                        <div className="flex items-center gap-1.5 text-sm">
                          <MapPin className="h-3 w-3 text-green-500 shrink-0" />
                          <span className="truncate">{r.pickup_address}</span>
                        </div>
                        <div className="flex items-center gap-1.5 text-sm mt-0.5">
                          <MapPin className="h-3 w-3 text-red-500 shrink-0" />
                          <span className="truncate text-zinc-500">{r.dropoff_address}</span>
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
                        <Badge
                          variant={statusVariant[r.status] ?? "default"}
                          className="gap-1"
                        >
                          <StatusIcon className="h-3 w-3" />
                          {r.status.replace("_", " ")}
                        </Badge>
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
