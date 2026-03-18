"use client";

import { useEffect, useState } from "react";
import {
  Car,
  CreditCard,
  Route,
  ShieldAlert,
} from "lucide-react";
import {
  Card,
  CardContent,
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

export default function DashboardPage() {
  const [data, setData] = useState<DashboardData | null>(null);
  const [error, setError] = useState("");

  useEffect(() => {
    fetchDashboard().then(setData).catch((e) => setError(e.message));
  }, []);

  if (error) return <p className="text-red-500">{error}</p>;
  if (!data) return <p className="text-zinc-500">Loading...</p>;

  const { stats, recent_rides } = data;

  const statCards = [
    { label: "Rides Today", value: stats.rides_today, icon: Route, desc: `${stats.rides_week} this week` },
    { label: "Revenue (DH)", value: stats.revenue_total.toFixed(2), icon: CreditCard, desc: "Total commission" },
    { label: "Active Drivers", value: stats.active_drivers, icon: Car, desc: "Online & verified" },
    { label: "Pending Verifications", value: stats.pending_verifications, icon: ShieldAlert, desc: "Awaiting review" },
  ];

  return (
    <div className="space-y-6">
      <h1 className="text-2xl font-bold text-zinc-900">Dashboard</h1>

      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
        {statCards.map((s) => (
          <Card key={s.label}>
            <CardHeader className="flex flex-row items-center justify-between pb-2">
              <CardTitle className="text-sm font-medium text-zinc-500">
                {s.label}
              </CardTitle>
              <s.icon className="h-4 w-4 text-zinc-400" />
            </CardHeader>
            <CardContent>
              <div className="text-2xl font-bold">{s.value}</div>
              <p className="text-xs text-zinc-500">{s.desc}</p>
            </CardContent>
          </Card>
        ))}
      </div>

      <Card>
        <CardHeader>
          <CardTitle>Recent Rides</CardTitle>
        </CardHeader>
        <CardContent>
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Rider</TableHead>
                <TableHead>Driver</TableHead>
                <TableHead>Route</TableHead>
                <TableHead>Fare</TableHead>
                <TableHead>Status</TableHead>
                <TableHead>Date</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {recent_rides.length === 0 && (
                <TableRow>
                  <TableCell colSpan={6} className="text-center text-zinc-400">
                    No rides yet
                  </TableCell>
                </TableRow>
              )}
              {recent_rides.map((r) => (
                <TableRow key={r.id}>
                  <TableCell>{r.rider_name}</TableCell>
                  <TableCell>{r.driver_name ?? "—"}</TableCell>
                  <TableCell className="max-w-[200px] truncate">
                    {r.pickup_address} → {r.dropoff_address}
                  </TableCell>
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
