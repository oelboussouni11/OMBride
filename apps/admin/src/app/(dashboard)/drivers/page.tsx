"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
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
import { fetchDrivers, type DriverListItem } from "@/lib/api";

const statusVariant: Record<string, "success" | "warning" | "destructive"> = {
  verified: "success",
  pending: "warning",
  rejected: "destructive",
};

const filters = ["all", "pending", "verified", "rejected"] as const;

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
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <h1 className="text-2xl font-bold">Drivers</h1>
      </div>

      <div className="flex flex-wrap gap-2">
        {filters.map((f) => (
          <Button
            key={f}
            variant={filter === f ? "default" : "outline"}
            size="sm"
            onClick={() => setFilter(f)}
          >
            {f.charAt(0).toUpperCase() + f.slice(1)}
          </Button>
        ))}
      </div>

      <Card>
        <CardContent className="p-0">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Name</TableHead>
                <TableHead>Phone</TableHead>
                <TableHead>Vehicle</TableHead>
                <TableHead>Plate</TableHead>
                <TableHead>Status</TableHead>
                <TableHead>Credits (DH)</TableHead>
                <TableHead>Actions</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {loading && (
                <TableRow>
                  <TableCell colSpan={7} className="text-center text-zinc-400">
                    Loading...
                  </TableCell>
                </TableRow>
              )}
              {!loading && drivers.length === 0 && (
                <TableRow>
                  <TableCell colSpan={7} className="text-center text-zinc-400">
                    No drivers found
                  </TableCell>
                </TableRow>
              )}
              {drivers.map((d) => (
                <TableRow key={d.id}>
                  <TableCell className="font-medium">{d.name}</TableCell>
                  <TableCell>{d.phone}</TableCell>
                  <TableCell>{d.vehicle_model}</TableCell>
                  <TableCell>{d.plate_number}</TableCell>
                  <TableCell>
                    <Badge variant={statusVariant[d.status] ?? "default"}>
                      {d.status}
                    </Badge>
                  </TableCell>
                  <TableCell>{d.credit_balance.toFixed(2)}</TableCell>
                  <TableCell>
                    <Link href={`/drivers/${d.id}`}>
                      <Button variant="outline" size="sm">
                        View
                      </Button>
                    </Link>
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
