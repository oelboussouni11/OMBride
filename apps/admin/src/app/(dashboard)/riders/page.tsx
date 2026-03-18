"use client";

import { useEffect, useState } from "react";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { Card, CardContent } from "@/components/ui/card";
import { fetchRiders, type RiderListItem } from "@/lib/api";

export default function RidersPage() {
  const [riders, setRiders] = useState<RiderListItem[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    fetchRiders().then(setRiders).finally(() => setLoading(false));
  }, []);

  return (
    <div className="space-y-6">
      <h1 className="text-2xl font-bold">Riders</h1>

      <Card>
        <CardContent className="p-0">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Name</TableHead>
                <TableHead>Phone</TableHead>
                <TableHead>Total Rides</TableHead>
                <TableHead>Joined</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {loading && (
                <TableRow>
                  <TableCell colSpan={4} className="text-center text-zinc-400">Loading...</TableCell>
                </TableRow>
              )}
              {!loading && riders.length === 0 && (
                <TableRow>
                  <TableCell colSpan={4} className="text-center text-zinc-400">No riders found</TableCell>
                </TableRow>
              )}
              {riders.map((r) => (
                <TableRow key={r.id}>
                  <TableCell className="font-medium">{r.name}</TableCell>
                  <TableCell>{r.phone}</TableCell>
                  <TableCell>{r.total_rides}</TableCell>
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
