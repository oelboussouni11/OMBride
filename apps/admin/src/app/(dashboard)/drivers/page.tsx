"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
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
import { fetchDrivers, type DriverListItem } from "@/lib/api";
import {
  Users,
  ShieldCheck,
  Clock,
  XCircle,
  Eye,
  Loader2,
  Car,
  Phone,
  CreditCard,
  UserCheck,
  Filter,
} from "lucide-react";

const statusVariant: Record<string, "success" | "warning" | "destructive"> = {
  verified: "success",
  pending: "warning",
  rejected: "destructive",
};

const statusIconMap: Record<string, typeof ShieldCheck> = {
  verified: ShieldCheck,
  pending: Clock,
  rejected: XCircle,
};

const filters = ["all", "pending", "verified", "rejected"] as const;

const filterIcons: Record<string, typeof Users> = {
  all: Users,
  pending: Clock,
  verified: ShieldCheck,
  rejected: XCircle,
};

export default function DriversPage() {
  const [drivers, setDrivers] = useState<DriverListItem[]>([]);
  const [filter, setFilter] = useState<string>("all");
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    setLoading(true);
    fetchDrivers(filter === "all" ? undefined : filter)
      .then(setDrivers)
      .finally(() => setLoading(false));
  }, [filter]);

  return (
    <div className="space-y-8">
      <div>
        <h1 className="text-2xl font-bold text-zinc-900 flex items-center gap-2">
          <Users className="h-6 w-6 text-zinc-500" />
          Drivers
        </h1>
        <p className="text-sm text-zinc-500 mt-1">
          Manage and review driver accounts
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
              {f.charAt(0).toUpperCase() + f.slice(1)}
            </Button>
          );
        })}
        {!loading && (
          <Badge variant="secondary" className="ml-auto text-xs">
            {drivers.length} driver{drivers.length !== 1 ? "s" : ""}
          </Badge>
        )}
      </div>

      <Card>
        <CardHeader className="pb-4">
          <CardTitle className="text-base flex items-center gap-2">
            <Car className="h-4 w-4 text-zinc-400" />
            Driver List
          </CardTitle>
          <CardDescription>
            {filter === "all"
              ? "Showing all drivers"
              : `Filtered by: ${filter}`}
          </CardDescription>
        </CardHeader>
        <CardContent className="p-0">
          <div className="overflow-hidden">
            <Table>
              <TableHeader>
                <TableRow className="bg-zinc-50/80 hover:bg-zinc-50/80">
                  <TableHead className="font-semibold text-zinc-700">Name</TableHead>
                  <TableHead className="font-semibold text-zinc-700">
                    <span className="flex items-center gap-1">
                      <Phone className="h-3 w-3" />
                      Phone
                    </span>
                  </TableHead>
                  <TableHead className="font-semibold text-zinc-700">
                    <span className="flex items-center gap-1">
                      <Car className="h-3 w-3" />
                      Vehicle
                    </span>
                  </TableHead>
                  <TableHead className="font-semibold text-zinc-700">Plate</TableHead>
                  <TableHead className="font-semibold text-zinc-700">Status</TableHead>
                  <TableHead className="font-semibold text-zinc-700">
                    <span className="flex items-center gap-1">
                      <CreditCard className="h-3 w-3" />
                      Credits (DH)
                    </span>
                  </TableHead>
                  <TableHead className="font-semibold text-zinc-700">Actions</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {loading && (
                  <TableRow>
                    <TableCell colSpan={7} className="text-center py-16">
                      <div className="flex flex-col items-center gap-3">
                        <Loader2 className="h-6 w-6 animate-spin text-zinc-400" />
                        <p className="text-zinc-400 text-sm">Loading drivers...</p>
                      </div>
                    </TableCell>
                  </TableRow>
                )}
                {!loading && drivers.length === 0 && (
                  <TableRow>
                    <TableCell colSpan={7} className="text-center py-16">
                      <div className="flex flex-col items-center gap-3">
                        <Users className="h-8 w-8 text-zinc-300" />
                        <p className="text-zinc-400 text-sm">No drivers found</p>
                        <p className="text-zinc-300 text-xs">
                          Try changing the filter above
                        </p>
                      </div>
                    </TableCell>
                  </TableRow>
                )}
                {drivers.map((d, idx) => {
                  const StatusIcon = statusIconMap[d.status] ?? UserCheck;
                  return (
                    <TableRow
                      key={d.id}
                      className={`${idx % 2 === 0 ? "bg-white" : "bg-zinc-50/50"} hover:bg-zinc-100/50 transition-colors`}
                    >
                      <TableCell className="font-medium">
                        <div className="flex items-center gap-2">
                          <div className="h-8 w-8 rounded-full bg-zinc-100 flex items-center justify-center text-xs font-bold text-zinc-600">
                            {d.name
                              .split(" ")
                              .map((n: string) => n[0])
                              .join("")
                              .slice(0, 2)
                              .toUpperCase()}
                          </div>
                          {d.name}
                        </div>
                      </TableCell>
                      <TableCell className="text-zinc-600 font-mono text-sm">
                        {d.phone}
                      </TableCell>
                      <TableCell className="text-zinc-600">{d.vehicle_model}</TableCell>
                      <TableCell>
                        <code className="bg-zinc-100 px-2 py-0.5 rounded text-xs font-mono">
                          {d.plate_number}
                        </code>
                      </TableCell>
                      <TableCell>
                        <Badge variant={statusVariant[d.status] ?? "default"} className="gap-1">
                          <StatusIcon className="h-3 w-3" />
                          {d.status}
                        </Badge>
                      </TableCell>
                      <TableCell>
                        <span className="font-semibold">{d.credit_balance.toFixed(2)}</span>
                      </TableCell>
                      <TableCell>
                        <Link href={`/drivers/${d.id}`}>
                          <Button variant="outline" size="sm" className="gap-1.5">
                            <Eye className="h-3.5 w-3.5" />
                            View
                          </Button>
                        </Link>
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
