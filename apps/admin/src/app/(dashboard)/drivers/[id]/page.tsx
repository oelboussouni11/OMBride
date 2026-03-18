"use client";

import { useEffect, useState } from "react";
import { useParams } from "next/navigation";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
  Card,
  CardContent,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import {
  fetchDriver,
  verifyDriver,
  topupDriver,
  type DriverDetail,
} from "@/lib/api";

const docStatusVariant: Record<string, "success" | "warning" | "destructive"> = {
  approved: "success",
  pending: "warning",
  rejected: "destructive",
};

export default function DriverDetailPage() {
  const params = useParams();
  const id = params.id as string;
  const [driver, setDriver] = useState<DriverDetail | null>(null);
  const [error, setError] = useState("");
  const [topupAmount, setTopupAmount] = useState("");
  const [topupMethod, setTopupMethod] = useState("cashplus");
  const [topupRef, setTopupRef] = useState("");

  useEffect(() => {
    fetchDriver(id).then(setDriver).catch((e) => setError(e.message));
  }, [id]);

  async function handleVerify(status: string) {
    try {
      await verifyDriver(id, status);
      const updated = await fetchDriver(id);
      setDriver(updated);
    } catch (e: unknown) {
      setError(e instanceof Error ? e.message : "Failed");
    }
  }

  async function handleTopup(e: React.FormEvent) {
    e.preventDefault();
    try {
      await topupDriver(id, parseFloat(topupAmount), topupMethod, topupRef);
      const updated = await fetchDriver(id);
      setDriver(updated);
      setTopupAmount("");
      setTopupRef("");
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : "Failed");
    }
  }

  if (error) return <p className="text-red-500">{error}</p>;
  if (!driver) return <p className="text-zinc-500">Loading...</p>;

  return (
    <div className="space-y-6">
      <h1 className="text-2xl font-bold">{driver.name}</h1>

      {/* Driver Info */}
      <div className="grid gap-4 md:grid-cols-2">
        <Card>
          <CardHeader>
            <CardTitle>Personal Information</CardTitle>
          </CardHeader>
          <CardContent className="space-y-2 text-sm">
            <div className="flex justify-between">
              <span className="text-zinc-500">Phone</span>
              <span>{driver.phone}</span>
            </div>
            <div className="flex justify-between">
              <span className="text-zinc-500">Email</span>
              <span>{driver.email ?? "—"}</span>
            </div>
            <div className="flex justify-between">
              <span className="text-zinc-500">Status</span>
              <Badge variant={docStatusVariant[driver.status] ?? "default"}>
                {driver.status}
              </Badge>
            </div>
            <div className="flex justify-between">
              <span className="text-zinc-500">Online</span>
              <span>{driver.is_available ? "Yes" : "No"}</span>
            </div>
            <div className="flex justify-between">
              <span className="text-zinc-500">Joined</span>
              <span>{new Date(driver.created_at).toLocaleDateString()}</span>
            </div>
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle>Vehicle Information</CardTitle>
          </CardHeader>
          <CardContent className="space-y-2 text-sm">
            <div className="flex justify-between">
              <span className="text-zinc-500">Model</span>
              <span>{driver.vehicle_model}</span>
            </div>
            <div className="flex justify-between">
              <span className="text-zinc-500">Plate</span>
              <span>{driver.plate_number}</span>
            </div>
            <div className="flex justify-between">
              <span className="text-zinc-500">Credit Balance</span>
              <span className="font-bold">{driver.credit_balance.toFixed(2)} DH</span>
            </div>
          </CardContent>
        </Card>
      </div>

      {/* Verification Actions */}
      {driver.status === "pending" && (
        <Card>
          <CardHeader>
            <CardTitle>Verification</CardTitle>
          </CardHeader>
          <CardContent className="flex gap-3">
            <Button onClick={() => handleVerify("verified")}>Approve</Button>
            <Button variant="destructive" onClick={() => handleVerify("rejected")}>
              Reject
            </Button>
          </CardContent>
        </Card>
      )}

      {/* Documents */}
      <Card>
        <CardHeader>
          <CardTitle>Documents</CardTitle>
        </CardHeader>
        <CardContent>
          {driver.documents.length === 0 ? (
            <p className="text-sm text-zinc-400">No documents uploaded yet</p>
          ) : (
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Type</TableHead>
                  <TableHead>Status</TableHead>
                  <TableHead>Uploaded</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {driver.documents.map((doc) => (
                  <TableRow key={doc.id}>
                    <TableCell>{doc.doc_type.replace("_", " ")}</TableCell>
                    <TableCell>
                      <Badge variant={docStatusVariant[doc.status] ?? "default"}>
                        {doc.status}
                      </Badge>
                    </TableCell>
                    <TableCell>
                      {new Date(doc.uploaded_at).toLocaleDateString()}
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          )}
        </CardContent>
      </Card>

      {/* Credit Topup */}
      <Card>
        <CardHeader>
          <CardTitle>Manual Credit Topup</CardTitle>
        </CardHeader>
        <CardContent>
          <form onSubmit={handleTopup} className="flex flex-col gap-3 sm:flex-row sm:items-end">
            <div className="space-y-1">
              <label className="text-xs text-zinc-500">Amount (DH)</label>
              <Input
                type="number"
                step="0.01"
                min="0.01"
                value={topupAmount}
                onChange={(e) => setTopupAmount(e.target.value)}
                placeholder="50.00"
                required
              />
            </div>
            <div className="space-y-1">
              <label className="text-xs text-zinc-500">Payment Method</label>
              <select
                value={topupMethod}
                onChange={(e) => setTopupMethod(e.target.value)}
                className="h-9 rounded-md border border-zinc-200 px-3 text-sm"
              >
                <option value="cashplus">CashPlus</option>
                <option value="wafacash">WafaCash</option>
                <option value="wire">Wire Transfer</option>
              </select>
            </div>
            <div className="space-y-1">
              <label className="text-xs text-zinc-500">Reference Code</label>
              <Input
                value={topupRef}
                onChange={(e) => setTopupRef(e.target.value)}
                placeholder="Optional"
              />
            </div>
            <Button type="submit">Add Credits</Button>
          </form>
        </CardContent>
      </Card>

      {/* Transaction History */}
      <Card>
        <CardHeader>
          <CardTitle>Credit Transactions</CardTitle>
        </CardHeader>
        <CardContent>
          {driver.credit_transactions.length === 0 ? (
            <p className="text-sm text-zinc-400">No transactions yet</p>
          ) : (
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Type</TableHead>
                  <TableHead>Amount</TableHead>
                  <TableHead>Method</TableHead>
                  <TableHead>Reference</TableHead>
                  <TableHead>Date</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {driver.credit_transactions.map((t) => (
                  <TableRow key={t.id}>
                    <TableCell>
                      <Badge variant={t.type === "topup" ? "success" : "destructive"}>
                        {t.type}
                      </Badge>
                    </TableCell>
                    <TableCell className={t.amount >= 0 ? "text-green-600" : "text-red-600"}>
                      {t.amount >= 0 ? "+" : ""}{t.amount.toFixed(2)} DH
                    </TableCell>
                    <TableCell>{t.payment_method ?? "—"}</TableCell>
                    <TableCell>{t.reference_code ?? "—"}</TableCell>
                    <TableCell>
                      {new Date(t.created_at).toLocaleDateString()}
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          )}
        </CardContent>
      </Card>

      {/* Ride History */}
      <Card>
        <CardHeader>
          <CardTitle>Ride History</CardTitle>
        </CardHeader>
        <CardContent>
          {driver.rides.length === 0 ? (
            <p className="text-sm text-zinc-400">No rides yet</p>
          ) : (
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Route</TableHead>
                  <TableHead>Fare</TableHead>
                  <TableHead>Status</TableHead>
                  <TableHead>Date</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {driver.rides.map((r) => (
                  <TableRow key={r.id}>
                    <TableCell className="max-w-[250px] truncate">
                      {r.pickup_address} → {r.dropoff_address}
                    </TableCell>
                    <TableCell>{r.fare != null ? `${r.fare} DH` : "—"}</TableCell>
                    <TableCell>
                      <Badge variant={
                        r.status === "completed" ? "success" :
                        r.status === "cancelled" ? "destructive" : "warning"
                      }>
                        {r.status.replace("_", " ")}
                      </Badge>
                    </TableCell>
                    <TableCell>
                      {new Date(r.created_at).toLocaleDateString()}
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
