"use client";

import { useEffect, useState } from "react";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { fetchFareConfig, updateFareConfig, type FareConfig } from "@/lib/api";

export default function FareConfigPage() {
  const [config, setConfig] = useState<FareConfig | null>(null);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");
  const [success, setSuccess] = useState("");

  const [form, setForm] = useState({
    base_fare: "",
    price_per_km: "",
    price_per_min: "",
    booking_fee: "",
    minimum_fare: "",
    commission_per_ride: "",
  });

  useEffect(() => {
    fetchFareConfig()
      .then((c) => {
        setConfig(c);
        setForm({
          base_fare: c.base_fare.toString(),
          price_per_km: c.price_per_km.toString(),
          price_per_min: c.price_per_min.toString(),
          booking_fee: c.booking_fee.toString(),
          minimum_fare: c.minimum_fare.toString(),
          commission_per_ride: c.commission_per_ride.toString(),
        });
      })
      .catch((e) => setError(e.message))
      .finally(() => setLoading(false));
  }, []);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError("");
    setSuccess("");
    setSaving(true);
    try {
      const updated = await updateFareConfig({
        base_fare: parseFloat(form.base_fare),
        price_per_km: parseFloat(form.price_per_km),
        price_per_min: parseFloat(form.price_per_min),
        booking_fee: parseFloat(form.booking_fee),
        minimum_fare: parseFloat(form.minimum_fare),
        commission_per_ride: parseFloat(form.commission_per_ride),
      });
      setConfig(updated);
      setSuccess("Fare configuration saved successfully");
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : "Failed to save");
    } finally {
      setSaving(false);
    }
  }

  if (loading) return <p className="text-zinc-500">Loading...</p>;

  const fields = [
    { key: "base_fare", label: "Base Fare (DH)" },
    { key: "price_per_km", label: "Price per Kilometer (DH)" },
    { key: "price_per_min", label: "Price per Minute (DH)" },
    { key: "booking_fee", label: "Booking Fee (DH)" },
    { key: "minimum_fare", label: "Minimum Fare (DH)" },
    { key: "commission_per_ride", label: "Commission per Ride (DH)" },
  ] as const;

  return (
    <div className="space-y-6">
      <h1 className="text-2xl font-bold">Fare Configuration</h1>

      {config && (
        <p className="text-sm text-zinc-500">
          Last updated: {new Date(config.updated_at).toLocaleString()}
        </p>
      )}

      <Card className="max-w-xl">
        <CardHeader>
          <CardTitle>Fare Parameters</CardTitle>
        </CardHeader>
        <CardContent>
          <form onSubmit={handleSubmit} className="space-y-4">
            {fields.map((f) => (
              <div key={f.key} className="space-y-1">
                <label htmlFor={f.key} className="text-sm font-medium text-zinc-900">
                  {f.label}
                </label>
                <Input
                  id={f.key}
                  type="number"
                  step="0.01"
                  min="0"
                  value={form[f.key]}
                  onChange={(e) => setForm({ ...form, [f.key]: e.target.value })}
                  required
                />
              </div>
            ))}

            {error && <p className="text-sm text-red-500">{error}</p>}
            {success && <p className="text-sm text-green-600">{success}</p>}

            <Button type="submit" disabled={saving}>
              {saving ? "Saving..." : "Save Configuration"}
            </Button>
          </form>
        </CardContent>
      </Card>
    </div>
  );
}
