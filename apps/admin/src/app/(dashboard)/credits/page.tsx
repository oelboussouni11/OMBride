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

export default function CreditsPage() {
  const [drivers, setDrivers] = useState<DriverListItem[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    fetchDrivers().then(setDrivers).finally(() => setLoading(false));
  }, []);

  return (
    <div className="space-y-6">
      <h1 className="text-2xl font-bold">Credits & Transactions</h1>
      <p className="text-sm text-zinc-500">
        View driver credit balances. Click a driver to manage their credits.
      </p>

      <Card>
        <CardContent className="p-0">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Driver</TableHead>
                <TableHead>Phone</TableHead>
                <TableHead>Status</TableHead>
                <TableHead>Credit Balance</TableHead>
                <TableHead>Actions</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {loading && (
                <TableRow>
                  <TableCell colSpan={5} className="text-center text-zinc-400">Loading...</TableCell>
                </TableRow>
              )}
              {!loading && drivers.length === 0 && (
                <TableRow>
                  <TableCell colSpan={5} className="text-center text-zinc-400">No drivers found</TableCell>
                </TableRow>
              )}
              {drivers.map((d) => (
                <TableRow key={d.id}>
                  <TableCell className="font-medium">{d.name}</TableCell>
                  <TableCell>{d.phone}</TableCell>
                  <TableCell>
                    <Badge variant={d.status === "verified" ? "success" : d.status === "pending" ? "warning" : "destructive"}>
                      {d.status}
                    </Badge>
                  </TableCell>
                  <TableCell className={d.credit_balance < 5 ? "text-red-600 font-bold" : ""}>
                    {d.credit_balance.toFixed(2)} DH
                  </TableCell>
                  <TableCell>
                    <Link href={`/drivers/${d.id}`}>
                      <Button variant="outline" size="sm">Manage</Button>
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
